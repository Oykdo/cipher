/**
 * Error Boundary Component
 * 
 * Catches React errors and displays a fallback UI
 * Logs errors for debugging
 */

import { Component, type ReactNode } from 'react';
import { logger } from '@/core/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log error with component stack
    logger.error('React Error Boundary caught an error', error);
    
    // Log component stack separately if available
    if (errorInfo.componentStack) {
      logger.debug('Component stack trace', {
        componentStack: errorInfo.componentStack,
      });
    }
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-800 rounded-xl p-6 border border-slate-700">
            <div className="text-center space-y-4">
              <div className="text-6xl">⚠️</div>
              <h1 className="text-2xl font-bold text-slate-100">
                Oops! Something went wrong
              </h1>
              <p className="text-slate-400">
                An unexpected error occurred. Please try refreshing the page.
              </p>
              
              {import.meta.env?.DEV && this.state.error && (
                <details className="text-left mt-4">
                  <summary className="cursor-pointer text-sm text-slate-500 hover:text-slate-400">
                    Error details (dev only)
                  </summary>
                  <pre className="mt-2 p-3 bg-slate-900 rounded text-xs text-rose-400 overflow-auto max-h-64">
                    {this.state.error.message}
                    {'\n\n'}
                    {this.state.error.stack}
                  </pre>
                </details>
              )}

              <div className="flex gap-3 justify-center pt-4">
                <button
                  onClick={this.handleReset}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-lg transition-colors"
                >
                  Try Again
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                >
                  Refresh Page
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
