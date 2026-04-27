import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
// HashRouter (URLs with `#/path`) instead of HashRouter (clean `/path`):
// the packaged Electron build loads from a `file://` URL, where the OS
// has no opinion on `/signup` and a navigation simply 404s on the
// filesystem. HashRouter keeps every route attached to the same
// `index.html` via the URL fragment, which works under any protocol.
// In dev (Vite server) this just means seeing `localhost:5173/#/login`
// instead of `localhost:5173/login` — same behaviour, prefixed with `#`.
import { HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';
import './styles/fluidCrypto.css';
import { migrateMasterKeyToSecureStorage } from './migrations/migrateMasterKey';
import { logger } from './lib/logger';
import './i18n'; // Initialize i18n

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Initialize app with security migrations
 */
async function initApp() {
  logger.info('🔐 Running security migrations...');
  
  try {
    // Run masterKey migration
    const migrationResult = await migrateMasterKeyToSecureStorage();
    
    if (migrationResult.status === 'success') {
      logger.info('✅ Security migration completed successfully');
    } else if (migrationResult.status === 'not_needed') {
      logger.info('ℹ️ Security migration not needed (already up to date)');
    } else {
      logger.error('❌ Security migration failed', undefined, { message: migrationResult.message });
      // Continue anyway - app will use IndexedDB if available, fallback to existing storage
    }
  } catch (error) {
    logger.error('❌ Migration error', error);
    // Continue anyway to not block app launch
  }
  
  // Render app
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <HashRouter>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </HashRouter>
    </StrictMode>
  );
}

// Start app with migrations
initApp();
