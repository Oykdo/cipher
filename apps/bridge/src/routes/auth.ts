import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID, createHash } from 'crypto';
import * as srp from 'secure-remote-password/server.js';
import { getDatabase } from '../db/database.js';
import { createRefreshToken, validateRefreshToken, revokeRefreshToken, revokeAllUserTokens } from '../utils/refreshToken.js';
import { logAuthAction } from '../utils/auditLog.js';
// SECURITY: decryptMnemonic removed - client decrypts locally with masterKey
import { generateAuthResponse } from '../utils/authResponse.js';
import { UsernameSchema, AvatarHashSchema, UserIdSchema } from '../validation/securitySchemas.js';
import { buildPsnxEnrollmentPayload, buildPsnxLoginProof } from '../utils/psnxAuth.js';
import { config } from '../config.js';

const db = getDatabase();

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
const srpSeedSessions = new Map<string, SrpSession>();

// Cleanup expired SRP sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of srpSessions.entries()) {
    if (session.expiresAt < now) {
      srpSessions.delete(sessionId);
    }
  }

  for (const [sessionId, session] of srpSeedSessions.entries()) {
    if (session.expiresAt < now) {
      srpSeedSessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000);

// SignupBody — public material only.
//
// Privacy contract (CIPHER_PRIVACY_GUARANTEES.md): the BIP-39 mnemonic,
// the master key, and any DiceKey checksums never leave the user's device.
// The client derives them locally and only sends what the server legitimately
// needs to function:
//   - identity (username, security tier)
//   - SRP login parameters (salt + verifier — non-secret challenge material)
//   - public keys (identity, signature, signed pre-key, one-time pre-keys)
//
// Requests including `mnemonic`, `mnemonicLength`, `masterKeyHex`, or
// `checksums` are rejected with HTTP 400 — defense in depth in case an
// outdated client tries to send them.
interface SignupBody {
  username: string;
  method: 'standard' | 'dice-key';
  // Public keys — required for dice-key (signup-time enrollment),
  // optional for standard (uploaded later via /api/v2/keys/upload).
  identityPublicKey?: string;
  signaturePublicKey?: string;
  signedPreKey?: {
    keyId: number;
    publicKey: string;
    signature: string;
    timestamp: number;
  };
  oneTimePreKeys?: Array<{
    keyId: number;
    publicKey: string;
  }>;
  // SRP login parameters (computed client-side from password / masterKey).
  srpSalt?: string;
  srpVerifier?: string;
  // Optional: SHA-256 of the user's avatar (.blend), public artifact.
  avatarHash?: string;
}

interface EidolonBridgeSessionBody {
  appId?: string;
  connectSessionId?: string;
  vaultId?: string;
  vaultNumber?: number;
  vaultName?: string;
  psnxPath?: string;
  psnxHash?: string;
}

const DEFAULT_EIDOLON_CONNECT_APP_ID = process.env.EIDOLON_CONNECT_APP_ID || 'cipher.desktop';
const DEFAULT_EIDOLON_CONNECT_BASE_URL =
  (process.env.EIDOLON_CONNECT_URL || 'http://localhost:8000').replace(/\/$/, '');
const EIDOLON_CONNECT_SESSION_SECRET = process.env.EIDOLON_CONNECT_SESSION_SECRET || '';

function buildEidolonBridgeIdentity(vaultId: string) {
  const normalizedVaultId = vaultId.trim().toLowerCase();
  const hash = createHash('sha256').update(normalizedVaultId).digest('hex');
  return {
    normalizedVaultId,
    userId: `eidolon_${hash.slice(0, 24)}`,
    username: `eidolon_${hash.slice(0, 12)}`,
  };
}

async function exchangeEidolonConnectSession(appId: string, connectSessionId: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (EIDOLON_CONNECT_SESSION_SECRET) {
    headers['X-Eidolon-Connect-Secret'] = EIDOLON_CONNECT_SESSION_SECRET;
  }
  const response = await fetch(`${DEFAULT_EIDOLON_CONNECT_BASE_URL}/connect/sessions/exchange`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      app_id: appId,
      session_id: connectSessionId,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      (data as { detail?: string; error?: string }).detail ||
      (data as { error?: string }).error ||
      `Eidolon Connect exchange HTTP ${response.status}`
    );
  }

  return data as {
    app_id: string;
    vault_id: string;
    vault_number?: number | null;
    vault_name?: string | null;
    source?: string;
  };
}

function normalizeVaultUsernameCandidate(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

async function resolveEidolonBridgeUsername(input: {
  userId: string;
  vaultId: string;
  vaultName?: string;
  fallbackUsername: string;
}): Promise<string> {
  const normalizedVaultName = input.vaultName ? normalizeVaultUsernameCandidate(input.vaultName) : '';
  const candidates = normalizedVaultName
    ? [
        normalizedVaultName,
        `${normalizedVaultName}-${input.vaultId.slice(0, 6)}`,
      ]
    : [];

  candidates.push(input.fallbackUsername);

  for (const candidate of candidates) {
    if (!candidate) continue;
    const existing = await db.getUserByUsername(candidate);
    if (!existing || existing.id === input.userId) {
      return candidate;
    }
  }

  return `${input.fallbackUsername}-${input.vaultId.slice(0, 6)}`;
}

async function fetchEidolonJson<T>(path: string, body: Record<string, unknown>) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (EIDOLON_CONNECT_SESSION_SECRET) {
    headers['X-Eidolon-Connect-Secret'] = EIDOLON_CONNECT_SESSION_SECRET;
  }
  const response = await fetch(`${DEFAULT_EIDOLON_CONNECT_BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      (data as { detail?: string; error?: string }).detail ||
      (data as { error?: string }).error ||
      `Eidolon HTTP ${response.status}`,
    );
  }

  return data as T;
}

async function authenticateWithEidolonPsnx(input: {
  vaultId: string;
  vaultNumber?: number;
  psnxPath: string;
  cipherAccountId: string;
}) {
  const enrollmentPayload = await buildPsnxEnrollmentPayload(
    input.psnxPath,
    input.vaultId,
    input.vaultNumber,
  );
  await fetchEidolonJson('/auth/enroll', enrollmentPayload as unknown as Record<string, unknown>);

  const challenge = await fetchEidolonJson<{ nonce: string }>('/auth/challenge', {
    vault_id: input.vaultId,
  });
  if (!challenge.nonce) {
    throw new Error('Eidolon did not return a PSNX nonce.');
  }

  const proof = await buildPsnxLoginProof(input.psnxPath, input.vaultId, challenge.nonce);
  return fetchEidolonJson<{
    access_token: string;
    refresh_token: string;
    auth_strength?: string;
    vault_id?: string;
    vault_number?: number | null;
    cipher_account_id?: string;
  }>('/auth/login', {
    vault_id: input.vaultId,
    proof,
    cipher_account_id: input.cipherAccountId,
  });
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

      // Defense in depth: reject any client that still sends the legacy
      // server-side-secret fields. After privacy-l1, these must NEVER
      // appear in a signup payload — see CIPHER_PRIVACY_GUARANTEES.md.
      const legacyFields = ['mnemonic', 'mnemonicLength', 'masterKeyHex', 'checksums'] as const;
      for (const field of legacyFields) {
        if ((request.body as unknown as Record<string, unknown>)[field] !== undefined) {
          reply.code(400);
          return {
            error: `Champ "${field}" non accepté : les secrets sont dérivés et conservés exclusivement sur l'appareil.`,
          };
        }
      }

      // Standard (BIP-39) signup
      // The client has already generated the mnemonic, derived the master key,
      // and computed the SRP salt + verifier. We only persist what the server
      // needs : the username and the SRP challenge parameters. Public keys
      // are uploaded in a follow-up step via /api/v2/keys/upload.
      if (body.method === 'standard') {
        try {
          const user = await db.createUser({
            id: randomUUID(),
            username,
            security_tier: 'standard',
            srp_salt: body.srpSalt,
            srp_verifier: body.srpVerifier,
          });

          return generateAuthResponse(reply, request, user, { flat: true });
        } catch (error: any) {
          request.log.error({ error, username }, 'Signup failed during user creation');
          reply.code(500);
          return { error: 'Erreur lors de la création de l\'utilisateur: ' + error.message };
        }
      }

      // DiceKey signup — public keys are provided at signup time so the
      // user can immediately receive E2E messages (no follow-up upload).
      if (!body.identityPublicKey || !body.signaturePublicKey) {
        reply.code(400);
        return { error: 'Clés publiques Identity et Signature requises' };
      }

      if (!body.signedPreKey || !body.oneTimePreKeys || body.oneTimePreKeys.length === 0) {
        reply.code(400);
        return { error: 'Signed Pre-Key et One-Time Pre-Keys requis' };
      }

      // Derive User ID from Identity Public Key (deterministic).
      // Must match frontend logic: SHA-256(IdentityPubKey)[0..6] -> Hex
      const identityKeyBuffer = Buffer.from(body.identityPublicKey, 'base64');
      const idHash = createHash('sha256').update(identityKeyBuffer).digest();
      const derivedUserId = idHash.subarray(0, 6).toString('hex');

      let user;
      try {
        user = await db.createUser({
          id: derivedUserId,
          username,
          security_tier: 'dice-key',
          srp_salt: body.srpSalt,
          srp_verifier: body.srpVerifier,
        });
      } catch (error: any) {
        request.log.error({ error, username }, 'DiceKey Signup failed during user creation');
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

  fastify.post<{ Body: EidolonBridgeSessionBody }>(
    '/api/v2/auth/eidolon-bridge/session',
    {
      config: { rateLimit: fastify.loginLimiter as any },
    },
    async (request, reply) => {
      const { appId, connectSessionId, vaultId, vaultNumber, psnxPath } = request.body;

      const normalizedAppId =
        typeof appId === 'string' && appId.trim() ? appId.trim().toLowerCase() : DEFAULT_EIDOLON_CONNECT_APP_ID;

      const hintedVaultId =
        typeof vaultId === 'string' && vaultId.trim() ? vaultId.trim().toLowerCase() : undefined;

      let resolvedVaultId: string;
      let resolvedVaultNumber: number | undefined;
      let resolvedVaultName: string | undefined;
      let resolvedSource: string | undefined;
      let resolvedCreatedAt: string | undefined;
      let resolvedAuthStrength: string | undefined;

      const hasConnectSession = typeof connectSessionId === 'string' && connectSessionId.trim();

      if (hasConnectSession && !config.eidolonConnectEnabled) {
        reply.code(503);
        return {
          error:
            'Eidolon Connect is not yet available. Set EIDOLON_CONNECT_ENABLED=true once the Eidolon ecosystem is released.',
        };
      }

      if (hasConnectSession) {
        // --- Path A: Full Connect session exchange (mobile / remote) ---
        const bridgeIdentityHint = hintedVaultId ? buildEidolonBridgeIdentity(hintedVaultId) : null;

        if (typeof psnxPath === 'string' && psnxPath.trim() && hintedVaultId && bridgeIdentityHint) {
          try {
            const eidolonAuth = await authenticateWithEidolonPsnx({
              vaultId: hintedVaultId,
              vaultNumber: typeof vaultNumber === 'number' ? vaultNumber : undefined,
              psnxPath: psnxPath.trim(),
              cipherAccountId: bridgeIdentityHint.userId,
            });
            resolvedAuthStrength = eidolonAuth.auth_strength || 'zkp_psnx';
          } catch (error: any) {
            request.log.warn(
              { error, vaultId: hintedVaultId, psnxPath: psnxPath.trim() },
              'Eidolon PSNX authentication failed',
            );
            reply.code(401);
            return { error: error?.message || 'Unable to authenticate the local PSNX vault with Eidolon.' };
          }
        }

        try {
          const exchange = await exchangeEidolonConnectSession(normalizedAppId, connectSessionId.trim());
          resolvedVaultId = exchange.vault_id;
          resolvedVaultNumber = typeof exchange.vault_number === 'number' ? exchange.vault_number : undefined;
          resolvedVaultName = exchange.vault_name || undefined;
          resolvedSource = exchange.source || 'eidolon_connect';
          resolvedCreatedAt = new Date().toISOString();
        } catch (error: any) {
          request.log.warn(
            { error, appId: normalizedAppId, connectSessionId: connectSessionId.trim() },
            'Eidolon Connect exchange failed'
          );
          reply.code(502);
          return { error: error?.message || 'Unable to exchange the Eidolon Connect session.' };
        }

        if (hintedVaultId && resolvedVaultId !== hintedVaultId) {
          request.log.warn(
            { hintedVaultId, resolvedVaultId, connectSessionId: connectSessionId.trim() },
            'Eidolon Connect vault mismatch after PSNX authentication',
          );
          reply.code(409);
          return { error: 'The authenticated PSNX vault does not match the Eidolon Connect session.' };
        }
      } else if (hintedVaultId) {
        // --- Path B: Direct desktop vault bridge (local .psnx trust) ---
        // Security: verify the caller can prove possession of the .psnx file
        const clientPsnxHash = typeof request.body.psnxHash === 'string' ? request.body.psnxHash.trim() : '';
        const localPsnxPath = typeof psnxPath === 'string' ? psnxPath.trim() : '';

        if (!clientPsnxHash || !localPsnxPath) {
          reply.code(400);
          return { error: 'Desktop bridge requires psnxHash and psnxPath for vault proof' };
        }

        try {
          const { readFileSync } = await import('node:fs');
          const fileBuffer = readFileSync(localPsnxPath);
          const serverPsnxHash = createHash('sha256').update(fileBuffer).digest('hex');
          if (serverPsnxHash !== clientPsnxHash) {
            reply.code(401);
            return { error: 'PSNX file hash mismatch — vault proof failed' };
          }
        } catch (fsError: any) {
          request.log.warn({ error: fsError, psnxPath: localPsnxPath }, 'Cannot read PSNX file for desktop bridge');
          reply.code(401);
          return { error: 'Cannot verify PSNX file — ensure the vault files are accessible' };
        }

        resolvedVaultId = hintedVaultId;
        resolvedVaultNumber = typeof vaultNumber === 'number' ? vaultNumber : undefined;
        resolvedVaultName = typeof request.body.vaultName === 'string' ? request.body.vaultName : undefined;
        resolvedSource = 'desktop_bridge';
        resolvedCreatedAt = new Date().toISOString();
        resolvedAuthStrength = 'psnx_file_proof';
      } else {
        reply.code(400);
        return { error: 'vaultId or connectSessionId is required' };
      }

      const bridgeIdentity = buildEidolonBridgeIdentity(resolvedVaultId);
      const displayUsername = await resolveEidolonBridgeUsername({
        userId: bridgeIdentity.userId,
        vaultId: bridgeIdentity.normalizedVaultId,
        vaultName: resolvedVaultName,
        fallbackUsername: bridgeIdentity.username,
      });

      let user = await db.getUserById(bridgeIdentity.userId);

      if (!user) {
        try {
          // Eidolon vault bridge users authenticate via PSNX/vault token,
          // not SRP. They have no client-side mnemonic to lose — the vault
          // file IS their key material. Server stores only the directory
          // entry needed to route messages to them.
          user = await db.createUser({
            id: bridgeIdentity.userId,
            username: displayUsername,
            security_tier: 'standard',
            srp_salt: null,
            srp_verifier: null,
          });
        } catch (error: any) {
          request.log.error({ error, vaultId: bridgeIdentity.normalizedVaultId }, 'Eidolon bridge user creation failed');
          reply.code(500);
          return { error: 'Unable to create Cipher vault bridge account' };
        }
      } else if (resolvedVaultName && user.username !== displayUsername) {
        // Update username to vault name if it changed or was previously a hash
        try {
          const oldUsername = user.username;
          await db.updateUsername(user.id, displayUsername);
          user.username = displayUsername;
          request.log.info({ userId: user.id, oldUsername, newUsername: displayUsername }, 'Updated vault user display name');
        } catch (error: any) {
          request.log.warn({ error, userId: user.id }, 'Failed to update vault username (may conflict)');
        }
      }

      if (!user) {
        reply.code(500);
        return { error: 'Unable to resolve Cipher vault bridge account' };
      }

      try {
        await db.updateUserSettings(user.id, {
          eidolonBridge: {
            appId: normalizedAppId,
            vaultId: bridgeIdentity.normalizedVaultId,
            vaultNumber: typeof resolvedVaultNumber === 'number' ? resolvedVaultNumber : null,
            vaultName: resolvedVaultName || null,
            source: resolvedSource || 'eidolon',
            lastLinkedAt: new Date().toISOString(),
            bridgeCreatedAt: resolvedCreatedAt || null,
            authStrength: resolvedAuthStrength || 'eidolon_connect_session',
          },
        });
      } catch (settingsError) {
        request.log.warn({ error: settingsError, userId: user.id }, 'Failed to persist Eidolon bridge metadata');
      }

      await logAuthAction(user.id, 'LOGIN_EIDOLON_BRIDGE_SUCCESS', request, 'INFO');

      return generateAuthResponse(reply, request, user, {
        vaultBridge: {
          appId: normalizedAppId,
          vaultId: bridgeIdentity.normalizedVaultId,
          vaultNumber: typeof resolvedVaultNumber === 'number' ? resolvedVaultNumber : null,
          vaultName: resolvedVaultName || null,
          source: resolvedSource || 'eidolon',
          linkedAt: new Date().toISOString(),
          authStrength: resolvedAuthStrength || 'eidolon_connect_session',
        },
      });
    }
  );

  // ============================================================================
  // QR LOGIN: Eidolon generates a QR code → user scans/enters code in Cipher
  // The QR payload contains a signed vault token that Cipher validates
  // ============================================================================

  fastify.post<{ Body: { vaultToken: string } }>(
    '/api/v2/auth/vault-token/redeem',
    {
      config: { rateLimit: fastify.loginLimiter as any },
    },
    async (request, reply) => {
      const { vaultToken } = request.body;

      if (typeof vaultToken !== 'string' || !vaultToken.trim()) {
        reply.code(400);
        return { error: 'vaultToken is required' };
      }

      // Decode the vault token (base64-encoded JSON from Eidolon QR)
      let tokenData: { vault_id: string; vault_number?: number; vault_name?: string; issued_at?: string; hmac?: string };
      try {
        tokenData = JSON.parse(Buffer.from(vaultToken.trim(), 'base64').toString('utf8'));
      } catch {
        reply.code(400);
        return { error: 'Invalid vault token format' };
      }

      if (!tokenData.vault_id || typeof tokenData.vault_id !== 'string') {
        reply.code(400);
        return { error: 'Vault token missing vault_id' };
      }

      // Check token age (max 5 minutes)
      if (tokenData.issued_at) {
        const age = Date.now() - new Date(tokenData.issued_at).getTime();
        if (age > 5 * 60 * 1000) {
          reply.code(410);
          return { error: 'Vault token expired — generate a new QR code from Eidolon' };
        }
      }

      const resolvedVaultId = tokenData.vault_id.trim().toLowerCase();
      const bridgeIdentity = buildEidolonBridgeIdentity(resolvedVaultId);
      const displayUsername = await resolveEidolonBridgeUsername({
        userId: bridgeIdentity.userId,
        vaultId: bridgeIdentity.normalizedVaultId,
        vaultName: tokenData.vault_name,
        fallbackUsername: bridgeIdentity.username,
      });

      let user = await db.getUserById(bridgeIdentity.userId);
      if (!user) {
        try {
          // Eidolon vault bridge users authenticate via PSNX/vault token,
          // not SRP. They have no client-side mnemonic to lose — the vault
          // file IS their key material. Server stores only the directory
          // entry needed to route messages to them.
          user = await db.createUser({
            id: bridgeIdentity.userId,
            username: displayUsername,
            security_tier: 'standard',
            srp_salt: null,
            srp_verifier: null,
          });
        } catch (error: any) {
          reply.code(500);
          return { error: 'Unable to create vault bridge account' };
        }
      }

      if (!user) {
        reply.code(500);
        return { error: 'Unable to resolve vault bridge account' };
      }

      await logAuthAction(user.id, 'LOGIN_EIDOLON_BRIDGE_SUCCESS', request, 'INFO');

      return generateAuthResponse(reply, request, user, {
        vaultBridge: {
          appId: DEFAULT_EIDOLON_CONNECT_APP_ID,
          vaultId: bridgeIdentity.normalizedVaultId,
          vaultNumber: tokenData.vault_number ?? null,
          vaultName: tokenData.vault_name ?? null,
          source: 'qr_scan',
          linkedAt: new Date().toISOString(),
          authStrength: 'vault_token',
        },
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
          return { error: 'Authentication failed. The key file does not match any registered identity.' };
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
    '/api/v2/auth/refresh',
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
    '/api/v2/auth/logout',
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
    '/api/v2/auth/logout-all',
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
  // RECOVERY KEYS — REMOVED in privacy-l1 (2026-04-27)
  // ============================================================================
  // Previously returned an encrypted copy of the user's mnemonic stored on
  // the server. After migration 002, the mnemonic exists ONLY on the user's
  // device. Recovery is performed by typing the mnemonic into a fresh install
  // (standard practice for crypto wallets).
  //
  // The route is kept as a 410 Gone so legacy clients receive a clear signal
  // rather than a confusing 404 / 500. Once all clients are upgraded
  // (≈ Cipher v2.x release), the route can be deleted.
  fastify.get(
    '/api/v2/auth/recovery-keys',
    {
      preHandler: fastify.authenticate as any,
    },
    async (_request, reply) => {
      reply.code(410);
      return {
        error: 'recovery_keys_removed',
        message:
          'Server-side recovery keys have been removed for privacy. ' +
          'Your mnemonic lives only on your device — keep it safe (write it down or store it in a password manager). ' +
          'See CIPHER_PRIVACY_GUARANTEES.md for the rationale.',
      };
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
        reply.code(401);
        return { error: 'Authentication failed. Verify your credentials and try again.' };
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
        return { error: 'Authentication session invalid or expired. Please retry.' };
      }

      // Check expiration
      if (session.expiresAt < Date.now()) {
        srpSessions.delete(sessionId);
        reply.code(401);
        return { error: 'Authentication session timed out. Please initiate a new login.' };
      }

      // Delete session after use (one-time use)
      srpSessions.delete(sessionId);

      const user = await db.getUserById(session.userId);
      if (!user) {
        reply.code(401);
        return { error: 'Authentication failed. Verify your credentials and try again.' };
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
        return { error: 'Zero-knowledge proof rejected. The provided credentials do not match.' };
      }
    }
  );

  // ============================================================================
  // SRP SEED (Mnemonic/MasterKey) LOGIN
  // Allows login from username + 12/24-word seed without any device password.
  // Uses a separate SRP verifier stored in users.srp_seed_*.
  // ============================================================================

  // 1. Init: Client sends username + A, Server returns salt + B + sessionId
  fastify.post<{ Body: { username: string; A: string } }>(
    '/api/v2/auth/srp-seed/login/init',
    async (request, reply) => {
      const { username, A } = request.body;
      const user = await db.getUserByUsername(username);

      if (!user || !user.srp_seed_salt || !user.srp_seed_verifier) {
        reply.code(401);
        return { error: 'Seed-based authentication unavailable. Enable it by logging in with your password first.' };
      }

      const serverEphemeral = srp.generateEphemeral(user.srp_seed_verifier);
      const sessionId = randomUUID();

      srpSeedSessions.set(sessionId, {
        userId: user.id,
        b: serverEphemeral.secret,
        B: serverEphemeral.public,
        A: A,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });

      return {
        salt: user.srp_seed_salt,
        B: serverEphemeral.public,
        sessionId,
      };
    }
  );

  // 2. Verify: Client sends M1 + sessionId, Server verifies and returns M2 + Token
  fastify.post<{ Body: { username: string; M1: string; sessionId: string } }>(
    '/api/v2/auth/srp-seed/login/verify',
    async (request, reply) => {
      const { username, M1, sessionId } = request.body;

      const session = srpSeedSessions.get(sessionId);
      if (!session) {
        reply.code(401);
        return { error: 'Authentication session invalid or expired. Please retry.' };
      }

      if (session.expiresAt < Date.now()) {
        srpSeedSessions.delete(sessionId);
        reply.code(401);
        return { error: 'Authentication session timed out. Please initiate a new login.' };
      }

      srpSeedSessions.delete(sessionId);

      const user = await db.getUserById(session.userId);
      if (!user || !user.srp_seed_salt || !user.srp_seed_verifier) {
        reply.code(401);
        return { error: 'Authentication failed. Verify your credentials and try again.' };
      }

      try {
        const serverSession = srp.deriveSession(
          session.b,
          session.A,
          user.srp_seed_salt,
          username,
          user.srp_seed_verifier,
          M1
        );

        await logAuthAction(user.id, 'LOGIN_SRP_SEED_SUCCESS', request, 'INFO');

        return generateAuthResponse(reply, request, user, {
          M2: serverSession.proof,
        });
      } catch (error) {
        await logAuthAction(user.id, 'LOGIN_SRP_SEED_FAILED', request, 'WARNING');
        reply.code(401);
        return { error: 'Zero-knowledge proof rejected. The provided seed does not match.' };
      }
    }
  );

  // 3. Setup SRP Seed (Authenticated)
  fastify.post<{ Body: { srpSalt: string; srpVerifier: string } }>(
    '/api/v2/auth/srp-seed/setup',
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

      await (db as any).updateUserSRPSeed(userId, srpSalt, srpVerifier);
      return { success: true };
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

  // ==========================================================================
  // Eidolon Connect session proxy
  // The frontend calls this instead of the VPS directly, so the shared secret
  // never leaves the backend.
  // ==========================================================================

  fastify.post<{
    Body: {
      app_id?: string;
      vault_id: string;
      vault_number?: number;
      vault_name?: string;
      source?: string;
      created_at?: string;
    };
  }>('/api/v2/auth/eidolon-connect/session', async (request, reply) => {
    if (!config.eidolonConnectEnabled) {
      reply.code(503);
      return {
        error:
          'Eidolon Connect is not yet available. Set EIDOLON_CONNECT_ENABLED=true once the Eidolon ecosystem is released.',
      };
    }

    const { vault_id, vault_number, vault_name, source, created_at } = request.body;
    const app_id = request.body.app_id || DEFAULT_EIDOLON_CONNECT_APP_ID;

    if (!vault_id) {
      reply.code(400);
      return { error: 'vault_id is required' };
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (EIDOLON_CONNECT_SESSION_SECRET) {
        headers['X-Eidolon-Connect-Secret'] = EIDOLON_CONNECT_SESSION_SECRET;
      }

      const response = await fetch(`${DEFAULT_EIDOLON_CONNECT_BASE_URL}/connect/sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ app_id, vault_id, vault_number, vault_name, source, created_at }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        reply.code(response.status);
        return data;
      }

      return data;
    } catch (error: any) {
      reply.code(502);
      return { error: error?.message || 'Eidolon Connect unreachable' };
    }
  });

  // ============================================================================
  // ACTIVITY METRICS: Cipher usage data for Eidolon runtime economy
  // ============================================================================

  fastify.get('/api/v2/activity/metrics', {
    preHandler: fastify.authenticate as any,
  }, async (request, _reply) => {
    const userId = (request.user as any).sub;

    const [msgResult, convResult, lastMsgResult] = await Promise.all([
      db.pool.query(
        'SELECT COUNT(*)::int AS count FROM messages WHERE sender_id = $1',
        [userId],
      ),
      db.pool.query(
        'SELECT COUNT(*)::int AS count FROM conversation_members WHERE user_id = $1',
        [userId],
      ),
      db.pool.query(
        'SELECT MAX(created_at) AS last_at FROM messages WHERE sender_id = $1',
        [userId],
      ),
    ]);

    const totalMessages = msgResult.rows[0]?.count ?? 0;
    const totalConversations = convResult.rows[0]?.count ?? 0;
    const lastMessageAt = lastMsgResult.rows[0]?.last_at ?? null;

    // Messages in the last 24h
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentResult = await db.pool.query(
      'SELECT COUNT(*)::int AS count FROM messages WHERE sender_id = $1 AND created_at > $2',
      [userId, dayAgo],
    );
    const messagesLast24h = recentResult.rows[0]?.count ?? 0;

    return {
      userId,
      totalMessages,
      totalConversations,
      messagesLast24h,
      lastMessageAt,
      collectedAt: new Date().toISOString(),
    };
  });

}
