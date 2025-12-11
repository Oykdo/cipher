/**
 * Signup Use Case - Application Layer
 * 
 * Gère la logique métier de l'inscription utilisateur
 */

import type { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { User } from '../../../domain/entities/User';
import { UserAlreadyExistsError } from '../../../domain/errors';
import type { SecurityTier } from '../../../domain/value-objects/SecurityTier';
import * as argon2 from 'argon2';
import * as bip39 from 'bip39';

export interface SignupInput {
  username: string;
  securityTier: 'standard' | 'dice-key';
  mnemonicLength?: 12 | 24;
  masterKeyHex?: string;
  mnemonic?: string;
}

export interface SignupOutput {
  user: User;
  mnemonic?: string[];
  accessToken: string;
  refreshToken: string;
}

export class SignupUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly jwtService: any // JWTService
  ) {}

  async execute(input: SignupInput): Promise<SignupOutput> {
    // 1. Valider que le username n'existe pas
    const exists = await this.userRepository.existsByUsername(input.username);
    if (exists) {
      throw new UserAlreadyExistsError(input.username);
    }

    // 2. Générer ou valider le master key
    let masterKey: string;
    let mnemonic: string[] | undefined;

    if (input.securityTier === 'standard') {
      // Standard: générer BIP-39 mnemonic
      const length = input.mnemonicLength ?? 12;
      const strength = length === 24 ? 256 : 128;
      const mnemonicString = bip39.generateMnemonic(strength);
      mnemonic = mnemonicString.split(' ');
      
      // Dériver master key depuis mnemonic (BIP-39 seed)
      const seed = await bip39.mnemonicToSeed(mnemonicString);
      masterKey = seed.toString('hex');
    } else {
      // DiceKey: utiliser le master key fourni
      if (!input.masterKeyHex) {
        throw new Error('DiceKey method requires masterKeyHex');
      }
      masterKey = input.masterKeyHex;
      mnemonic = input.mnemonic ? input.mnemonic.split(' ') : undefined;
    }

    // 3. Hasher le master key comme "password" (pour storage)
    const passwordHash = await argon2.hash(masterKey, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4,
    });

    // 4. Créer l'entité User
    const user = User.create({
      username: input.username,
      passwordHash,
      securityTier: input.securityTier as SecurityTier,
      masterKey, // Stocké en clair temporairement (sera chiffré plus tard)
    });

    // 5. Persister
    await this.userRepository.create(user);

    // 6. Générer tokens
    const accessToken = this.jwtService.generateAccessToken(user.id);
    const refreshToken = await this.jwtService.generateRefreshToken(user.id);

    // 7. Retourner
    return { user, mnemonic, accessToken, refreshToken };
  }
}
