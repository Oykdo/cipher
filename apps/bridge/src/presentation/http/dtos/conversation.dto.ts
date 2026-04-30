/**
 * Conversation DTOs - Presentation Layer
 */

import { z } from 'zod';

// ===== CREATE CONVERSATION DTOs =====

export const CreateConversationRequestSchema = z.object({
  targetUsername: z.string().min(3).max(32),
});

export type CreateConversationRequest = z.infer<typeof CreateConversationRequestSchema>;

export interface CreateConversationResponse {
  id: string;
  createdAt: number;
  participants: Array<{
    id: string;
    username: string;
  }>;
}

// ===== LIST CONVERSATIONS DTOs =====

export interface ListConversationsResponse {
  conversations: Array<{
    id: string;
    type: 'direct' | 'group';
    createdAt: number;
    lastMessageAt?: number;
    lastMessagePreview?: string;
    members: Array<{ id: string; username: string }>;
    memberCount: number;
    createdBy: string | null;
    encryptedTitle?: string | null;
    /** Convenience field for direct conversations only. */
    otherParticipant?: {
      id: string;
      username: string;
    };
  }>;
}

// ===== GET CONVERSATION DTOs =====

export interface GetConversationResponse {
  id: string;
  createdAt: number;
  participants: Array<{
    id: string;
    username: string;
  }>;
}
