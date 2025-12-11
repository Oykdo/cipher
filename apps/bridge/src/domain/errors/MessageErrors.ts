/**
 * Message Domain Errors
 */

import { OperationalError } from './BaseError';

export class MessageNotFoundError extends OperationalError {
  readonly statusCode = 404;
  readonly code = 'MESSAGE_NOT_FOUND';

  constructor(messageId: string) {
    super(`Message not found: ${messageId}`);
  }
}

export class MessageLockedError extends OperationalError {
  readonly statusCode = 423;
  readonly code = 'MESSAGE_LOCKED';

  constructor(messageId: string, unlockBlockHeight: number) {
    super(`Message ${messageId} is locked until block ${unlockBlockHeight}`);
  }
}

export class MessageAlreadyAcknowledgedError extends OperationalError {
  readonly statusCode = 409;
  readonly code = 'MESSAGE_ALREADY_ACKNOWLEDGED';

  constructor(messageId: string) {
    super(`Message ${messageId} has already been acknowledged`);
  }
}

export class InvalidUnlockHeightError extends OperationalError {
  readonly statusCode = 400;
  readonly code = 'INVALID_UNLOCK_HEIGHT';

  constructor(message?: string) {
    super(message || 'Unlock block height must be in the future');
  }
}

export class MessageBurnedError extends OperationalError {
  readonly statusCode = 410;
  readonly code = 'MESSAGE_BURNED';

  constructor(messageId: string) {
    super(`Message ${messageId} has been burned (Burn After Reading)`);
  }
}
