/**
 * Authentication & Authorization Errors
 */

import { OperationalError } from './BaseError';

export class UnauthorizedError extends OperationalError {
  readonly statusCode = 401;
  readonly code = 'UNAUTHORIZED';

  constructor(message: string = 'Unauthorized') {
    super(message);
  }
}

export class TokenExpiredError extends OperationalError {
  readonly statusCode = 401;
  readonly code = 'TOKEN_EXPIRED';

  constructor() {
    super('Access token has expired');
  }
}

export class InvalidTokenError extends OperationalError {
  readonly statusCode = 401;
  readonly code = 'INVALID_TOKEN';

  constructor() {
    super('Invalid or malformed token');
  }
}

export class RefreshTokenNotFoundError extends OperationalError {
  readonly statusCode = 401;
  readonly code = 'REFRESH_TOKEN_NOT_FOUND';

  constructor() {
    super('Refresh token not found or has been revoked');
  }
}

export class ForbiddenError extends OperationalError {
  readonly statusCode = 403;
  readonly code = 'FORBIDDEN';

  constructor(message: string = 'Forbidden') {
    super(message);
  }
}
