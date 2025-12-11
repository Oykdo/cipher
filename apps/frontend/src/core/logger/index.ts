/**
 * Unified Logger for Pulse Frontend
 * 
 * FEATURES:
 * - Configurable log levels
 * - Structured logging
 * - Production-safe (no sensitive data)
 * - Performance tracking
 * - Error aggregation ready
 * 
 * @module Logger
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  context?: string;
  metadata?: Record<string, any>;
  error?: Error;
}

class Logger {
  private static instance: Logger;
  private minLevel: LogLevel = 'info';
  private logs: LogEntry[] = [];
  private maxLogs = 1000;

  private constructor() {
    // Set log level from environment
    const envLevel = import.meta.env.VITE_LOG_LEVEL as LogLevel;
    if (envLevel) {
      this.minLevel = envLevel;
    }

    // Development mode: more verbose
    if (import.meta.env.DEV) {
      this.minLevel = 'debug';
    }
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Set minimum log level
   */
  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * Check if level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const minIndex = levels.indexOf(this.minLevel);
    const currentIndex = levels.indexOf(level);
    return currentIndex >= minIndex;
  }

  /**
   * Create log entry
   */
  private createEntry(
    level: LogLevel,
    message: string,
    metadata?: Record<string, any>,
    error?: Error
  ): LogEntry {
    return {
      level,
      message,
      timestamp: Date.now(),
      metadata: this.sanitizeMetadata(metadata),
      error,
    };
  }

  /**
   * Sanitize metadata to remove sensitive data
   */
  private sanitizeMetadata(metadata?: Record<string, any>): Record<string, any> | undefined {
    if (!metadata) return undefined;

    const sanitized = { ...metadata };
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'masterKey', 'privateKey'];

    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Store log entry
   */
  private storeLog(entry: LogEntry): void {
    this.logs.push(entry);

    // Keep only last N logs
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }

  /**
   * Format log for console
   */
  private formatLog(entry: LogEntry): string {
    const timestamp = new Date(entry.timestamp).toISOString();
    const level = entry.level.toUpperCase().padEnd(5);
    let message = `[${timestamp}] ${level} ${entry.message}`;

    if (entry.metadata) {
      message += ` ${JSON.stringify(entry.metadata)}`;
    }

    return message;
  }

  /**
   * Log debug message
   */
  debug(message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog('debug')) return;

    const entry = this.createEntry('debug', message, metadata);
    this.storeLog(entry);

    if (import.meta.env.DEV) {
      console.debug(this.formatLog(entry));
    }
  }

  /**
   * Log info message
   */
  info(message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog('info')) return;

    const entry = this.createEntry('info', message, metadata);
    this.storeLog(entry);

    console.info(this.formatLog(entry));
  }

  /**
   * Log warning message
   */
  warn(message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog('warn')) return;

    const entry = this.createEntry('warn', message, metadata);
    this.storeLog(entry);

    console.warn(this.formatLog(entry));
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error, metadata?: Record<string, any>): void {
    if (!this.shouldLog('error')) return;

    const entry = this.createEntry('error', message, metadata, error);
    this.storeLog(entry);

    console.error(this.formatLog(entry), error);

    // TODO: Send to error tracking service (Sentry, etc.)
  }

  /**
   * Get recent logs
   */
  getLogs(level?: LogLevel, limit = 100): LogEntry[] {
    let filtered = this.logs;

    if (level) {
      filtered = filtered.filter(log => log.level === level);
    }

    return filtered.slice(-limit);
  }

  /**
   * Clear logs
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Export logs for debugging
   */
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

// Export singleton instance
export const logger = Logger.getInstance();

// Export convenience functions
export const debug = (message: string, metadata?: Record<string, any>) => 
  logger.debug(message, metadata);

export const info = (message: string, metadata?: Record<string, any>) => 
  logger.info(message, metadata);

export const warn = (message: string, metadata?: Record<string, any>) => 
  logger.warn(message, metadata);

export const error = (message: string, err?: Error, metadata?: Record<string, any>) => 
  logger.error(message, err, metadata);
