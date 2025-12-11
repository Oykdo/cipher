/**
 * Route Types and Schemas
 * Type-safe request/response definitions for all routes
 */

export interface MessageAckParams {
  id: string;
}

export interface MessageAckBody {
  burnDuration?: number;
}

export interface BackupRestoreBody {
  backupFile: string;
}

export interface MessageSendBody {
  conversationId: string;
  body: string;
  unlockBlockHeight?: number;
  scheduledBurnAt?: number;
}

export interface ConversationCreateBody {
  recipientUsername: string;
  initialMessage?: string;
}

// JSON Schema definitions for validation
export const MessageAckSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' }
    }
  },
  body: {
    type: 'object',
    properties: {
      burnDuration: { type: 'number', minimum: 1, maximum: 3600 }
    }
  }
} as const;

export const BackupRestoreSchema = {
  body: {
    type: 'object',
    required: ['backupFile'],
    properties: {
      backupFile: { type: 'string' }
    }
  }
} as const;

export const MessageSendSchema = {
  body: {
    type: 'object',
    required: ['conversationId', 'body'],
    properties: {
      conversationId: { type: 'string' },
      body: { type: 'string' },
      unlockBlockHeight: { type: 'number' },
      scheduledBurnAt: { type: 'number' }
    }
  }
} as const;
