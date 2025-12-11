/**
 * User Repository Implementation - Infrastructure Layer
 * 
 * Implémente IUserRepository en utilisant le DatabaseService
 */

import type { IUserRepository } from '../../../domain/repositories/IUserRepository';
import type { User } from '../../../domain/entities/User';
import type { DatabaseService } from '../../../db/database';
import { User as UserEntity } from '../../../domain/entities/User';

export class UserRepository implements IUserRepository {
  constructor(private readonly db: DatabaseService) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.db.getUserById(id);
    if (!row) {return null;}

    return UserEntity.fromRow({
      id: row.id,
      username: row.username,
      password_hash: row.master_key_hex || '', // master_key_hex is used as password_hash
      security_tier: row.security_tier,
      master_key: row.master_key_hex || '',
      created_at: row.created_at,
      reputation: 0, // TODO: Add reputation to database schema
    });
  }

  async findByUsername(username: string): Promise<User | null> {
    const row = await this.db.getUserByUsername(username);
    if (!row) {return null;}

    return UserEntity.fromRow({
      id: row.id,
      username: row.username,
      password_hash: row.master_key_hex || '',
      security_tier: row.security_tier,
      master_key: row.master_key_hex || '',
      created_at: row.created_at,
      reputation: 0,
    });
  }

  async create(user: User): Promise<void> {
    const row = user.toRow();
    
    await this.db.createUser({
      id: row.id,
      username: row.username,
      security_tier: row.security_tier,
      mnemonic: '{}', // Mnemonic is stored separately in actual implementation
      master_key_hex: row.master_key,
    });
  }

  async update(user: User): Promise<void> {
    // TODO: Implement update logic
    // For now, database doesn't have a generic update method
    throw new Error('UserRepository.update not implemented yet');
  }

  async delete(id: string): Promise<void> {
    // TODO: Implement delete logic
    // Note: User deletion should trigger audit logs (already handled by SQL triggers)
    throw new Error('UserRepository.delete not implemented yet');
  }

  async existsByUsername(username: string): Promise<boolean> {
    const user = await this.findByUsername(username);
    return user !== null;
  }

  async searchByUsername(query: string, limit: number = 10): Promise<User[]> {
    const rows = await this.db.searchUsers(query, null, limit);
    const users: User[] = [];

    for (const row of rows) {
      const user = await this.findById(row.id);
      if (user) {users.push(user);}
    }

    return users;
  }

  async getStats(): Promise<{ total: number; standard: number; diceKey: number }> {
    const stats = await this.db.getStats();
    // TODO: Implement tier-specific stats
    return {
      total: stats.users,
      standard: 0, // Placeholder
      diceKey: 0,  // Placeholder
    };
  }
}
