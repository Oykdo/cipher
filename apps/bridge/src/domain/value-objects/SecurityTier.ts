/**
 * SecurityTier Value Object
 * 
 * Niveau de sécurité de l'utilisateur
 */

export type SecurityTier = 'standard' | 'dice-key';

export class SecurityTierVO {
  private constructor(private readonly value: SecurityTier) {}

  static fromString(value: string): SecurityTierVO {
    if (value !== 'standard' && value !== 'dice-key') {
      throw new Error(`Invalid security tier: ${value}`);
    }
    return new SecurityTierVO(value);
  }

  static standard(): SecurityTierVO {
    return new SecurityTierVO('standard');
  }

  static diceKey(): SecurityTierVO {
    return new SecurityTierVO('dice-key');
  }

  getValue(): SecurityTier {
    return this.value;
  }

  isStandard(): boolean {
    return this.value === 'standard';
  }

  isDiceKey(): boolean {
    return this.value === 'dice-key';
  }

  toString(): string {
    return this.value;
  }

  equals(other: SecurityTierVO): boolean {
    return this.value === other.value;
  }
}
