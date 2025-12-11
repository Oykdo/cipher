/**
 * Validation Errors
 */

import { OperationalError } from './BaseError';

export class ValidationError extends OperationalError {
  readonly statusCode = 400;
  readonly code = 'VALIDATION_ERROR';

  constructor(message: string, public readonly fields?: Record<string, string[]>) {
    super(message);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      fields: this.fields,
    };
  }
}

export class InvalidInputError extends OperationalError {
  readonly statusCode = 400;
  readonly code = 'INVALID_INPUT';

  constructor(message: string) {
    super(message);
  }
}

export class MissingRequiredFieldError extends OperationalError {
  readonly statusCode = 400;
  readonly code = 'MISSING_REQUIRED_FIELD';

  constructor(fieldName: string) {
    super(`Missing required field: ${fieldName}`);
  }
}
