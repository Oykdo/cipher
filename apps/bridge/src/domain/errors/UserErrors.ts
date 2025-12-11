/**
 * User Domain Errors
 */

import { OperationalError } from './BaseError';

export class UserNotFoundError extends OperationalError {
  readonly statusCode = 404;
  readonly code = 'USER_NOT_FOUND';

  constructor(identifier: string) {
    super(`User not found: ${identifier}`);
  }
}

export class UserAlreadyExistsError extends OperationalError {
  readonly statusCode = 409;
  readonly code = 'USER_ALREADY_EXISTS';

  constructor(username: string) {
    super(`User already exists: ${username}`);
  }
}

export class InvalidCredentialsError extends OperationalError {
  readonly statusCode = 401;
  readonly code = 'INVALID_CREDENTIALS';

  constructor() {
    super('Invalid username or password');
  }
}

export class InsufficientReputationError extends OperationalError {
  readonly statusCode = 403;
  readonly code = 'INSUFFICIENT_REPUTATION';

  constructor(currentReputation: number, required: number = -10) {
    super(`Insufficient reputation: ${currentReputation} (required: >= ${required})`);
  }
}
