/**
 * User Entity - Domain Layer
 * 
 * Représente un utilisateur dans le système
 * Règles métier encapsulées
 */

import type { SecurityTier } from '../value-objects/SecurityTier';

export interface UserProps {
  id: string;
  username: string;
  passwordHash: string;
  securityTier: SecurityTier;
  masterKey: string;
  createdAt: number;
  reputation?: number;
}

export class User {
  private constructor(private readonly props: UserProps) {
    this.validate();
  }

  // Getters
  get id(): string {
    return this.props.id;
  }

  get username(): string {
    return this.props.username;
  }

  get passwordHash(): string {
    return this.props.passwordHash;
  }

  get securityTier(): SecurityTier {
    return this.props.securityTier;
  }

  get masterKey(): string {
    return this.props.masterKey;
  }

  get createdAt(): number {
    return this.props.createdAt;
  }

  get reputation(): number {
    return this.props.reputation ?? 0;
  }

  // Factory methods
  static create(props: Omit<UserProps, 'id' | 'createdAt'>): User {
    return new User({
      ...props,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      reputation: 0,
    });
  }

  static fromRow(row: any): User {
    return new User({
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      securityTier: row.security_tier as SecurityTier,
      masterKey: row.master_key,
      createdAt: row.created_at,
      reputation: row.reputation ?? 0,
    });
  }

  // Business methods
  canSendMessage(): boolean {
    // Règle métier: réputation >= -10 pour envoyer des messages
    return this.reputation >= -10;
  }

  incrementReputation(amount: number = 1): User {
    return new User({
      ...this.props,
      reputation: this.reputation + amount,
    });
  }

  decrementReputation(amount: number = 1): User {
    return new User({
      ...this.props,
      reputation: this.reputation - amount,
    });
  }

  // Validation
  private validate(): void {
    if (!this.props.id) {
      throw new Error('User ID is required');
    }
    if (!this.props.username || this.props.username.length < 3) {
      throw new Error('Username must be at least 3 characters');
    }
    if (!this.props.passwordHash) {
      throw new Error('Password hash is required');
    }
    if (!this.props.securityTier) {
      throw new Error('Security tier is required');
    }
  }

  // Serialization
  toJSON() {
    return {
      id: this.id,
      username: this.username,
      securityTier: this.securityTier,
      createdAt: this.createdAt,
      reputation: this.reputation,
    };
  }

  toRow() {
    return {
      id: this.id,
      username: this.username,
      password_hash: this.passwordHash,
      security_tier: this.securityTier,
      master_key: this.masterKey,
      created_at: this.createdAt,
      reputation: this.reputation,
    };
  }
}
