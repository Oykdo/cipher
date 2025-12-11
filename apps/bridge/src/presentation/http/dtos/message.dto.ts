/**
 * Message DTOs - Presentation Layer
 */

import { z } from 'zod';

// ===== SEND MESSAGE DTOs =====

export const SendMessageRequestSchema = z.object({
  body: z.string().min(1).max(10000),
  unlockBlockHeight: z.number().int().positive().optional(),
  scheduledBurnAt: z.number().int().positive().optional(),
});

export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

export interface SendMessageResponse {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: number;
  unlockBlockHeight?: number;
  isLocked: boolean;
  isBurned: boolean;
  scheduledBurnAt?: number;
}

// ===== GET MESSAGES DTOs =====

export const GetMessagesQuerySchema = z.object({
  limit: z.string().transform(Number).pipe(z.number().int().positive().max(200)).optional(),
  before: z.string().transform(Number).pipe(z.number().int().positive()).optional(),
});

export type GetMessagesQuery = z.infer<typeof GetMessagesQuerySchema>;

export interface GetMessagesResponse {
  messages: Array<{
    id: string;
    conversationId: string;
    senderId: string;
    body: string;
    createdAt: number;
    unlockBlockHeight?: number;
    isLocked: boolean;
    isBurned: boolean;
    burnedAt?: number;
    scheduledBurnAt?: number;
  }>;
  hasMore: boolean;
}

// ===== ACKNOWLEDGE MESSAGE DTOs =====

export const AcknowledgeMessageRequestSchema = z.object({
  messageId: z.string().uuid(),
  conversationId: z.string().uuid(),
});

export type AcknowledgeMessageRequest = z.infer<typeof AcknowledgeMessageRequestSchema>;

export interface AcknowledgeMessageResponse {
  success: boolean;
}

// ===== BURN MESSAGE DTOs =====

export const BurnMessageRequestSchema = z.object({
  messageId: z.string().uuid(),
  conversationId: z.string().uuid(),
});

export type BurnMessageRequest = z.infer<typeof BurnMessageRequestSchema>;

export interface BurnMessageResponse {
  success: boolean;
  burnedAt: number;
}
