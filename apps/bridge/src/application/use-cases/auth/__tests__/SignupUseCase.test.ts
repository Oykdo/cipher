import { describe, it, expect, beforeEach } from 'vitest';
import { SignupUseCase } from '../SignupUseCase.js';
import { getDatabase } from '../../../../db/database.js';
import { UserRepository } from '../../../../infrastructure/database/repositories/UserRepository.js';
import * as bip39 from 'bip39';

// Test data generator
const createTestMnemonic = (bits = 128) => bip39.generateMnemonic(bits);
const mnemonicToKey = (mnemonic: string) => bip39.mnemonicToEntropy(mnemonic);

// Mock JWT Service
const mockJwtService = {
  generateAccessToken: (userId: string) => `access_token_${userId}`,
  generateRefreshToken: (userId: string) => `refresh_token_${userId}`,
  verifyAccessToken: (token: string) => ({ userId: token.replace('access_token_', '') }),
  verifyRefreshToken: (token: string) => ({ userId: token.replace('refresh_token_', '') }),
};

describe('SignupUseCase', () => {
  let signupUseCase: SignupUseCase;
  let db: ReturnType<typeof getDatabase>;
  let userRepository: UserRepository;

  beforeEach(() => {
    db = getDatabase();
    userRepository = new UserRepository(db);
    signupUseCase = new SignupUseCase(userRepository, mockJwtService);
  });

  describe('Standard Signup (BIP-39)', () => {
    it('should create user with valid BIP-39 mnemonic', async () => {
      const result = await signupUseCase.execute({
        username: 'alice',
        securityTier: 'standard',
        mnemonicLength: 12,
      });

      expect(result).toHaveProperty('user');
      expect(result.user.username).toBe('alice');
      expect(result.user.securityTier).toBe('standard');
      expect(result.mnemonic).toHaveLength(12);
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('should reject invalid username (too short)', async () => {
      await expect(
        signupUseCase.execute({
          username: 'ab', // Too short (less than 3 chars)
          securityTier: 'standard',
          mnemonicLength: 12,
        })
      ).rejects.toThrow();
    });

    it('should reject duplicate username', async () => {
      // First signup
      await signupUseCase.execute({
        username: 'alice',
        securityTier: 'standard',
        mnemonicLength: 12,
      });

      // Duplicate signup should fail
      await expect(
        signupUseCase.execute({
          username: 'alice',
          securityTier: 'standard',
          mnemonicLength: 12,
        })
      ).rejects.toThrow();
    });

    it('should hash master key with Argon2', async () => {
      await signupUseCase.execute({
        username: 'alice',
        securityTier: 'standard',
        mnemonicLength: 12,
      });

      const user = db.getUserByUsername('alice');
      expect(user).not.toBeNull();
      // Password hash (master_key_hex in DB) should be Argon2 format
      expect(user!.master_key_hex).toMatch(/^\$argon2id\$/);
    });
  });

  describe('DiceKey Signup', () => {
    it('should create user with DiceKey', async () => {
      const diceKeyString = 'A1 B2 C3 D0 E1 F2 G3 H0 I1 J2 K3 L0 M1 N2 O3 P0 Q1 R2 S3 T0 U1 V2 W3 X0 Y1';
      const mockKeyHex = 'a'.repeat(128); // Mock derived key

      const result = await signupUseCase.execute({
        username: 'bob',
        securityTier: 'dice-key',
        mnemonic: diceKeyString,
        masterKeyHex: mockKeyHex,
      });

      expect(result).toHaveProperty('user');
      expect(result.user.username).toBe('bob');
      expect(result.user.securityTier).toBe('dice-key');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });
  });

  describe('Mnemonic Generation', () => {
    it('should generate 12-word BIP-39 mnemonic by default', async () => {
      const result = await signupUseCase.execute({
        username: 'alice',
        securityTier: 'standard',
        mnemonicLength: 12,
      });

      expect(result.mnemonic).toHaveLength(12);
      expect(result.user.securityTier).toBe('standard');
    });

    it('should generate 24-word BIP-39 mnemonic when specified', async () => {
      const result = await signupUseCase.execute({
        username: 'bob',
        securityTier: 'standard',
        mnemonicLength: 24,
      });

      expect(result.mnemonic).toHaveLength(24);
      expect(result.user.securityTier).toBe('standard');
    });
  });
});
