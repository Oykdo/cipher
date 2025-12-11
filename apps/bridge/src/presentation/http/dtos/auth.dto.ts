/**
 * Authentication DTOs - Presentation Layer
 */

import { z } from 'zod';

// ===== SIGNUP DTOs =====

export const SignupRequestSchema = z.object({
  username: z.string().min(3).max(32),
  securityTier: z.enum(['standard', 'dice-key']),
  mnemonic: z.string().optional(), // For standard tier
  masterKeyHex: z.string().optional(), // For dice-key tier
});

export type SignupRequest = z.infer<typeof SignupRequestSchema>;

export interface SignupResponse {
  id: string;
  username: string;
  securityTier: 'standard' | 'dice-key';
  accessToken: string;
  refreshToken: string;
  mnemonic?: string; // Only returned for standard tier
}

// ===== LOGIN DTOs =====

export const LoginRequestSchema = z.object({
  username: z.string().min(3),
  masterKey: z.string().min(1),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export interface LoginResponse {
  user: {
    id: string;
    username: string;
    securityTier: string;
    createdAt: number;
  };
  accessToken: string;
  refreshToken: string;
}

// ===== REFRESH TOKEN DTOs =====

export const RefreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RefreshTokenRequest = z.infer<typeof RefreshTokenRequestSchema>;

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
}

// ===== LOGOUT DTOs =====

export const LogoutRequestSchema = z.object({
  refreshToken: z.string().optional(),
  logoutAll: z.boolean().optional(),
});

export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;

export interface LogoutResponse {
  message: string;
}
