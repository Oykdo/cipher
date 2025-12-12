import { describe, it, expect, beforeEach } from 'vitest';
import { LoginUseCase } from '../LoginUseCase.js';
import { SignupUseCase } from '../SignupUseCase.js';
import { getDatabase } from '../../../../db/database.js';
import { UserRepository } from '../../../../infrastructure/database/repositories/UserRepository.js';
import * as bip39 from 'bip39';
import { createHash } from 'crypto';
import { randomUUID } from 'crypto';

// Test helpers
const generateTestCredentials = () => {
  const mnemonic = bip39.generateMnemonic(128);
  const keyHex = bip39.mnemonicToEntropy(mnemonic);
  const keyHash = createHash('sha256').update(keyHex).digest('hex');
  return { mnemonic, keyHex, keyHash };
};

// Mock JWT Service
const mockJwtService = {
  generateAccessToken: (userId: string) => `access_token_${userId}`,
  generateRefreshToken: (userId: string) => `refresh_token_${userId}`,
  verifyAccessToken: (token: string) => ({ userId: token.replace('access_token_', '') }),
  verifyRefreshToken: (token: string) => ({ userId: token.replace('refresh_token_', '') }),
};

const describeDb = process.env.DATABASE_URL_TEST ? describe : describe.skip;

describeDb('LoginUseCase', () => {
  let loginUseCase: LoginUseCase;
  let signupUseCase: SignupUseCase;
  let db: ReturnType<typeof getDatabase>;
  let userRepository: UserRepository;

  beforeEach(() => {
    db = getDatabase();
    userRepository = new UserRepository(db);
    signupUseCase = new SignupUseCase(userRepository, mockJwtService);
    loginUseCase = new LoginUseCase(userRepository, mockJwtService);
  });

  describe('Standard Login', () => {
    it('should login with correct credentials', async () => {
      const username = `alice_${randomUUID()}`;
      // Setup: create user with auto-generated mnemonic
      const signupResult = await signupUseCase.execute({
        username,
        securityTier: 'standard',
        mnemonicLength: 12,
      });

      // Derive masterKey from mnemonic to login
      const mnemonicString = signupResult.mnemonic!.join(' ');
      const seed = await bip39.mnemonicToSeed(mnemonicString);
      const masterKey = seed.toString('hex');

      // Test: login
      const result = await loginUseCase.execute({
        username,
        masterKey,
      });

      expect(result).toHaveProperty('user');
      expect(result.user.username).toBe(username);
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('should reject login with incorrect username', async () => {
      const fakeKey = 'a'.repeat(128);
      await expect(
        loginUseCase.execute({
          username: 'nonexistent',
          masterKey: fakeKey,
        })
      ).rejects.toThrow();
    });

    it('should reject login with incorrect master key', async () => {
      const username = `alice_${randomUUID()}`;
      // Setup: create user
      await signupUseCase.execute({
        username,
        securityTier: 'standard',
        mnemonicLength: 12,
      });

      // Test: login with wrong master key
      const wrongKey = 'wrong_key_' + 'a'.repeat(100);

      await expect(
        loginUseCase.execute({
          username,
          masterKey: wrongKey,
        })
      ).rejects.toThrow();
    });

    it('should return valid JWT tokens', async () => {
      const username = `alice_${randomUUID()}`;
      // Setup: create user
      const signupResult = await signupUseCase.execute({
        username,
        securityTier: 'standard',
        mnemonicLength: 12,
      });

      // Derive masterKey from mnemonic
      const mnemonicString = signupResult.mnemonic!.join(' ');
      const seed = await bip39.mnemonicToSeed(mnemonicString);
      const masterKey = seed.toString('hex');

      // Test: login
      const result = await loginUseCase.execute({
        username,
        masterKey,
      });

      // Check token format (mock returns predictable format)
      expect(result.accessToken).toContain('access_token_');
      expect(result.refreshToken).toBeTruthy();
      expect(result.refreshToken).toContain('refresh_token_');
    });
  });

  describe('Case Insensitivity', () => {
    it('should login with different case username', async () => {
      const usernameMixed = `Alice_${randomUUID()}`;
      const usernameLower = usernameMixed.toLowerCase();

      // Setup: create user with capitalized username
      const signupResult = await signupUseCase.execute({
        username: usernameMixed,
        securityTier: 'standard',
        mnemonicLength: 12,
      });

      // Derive masterKey from mnemonic
      const mnemonicString = signupResult.mnemonic!.join(' ');
      const seed = await bip39.mnemonicToSeed(mnemonicString);
      const masterKey = seed.toString('hex');

      // Test: login with lowercase
      const result = await loginUseCase.execute({
        username: usernameLower,
        masterKey,
      });

      expect(result).toHaveProperty('user');
      expect(result.user.username.toLowerCase()).toBe(usernameLower);
    });
  });
});
