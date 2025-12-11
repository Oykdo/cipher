/**
 * Conversation Domain Errors
 */

import { OperationalError } from './BaseError';

export class ConversationNotFoundError extends OperationalError {
  readonly statusCode = 404;
  readonly code = 'CONVERSATION_NOT_FOUND';

  constructor(conversationId: string) {
    super(`Conversation not found: ${conversationId}`);
  }
}

export class NotConversationParticipantError extends OperationalError {
  readonly statusCode = 403;
  readonly code = 'NOT_CONVERSATION_PARTICIPANT';

  constructor(conversationId: string, userId: string) {
    super(`User ${userId} is not a participant in conversation ${conversationId}`);
  }
}

export class ConversationAlreadyExistsError extends OperationalError {
  readonly statusCode = 409;
  readonly code = 'CONVERSATION_ALREADY_EXISTS';

  constructor(participants: [string, string]) {
    super(`Conversation already exists between ${participants[0]} and ${participants[1]}`);
  }
}
