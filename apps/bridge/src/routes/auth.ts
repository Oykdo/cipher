import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID, createHash } from 'crypto';
import * as bip39 from 'bip39';
import * as argon2 from 'argon2';
import * as srp from 'secure-remote-password/server.js';
import { getDatabase } from '../db/database.js';
import { createRefreshToken, validateRefreshToken, revokeRefreshToken, revokeAllUserTokens } from '../utils/refreshToken.js';
import { logAuthAction } from '../utils/auditLog.js';
// SECURITY: decryptMnemonic removed - client decrypts locally with masterKey
import { generateAuthResponse } from '../utils/authResponse.js';
import { UsernameSchema, AvatarHashSchema, UserIdSchema } from '../validation/securitySchemas.js';

const db = getDatabase();

function isUsernameUniqueViolation(err: any): boolean {
  return (
    err?.code === '23505' &&
    (err?.constraint === 'users_username_key' ||
      String(err?.message || '').includes('users_username_key') ||
      String(err?.detail || '').includes('(username)=') ||
      String(err?.detail || '').toLowerCase().includes('username'))
  );
}

// ============================================================================
// SECURITY FIX VULN-006: Server-side SRP session storage
// Never send server ephemeral secrets to the client
// ============================================================================
interface SrpSession {
  userId: string;
  b: string; // Server secret ephemeral - NEVER sent to client
  B: string; // Server public ephemeral
  A: string; // Client public ephemeral
  expiresAt: number;
}

const srpSessions = new Map<string, SrpSession>();

// Cleanup expired SRP sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of srpSessions.entries()) {
    if (session.expiresAt < now) {
      srpSessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000);

interface SignupBody {
  username: string;
  method: 'standard' | 'dice-key';
  mnemonicLength?: 12 | 24;
  masterKeyHex?: string;
  mnemonic?: string[];
  avatarHash?: string; // Hash SHA-256 du fichier avatar .blend
  checksums?: string[]; // DiceKey checksums (30 hex strings)
  // DiceKey specific fields
  identityPublicKey?: string;
  signaturePublicKey?: string;
  signedPreKey?: {
    keyId: number;
    publicKey: string;
    secretKey?: string;
    signature: string;
    timestamp: number;
  };
  oneTimePreKeys?: Array<{
    keyId: number;
    publicKey: string;
    secretKey?: string;
  }>;
  srpSalt?: string;
  srpVerifier?: string;
}

export async function authRoutes(fastify: FastifyInstance) {
  // Signup endpoint - Standard (BIP-39) or DiceKey
  fastify.post<{ Body: SignupBody }>(
    '/api/v2/auth/signup',
    {
      config: { rateLimit: fastify.signupLimiter as any },
    },
    async (request, reply) => {
      const body = request.body;

      // Validate username using Zod schema
      const usernameValidation = UsernameSchema.safeParse(body.username);
      if (!usernameValidation.success) {
        reply.code(400);
        return { error: usernameValidation.error.errors[0].message };
      }

      const username = usernameValidation.data.toLowerCase();

      if (await db.getUserByUsername(username)) {
        reply.code(409);
        return { error: 'Nom d\'utilisateur déjà utilisé' };
      }

      // Standard (BIP-39) signup
      if (body.method === 'standard') {
        const length = body.mnemonicLength === 24 ? 24 : 12;
        const strength = length === 24 ? 256 : 128;
        const mnemonicArray = bip39.generateMnemonic(strength).split(' ');

        // Derive masterKey from mnemonic using BIP-39 seed
        const mnemonicString = mnemonicArray.join(' ');
        const seed = await bip39.mnemonicToSeed(mnemonicString);

        // Create masterKeyHex from seed (first 32 bytes)
        const masterKeyHex = seed.subarray(0, 32).toString('hex');

        // ✅ Don't hash here - let createUser handle encryption and hashing
        try {
          const user = await db.createUser({
            id: randomUUID(),
            username,
            security_tier: 'standard',
            mnemonic: JSON.stringify(mnemonicArray),
            master_key_hex: masterKeyHex, // ✅ Pass plaintext for encryption
            srp_salt: body.srpSalt,
            srp_verifier: body.srpVerifier,
          });

          return generateAuthResponse(reply, request, user, {
            flat: true,
            mnemonic: mnemonicArray,
            masterKeyHex, // Return unhashed version for frontend to store locally
          });
        } catch (error: any) {
          request.log.error({ error, username }, 'Signup failed during user creation');
          if (isUsernameUniqueViolation(error)) {
            reply.code(409);
            return { error: "Nom d'utilisateur déjà utilisé" };
          }

          reply.code(500);
          return { error: "Erreur lors de la création de l'utilisateur: " + error.message };
        }
      }

      // DiceKey signup (enhanced with public keys)
      if (!body.masterKeyHex) {
        reply.code(400);
        return { error: 'masterKeyHex requis pour DiceKey' };
      }

      if (!/^[a-zA-Z0-9+/=]+$/i.test(body.masterKeyHex)) {
        reply.code(400);
        return { error: 'masterKeyHex invalide (format Base64 attendu)' };
      }

      // Validate required public keys
      if (!body.identityPublicKey || !body.signaturePublicKey) {
        reply.code(400);
        return { error: 'Clés publiques Identity et Signature requises' };
      }

      if (!body.signedPreKey || !body.oneTimePreKeys || body.oneTimePreKeys.length === 0) {
        reply.code(400);
        return { error: 'Signed Pre-Key et One-Time Pre-Keys requis' };
      }


      // Store mnemonic as empty array for DiceKey (not stored on server)
      const mnemonicPlaceholder = ['[DiceKey-300-rolls]', '[Not-Stored-On-Server]'];

      // Derive User ID from Identity Public Key (Deterministic)
      // Must match frontend logic: SHA-256(IdentityPubKey)[0..6] -> Hex
      const identityKeyBuffer = Buffer.from(body.identityPublicKey, 'base64');
      const idHash = createHash('sha256').update(identityKeyBuffer).digest();
      const derivedUserId = idHash.subarray(0, 6).toString('hex');

      let user;
      try {
        user = await db.createUser({
          id: derivedUserId, // ✅ Use derived ID instead of randomUUID()
          username,
          security_tier: 'dice-key',
          mnemonic: JSON.stringify(mnemonicPlaceholder),
          master_key_hex: body.masterKeyHex,
          srp_salt: body.srpSalt,
          srp_verifier: body.srpVerifier,
          dicekey_checksums: body.checksums || null, // Store encrypted checksums
        });
      } catch (error: any) {
        request.log.error({ error, username }, 'DiceKey Signup failed during user creation');
        if (isUsernameUniqueViolation(error)) {
          reply.code(409);
          return { error: "Nom d'utilisateur déjà utilisé" };
        }

        reply.code(500);
        return { error: 'Erreur lors de la création du compte DiceKey: ' + error.message };
      }

      // Store avatar hash if provided (for avatar login)
      if (body.avatarHash) {
        // Validate avatar hash format
        const avatarHashValidation = AvatarHashSchema.safeParse(body.avatarHash);
        if (!avatarHashValidation.success) {
          fastify.log.warn({ userId: user.id }, 'Invalid avatar hash format provided');
          // Don't fail signup, just skip avatar hash storage
        } else {
          try {
            await db.updateUserAvatarHash(user.id, avatarHashValidation.data);
            fastify.log.info({ userId: user.id, avatarHashPrefix: avatarHashValidation.data.substring(0, 16) }, 'Avatar hash stored for DiceKey user');
          } catch (error) {
            fastify.log.error({ error, userId: user.id }, 'Failed to store avatar hash');
            // Don't fail signup if avatar hash storage fails
          }
        }
      }

      // Store public keys in database
      try {
        // Generate fingerprints (first 12 chars of base64)
        const identityFingerprint = body.identityPublicKey.substring(0, 12);
        const signatureFingerprint = body.signaturePublicKey.substring(0, 12);

        // Store Identity Key
        await db.saveIdentityKey(user.id, body.identityPublicKey, identityFingerprint);

        // Store Signature Key
        await db.saveSignatureKey(user.id, body.signaturePublicKey, signatureFingerprint);

        // Store Signed Pre-Key
        await db.saveSignedPreKey(
          user.id,
          body.signedPreKey.keyId,
          body.signedPreKey.publicKey,
          body.signedPreKey.signature,
          body.signedPreKey.timestamp
        );

        // Store One-Time Pre-Keys
        await db.saveOneTimePreKeys(user.id, body.oneTimePreKeys.map(k => ({
          keyId: k.keyId,
          publicKey: k.publicKey,
          privateKey: '' // privateKey not stored on server
        })));

        fastify.log.info({
          userId: user.id,
          identityFingerprint,
          signatureFingerprint,
          signedPreKeyId: body.signedPreKey.keyId,
          oneTimePreKeysCount: body.oneTimePreKeys.length,
        }, 'DiceKey account created and keys stored in database');
      } catch (error) {
        fastify.log.error({ error, userId: user.id }, 'Failed to store DiceKey public keys');
        // Don't fail signup if key storage fails (keys were logged for recovery)
      }

      return generateAuthResponse(reply, request, user, {
        flat: true,
        message: 'Compte DiceKey créé avec succès. Conservez vos 300 lancers de dés.',
      });
    }
  );

  // ============================================================================
  // SECURITY: Legacy login endpoints REMOVED
  // MasterKey must NEVER be sent to the server!
  // Use SRP (/api/v2/auth/srp/login/*) or Avatar login instead.
  // ============================================================================

  // Legacy endpoint kept for backward compatibility but returns error
  fastify.post<{ Body: { username: string; masterKeyHash: string } }>(
    '/api/v2/auth/login',
    {
      config: { rateLimit: fastify.loginLimiter as any },
    },
    async (_request, reply) => {
      reply.code(410); // Gone
      return { 
        error: 'This endpoint has been removed for security reasons. Use SRP login (/api/v2/auth/srp/login/init) instead.',
        migration: 'masterKey must never be sent to the server. Use zero-knowledge SRP authentication.'
      };
    }
  );

  // Legacy DiceKey login - REMOVED for security
  fastify.post<{ Body: { identityPublicKey: string; masterKeyHex: string } }>(
    '/api/v2/auth/login-dicekey',
    {
      config: { rateLimit: fastify.loginLimiter as any },
    },
    async (_request, reply) => {
      reply.code(410); // Gone
      return { 
        error: 'This endpoint has been removed for security reasons. Use SRP login instead.',
        migration: 'masterKey must never be sent to the server. Use zero-knowledge SRP authentication.'
      };
    }
  );

  // Login with Avatar File
  fastify.post(
    '/api/v2/auth/login-with-avatar',
    {
      config: { rateLimit: fastify.loginLimiter as any },
    },
    async (request, reply) => {
      const data = await request.file();
      if (!data) {
        reply.code(400);
        return { error: 'Fichier requis' };
      }

      try {
        const buffer = await data.toBuffer();
        const hash = createHash('sha256').update(buffer).digest('hex');

        // SECURITY FIX VULN-010: Don't log the hash - it's an authentication credential
        request.log.info({
          filename: data.filename,
          fileSize: buffer.length,
          // Hash is intentionally NOT logged for security
        }, 'Avatar file received for login');

        const user = await db.getUserByAvatarHash(hash);
        if (!user) {
          // SECURITY FIX VULN-010: Don't log the hash in failure case either
          request.log.warn({
            fileSize: buffer.length,
            // Hash is intentionally NOT logged for security
          }, 'No user found with matching avatar hash');

          await logAuthAction(null, 'LOGIN_AVATAR_FAILED', request, 'WARNING');
          reply.code(401);
          return { error: 'Fichier clé invalide ou inconnu' };
        }

        request.log.info({ userId: user.id, username: user.username }, 'Avatar login successful');
        await logAuthAction(user.id, 'LOGIN_AVATAR_SUCCESS', request, 'INFO');
        return generateAuthResponse(reply, request, user);
      } catch (error) {
        request.log.error(error);
        reply.code(500);
        return { error: `Erreur lors du traitement du fichier: ${(error as any).message}` };
      }
    }
  );

  // Refresh token endpoint
  fastify.post<{ Body: { refreshToken: string } }>(
    '/auth/refresh',
    async (request, reply) => {
      const { refreshToken } = request.body;

      if (!refreshToken) {
        reply.code(400);
        return { error: 'refreshToken requis' };
      }

      const tokenData = await validateRefreshToken(refreshToken);
      if (!tokenData) {
        reply.code(401);
        return { error: 'Refresh token invalide ou expiré' };
      }

      const user = await db.getUserById(tokenData.user_id);
      if (!user) {
        reply.code(401);
        return { error: 'Utilisateur introuvable' };
      }

      const newAccessToken = await reply.jwtSign({
        sub: user.id,
        tier: user.security_tier,
      });

      return {
        token: newAccessToken,
        user: {
          id: user.id,
          username: user.username,
          securityTier: user.security_tier,
        },
      };
    }
  );

  // Logout endpoint
  fastify.post<{ Body: { refreshToken: string } }>(
    '/auth/logout',
    {
      preHandler: fastify.authenticate as any,
    },
    async (request, reply) => {
      const { refreshToken } = request.body;

      if (!refreshToken) {
        reply.code(400);
        return { error: 'refreshToken requis' };
      }

      const tokenData = await validateRefreshToken(refreshToken);
      if (tokenData) {
        revokeRefreshToken(tokenData.id);
      }

      return { success: true, message: 'Déconnecté avec succès' };
    }
  );

  // Logout all devices
  fastify.post(
    '/auth/logout-all',
    {
      preHandler: fastify.authenticate as any,
    },
    async (request, reply) => {
      const userId = (request.user as any).sub as string;
      revokeAllUserTokens(userId);
      return { success: true, message: 'Déconnecté de tous les appareils' };
    }
  );

  // ============================================================================
  // GET RECOVERY KEYS (Mnemonic/Checksums)
  // SECURITY: Returns ENCRYPTED data - client decrypts locally with masterKey
  // MasterKey is NEVER sent to the server!
  // ============================================================================
  fastify.get(
    '/api/v2/auth/recovery-keys',
    {
      preHandler: fastify.authenticate as any,
    },
    async (request, reply) => {
      const userId = (request.user as any).sub as string;

      try {
        // Get user from DB
        const user = await db.getUserById(userId);
        if (!user) {
          reply.code(404);
          return { error: 'Utilisateur introuvable' };
        }

        // SECURITY: Return encrypted mnemonic - client decrypts locally
        // This way masterKey NEVER leaves the client
        const encryptedMnemonic = user.mnemonic;
        const encryptedChecksums = user.security_tier === 'dice-key' ? user.dicekey_checksums : null;

        // Log recovery keys access
        logAuthAction(userId, 'RECOVERY_KEYS_ACCESSED', request, 'WARNING');

        // SECURITY: Return encrypted data - client decrypts locally
        return {
          success: true,
          securityTier: user.security_tier,
          // Encrypted mnemonic - client must decrypt with local masterKey
          encryptedMnemonic: encryptedMnemonic,
          // Encrypted checksums for DiceKey users
          encryptedChecksums: encryptedChecksums,
          username: user.username,
          userId: user.id,
          createdAt: user.created_at,
          // Note: Client must use local masterKey to decrypt these values
          _security: 'Data is encrypted. Decrypt locally with your masterKey.',
        };
      } catch (error: any) {
        fastify.log.error({ error, userId }, 'Recovery keys retrieval failed');
        reply.code(500);
        return { error: 'Erreur lors de la récupération des clés' };
      }
    }
  );

  // ============================================================================
  // SRP (Zero-Knowledge) LOGIN
  // ============================================================================

  // SECURITY FIX VULN-006: SRP login with server-side session storage
  // Server ephemeral secrets are NEVER sent to the client

  // 1. Init: Client sends username + A, Server returns salt + B + sessionId
  fastify.post<{ Body: { username: string; A: string } }>(
    '/api/v2/auth/srp/login/init',
    async (request, reply) => {
      const { username, A } = request.body;
      const user = await db.getUserByUsername(username);

      if (!user || !user.srp_salt || !user.srp_verifier) {
        reply.code(404);
        return { error: 'User not found or SRP not configured' };
      }

      const serverEphemeral = srp.generateEphemeral(user.srp_verifier);

      // SECURITY FIX VULN-006: Store session server-side instead of in JWT
      // Generate a random session ID that doesn't reveal any secrets
      const sessionId = randomUUID();

      // Store the SRP session data server-side
      srpSessions.set(sessionId, {
        userId: user.id,
        b: serverEphemeral.secret, // NEVER leaves the server
        B: serverEphemeral.public,
        A: A,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
      });

      return {
        salt: user.srp_salt,
        B: serverEphemeral.public,
        sessionId, // Simple ID, not a JWT containing secrets
      };
    }
  );

  // 2. Verify: Client sends M1 + sessionId, Server verifies and returns M2 + Token
  fastify.post<{ Body: { username: string; M1: string; sessionId: string } }>(
    '/api/v2/auth/srp/login/verify',
    async (request, reply) => {
      const { username, M1, sessionId } = request.body;

      // SECURITY FIX VULN-006: Retrieve session from server-side storage
      const session = srpSessions.get(sessionId);

      if (!session) {
        reply.code(401);
        return { error: 'Invalid or expired session' };
      }

      // Check expiration
      if (session.expiresAt < Date.now()) {
        srpSessions.delete(sessionId);
        reply.code(401);
        return { error: 'Session expired' };
      }

      // Delete session after use (one-time use)
      srpSessions.delete(sessionId);

      const user = await db.getUserById(session.userId);
      if (!user) {
        reply.code(401);
        return { error: 'User not found' };
      }

      try {
        const serverSession = srp.deriveSession(
          session.b, // Server secret from server-side storage
          session.A, // Client public from server-side storage
          user.srp_salt,
          username,
          user.srp_verifier,
          M1 // client proof
        );

        await logAuthAction(user.id, 'LOGIN_SRP_SUCCESS', request, 'INFO');

        return generateAuthResponse(reply, request, user, {
          M2: serverSession.proof, // Server proof
        });
      } catch (error) {
        await logAuthAction(user.id, 'LOGIN_SRP_FAILED', request, 'WARNING');
        reply.code(401);
        return { error: 'Invalid password proof' };
      }
    }
  );
  // 3. Setup SRP (Authenticated)
  fastify.post<{ Body: { srpSalt: string; srpVerifier: string } }>(
    '/api/v2/auth/srp/setup',
    {
      preHandler: fastify.authenticate as any,
    },
    async (request, reply) => {
      const userId = (request.user as any).sub;
      const { srpSalt, srpVerifier } = request.body;

      if (!srpSalt || !srpVerifier) {
        reply.code(400);
        return { error: 'srpSalt and srpVerifier are required' };
      }

      await (db as any).updateUserSRP(userId, srpSalt, srpVerifier);

      return { success: true };
    }
  );

}
