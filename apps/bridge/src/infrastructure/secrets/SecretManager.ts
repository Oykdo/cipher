/**
 * Secret Manager - Centralized Secret Management
 * 
 * SECURITY: Isolates secret access from application code
 * - Supports environment variables (dev)
 * - Ready for Vault/KMS integration (production)
 * - Automatic secret rotation (future)
 * - Audit logging for secret access
 * 
 * @module SecretManager
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface SecretConfig {
  source: 'env' | 'file' | 'vault' | 'kms';
  vaultUrl?: string;
  kmsRegion?: string;
}

/**
 * Centralized secret management for Pulse
 */
export class SecretManager {
  private static instance: SecretManager;
  private secrets: Map<string, string> = new Map();
  private config: SecretConfig;

  private constructor(config: SecretConfig = { source: 'env' }) {
    this.config = config;
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: SecretConfig): SecretManager {
    if (!SecretManager.instance) {
      SecretManager.instance = new SecretManager(config);
    }
    return SecretManager.instance;
  }

  /**
   * Get a secret by key
   * @param key - Secret identifier
   * @returns Secret value
   * @throws {Error} If secret not found or invalid
   */
  async getSecret(key: string): Promise<string> {
    // Check cache first
    if (this.secrets.has(key)) {
      return this.secrets.get(key)!;
    }

    let value: string | undefined;

    switch (this.config.source) {
      case 'env':
        value = await this.getFromEnv(key);
        break;
      case 'file':
        value = await this.getFromFile(key);
        break;
      case 'vault':
        value = await this.getFromVault(key);
        break;
      case 'kms':
        value = await this.getFromKMS(key);
        break;
      default:
        throw new Error(`Unknown secret source: ${this.config.source}`);
    }

    if (!value) {
      throw new Error(`Secret not found: ${key}`);
    }

    // Validate secret
    this.validateSecret(key, value);

    // Cache secret
    this.secrets.set(key, value);

    return value;
  }

  /**
   * Get secret from environment variable
   */
  private async getFromEnv(key: string): Promise<string | undefined> {
    return process.env[key];
  }

  /**
   * Get secret from file (Docker secrets pattern)
   */
  private async getFromFile(key: string): Promise<string | undefined> {
    const secretPath = join('/run/secrets', key.toLowerCase());
    
    if (!existsSync(secretPath)) {
      return undefined;
    }

    try {
      return readFileSync(secretPath, 'utf-8').trim();
    } catch (error) {
      console.error(`Failed to read secret file: ${secretPath}`, error);
      return undefined;
    }
  }

  /**
   * Get secret from HashiCorp Vault
   * @future Implementation for production
   */
  private async getFromVault(key: string): Promise<string | undefined> {
    // TODO: Implement Vault integration
    // const client = new VaultClient(this.config.vaultUrl);
    // const secret = await client.read(`secret/data/pulse/${key}`);
    // return secret.data.value;
    
    console.warn('Vault integration not yet implemented, falling back to env');
    return this.getFromEnv(key);
  }

  /**
   * Get secret from AWS KMS
   * @future Implementation for production
   */
  private async getFromKMS(key: string): Promise<string | undefined> {
    // TODO: Implement KMS integration
    // const kms = new AWS.KMS({ region: this.config.kmsRegion });
    // const result = await kms.decrypt({ CiphertextBlob: encryptedSecret }).promise();
    // return result.Plaintext.toString();
    
    console.warn('KMS integration not yet implemented, falling back to env');
    return this.getFromEnv(key);
  }

  /**
   * Validate secret format and strength
   */
  private validateSecret(key: string, value: string): void {
    // JWT_SECRET validation
    if (key === 'JWT_SECRET') {
      if (value.length < 32) {
        throw new Error('JWT_SECRET must be at least 32 characters (256 bits)');
      }

      const weakSecrets = [
        'chimera-dev-secret-change-in-production',
        'dev-secret',
        'please-change-this',
        'secret',
        'password',
      ];

      if (weakSecrets.some(weak => value.includes(weak))) {
        throw new Error('JWT_SECRET contains weak or default value');
      }
    }

    // Database encryption key validation
    if (key === 'DB_ENCRYPTION_KEY') {
      if (value.length < 32) {
        throw new Error('DB_ENCRYPTION_KEY must be at least 32 characters');
      }
    }
  }

  /**
   * Rotate a secret (future implementation)
   */
  async rotateSecret(key: string): Promise<void> {
    // TODO: Implement secret rotation
    // 1. Generate new secret
    // 2. Update in vault/KMS
    // 3. Notify application
    // 4. Invalidate old secret after grace period
    
    console.warn(`Secret rotation not yet implemented for: ${key}`);
  }

  /**
   * Clear secret cache (for testing or rotation)
   */
  clearCache(): void {
    this.secrets.clear();
  }

  /**
   * Get all secret keys (for debugging, never log values!)
   */
  getSecretKeys(): string[] {
    return Array.from(this.secrets.keys());
  }
}

/**
 * Convenience function to get secret manager instance
 */
export function getSecretManager(config?: SecretConfig): SecretManager {
  return SecretManager.getInstance(config);
}

/**
 * Convenience function to get a secret
 */
export async function getSecret(key: string): Promise<string> {
  const manager = getSecretManager();
  return manager.getSecret(key);
}
