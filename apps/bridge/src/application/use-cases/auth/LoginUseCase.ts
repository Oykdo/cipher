/**
 * Login Use Case - Application Layer
 * 
 * Gère l'authentification utilisateur
 */

import type { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { InvalidCredentialsError } from '../../../domain/errors';
import type { User } from '../../../domain/entities/User';
import * as argon2 from 'argon2';

export interface LoginInput {
  username: string;
  masterKey: string; // Master key from BIP-39 or DiceKey
}

export interface LoginOutput {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export class LoginUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly jwtService: JWTService
  ) {}

  async execute(input: LoginInput): Promise<LoginOutput> {
    // 1. Trouver l'utilisateur
    const user = await this.userRepository.findByUsername(input.username);
    if (!user) {
      throw new InvalidCredentialsError();
    }

    // 2. Vérifier le master key (comparaison avec hash Argon2)
    const valid = await argon2.verify(user.passwordHash, input.masterKey);
    if (!valid) {
      throw new InvalidCredentialsError();
    }

    // 3. Générer tokens JWT
    const accessToken = this.jwtService.generateAccessToken(user.id);
    const refreshToken = this.jwtService.generateRefreshToken(user.id);

    // 4. Retourner
    return { user, accessToken, refreshToken };
  }
}

/**
 * JWT Service Interface (à implémenter)
 */
export interface JWTService {
  generateAccessToken(userId: string): string;
  generateRefreshToken(userId: string): string;
  verifyAccessToken(token: string): { userId: string };
  verifyRefreshToken(token: string): { userId: string };
}
