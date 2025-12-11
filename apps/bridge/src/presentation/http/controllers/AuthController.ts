/**
 * Authentication Controller - Presentation Layer
 * 
 * Gère les requêtes HTTP liées à l'authentification
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { LoginUseCase } from '../../../application/use-cases/auth/LoginUseCase';
import type { SignupUseCase } from '../../../application/use-cases/auth/SignupUseCase';
import {
  LoginRequestSchema,
  SignupRequestSchema,
  RefreshTokenRequestSchema,
  LogoutRequestSchema,
  type LoginResponse,
  type SignupResponse,
  type RefreshTokenResponse,
  type LogoutResponse,
} from '../dtos/auth.dto';

export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly signupUseCase: SignupUseCase
  ) {}

  /**
   * POST /auth/signup
   */
  async signup(request: FastifyRequest): Promise<SignupResponse> {
    // Validate input
    const input = SignupRequestSchema.parse(request.body);

    // Execute use case
    const result = await this.signupUseCase.execute({
      username: input.username,
      securityTier: input.securityTier,
      mnemonic: input.mnemonic,
      masterKeyHex: input.masterKeyHex,
    });

    // Return response
    return {
      id: result.user.id,
      username: result.user.username,
      securityTier: result.user.securityTier,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      mnemonic: result.mnemonic ? result.mnemonic.join(' ') : undefined,
    };
  }

  /**
   * POST /auth/login
   */
  async login(request: FastifyRequest): Promise<LoginResponse> {
    // Validate input
    const input = LoginRequestSchema.parse(request.body);

    // Execute use case
    const result = await this.loginUseCase.execute({
      username: input.username,
      masterKey: input.masterKey,
    });

    // Return response
    return {
      user: {
        id: result.user.id,
        username: result.user.username,
        securityTier: result.user.securityTier,
        createdAt: result.user.createdAt,
      },
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };
  }

  /**
   * POST /auth/refresh
   */
  async refresh(request: FastifyRequest): Promise<RefreshTokenResponse> {
    // Validate input
    const input = RefreshTokenRequestSchema.parse(request.body);

    // TODO: Implement RefreshTokenUseCase
    throw new Error('RefreshTokenUseCase not implemented yet');
  }

  /**
   * POST /auth/logout
   */
  async logout(request: FastifyRequest): Promise<LogoutResponse> {
    // Validate input
    const input = LogoutRequestSchema.parse(request.body);

    // TODO: Implement LogoutUseCase
    throw new Error('LogoutUseCase not implemented yet');
  }
}
