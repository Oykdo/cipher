/**
 * useErrorHandler Hook
 * 
 * Centralized error handling for async operations
 * Logs errors and provides user-friendly error messages
 */

import { useState, useCallback } from 'react';
import { logger } from '../lib/logger';

interface ErrorState {
  error: Error | null;
  message: string | null;
}

interface UseErrorHandlerReturn {
  error: Error | null;
  errorMessage: string | null;
  handleError: (error: unknown, context?: string) => void;
  clearError: () => void;
  wrapAsync: <T>(
    fn: () => Promise<T>,
    context?: string
  ) => Promise<T | undefined>;
}

/**
 * Hook for centralized error handling
 */
export function useErrorHandler(): UseErrorHandlerReturn {
  const [errorState, setErrorState] = useState<ErrorState>({
    error: null,
    message: null,
  });

  const handleError = useCallback((error: unknown, context?: string) => {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    const message = errorObj.message || 'An unexpected error occurred';

    logger.error(context || 'Error occurred', errorObj);

    setErrorState({
      error: errorObj,
      message,
    });
  }, []);

  const clearError = useCallback(() => {
    setErrorState({ error: null, message: null });
  }, []);

  const wrapAsync = useCallback(
    async <T,>(fn: () => Promise<T>, context?: string): Promise<T | undefined> => {
      try {
        clearError();
        return await fn();
      } catch (error) {
        handleError(error, context);
        return undefined;
      }
    },
    [handleError, clearError]
  );

  return {
    error: errorState.error,
    errorMessage: errorState.message,
    handleError,
    clearError,
    wrapAsync,
  };
}