/**
 * Base Error Class
 * 
 * Classe de base pour toutes les erreurs custom
 */

export abstract class BaseError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;
  abstract readonly isOperational: boolean;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
    };
  }
}

/**
 * Erreur opérationnelle (attendue, récupérable)
 * Ex: validation, not found, unauthorized
 */
export abstract class OperationalError extends BaseError {
  readonly isOperational = true;
}

/**
 * Erreur de programmation (bug, non récupérable)
 * Ex: null pointer, type error
 */
export abstract class ProgrammingError extends BaseError {
  readonly isOperational = false;
}
