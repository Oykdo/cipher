/**
 * Auth Service - Application Layer
 * 
 * Service métier pour l'authentification
 */

import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';

export class AuthService {
  /**
   * Hasher un master key avec Argon2
   */
  async hashMasterKey(masterKey: string): Promise<string> {
    return argon2.hash(masterKey, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4,
    });
  }

  /**
   * Vérifier un master key contre son hash
   */
  async verifyMasterKey(hash: string, masterKey: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, masterKey);
    } catch {
      return false;
    }
  }

  /**
   * Générer un ID unique
   */
  generateId(): string {
    return randomUUID();
  }
}
