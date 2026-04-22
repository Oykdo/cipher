import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import { ErrorBoundary } from './components/ErrorBoundary';
import { proactiveTokenRefresh } from './services/api-interceptor';
import { useKeyInitialization } from './hooks/useKeyInitialization';
import { AppLockOverlay } from './components/AppLockOverlay';
import { useAppLockActivity } from './hooks/useAppLockActivity';

const Landing = lazy(() => import('./screens/Landing'));
const LoginNew = lazy(() => import('./screens/LoginNew'));
const Welcome = lazy(() => import('./screens/Welcome'));
const SignupFluid = lazy(() => import('./screens/SignupFluid'));
const Discover = lazy(() => import('./screens/Discover'));
const Conversations = lazy(() => import('./screens/Conversations'));
const Settings = lazy(() => import('./screens/Settings').then(m => ({ default: m.Settings })));
const P2PChat = lazy(() => import('./screens/P2PChat'));
const MonitoringDashboard = lazy(() => import('./screens/MonitoringDashboard'));
const NotFound = lazy(() => import('./screens/NotFound'));
const Recovery = lazy(() => import('./screens/Recovery'));
const GenesisAnimation = lazy(() => import('./screens/GenesisAnimation'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const session = useAuthStore((state) => state.session);
  
  // Check if user exists in session (tokens may be empty after page reload due to security)
  // If user exists but no token, they need to re-authenticate via QuickUnlock or login
  const hasUser = !!session?.user?.id;
  const hasToken = !!session?.accessToken;

  if (!hasUser) {
    // No user at all - redirect to login
    return <Navigate to="/login" replace />;
  }

  if (!hasToken) {
    // User exists but no token (page was reloaded) - redirect to landing
    // Landing page will show QuickUnlock for existing local accounts
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function App() {
  const session = useAuthStore((state) => state.session);
  // Consider authenticated if both user and token exist
  const isAuthenticated = !!session?.user?.id && !!session?.accessToken;

  // App-lock: tracks user activity + auto-locks after 30 min idle. Mounted at
  // the root so a single listener covers every screen. No-op when the PIN
  // feature is disabled in Settings.
  useAppLockActivity();

  // Initialize e2ee-v2 keys automatically for logged-in users
  const keyInit = useKeyInitialization();

  // Log key initialization status
  useEffect(() => {
    if (keyInit.initialized && keyInit.keysExist) {
      console.log('🔐 [App] e2ee-v2 keys ready');
    } else if (keyInit.error) {
      console.error('❌ [App] Key initialization error:', keyInit.error);
    }
  }, [keyInit.initialized, keyInit.keysExist, keyInit.error]);

  // Proactive token refresh - refresh 5 minutes before expiration
  useEffect(() => {
    if (!session?.accessToken) return;

    const interval = setInterval(() => {
      proactiveTokenRefresh(session.accessToken, 5 * 60 * 1000);
    }, 60 * 1000); // Check every minute

    return () => clearInterval(interval);
  }, [session?.accessToken]);

  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="dark-matter-bg min-h-screen" />}>
        <Routes>
          {/* Landing Page */}
          <Route
            path="/"
            element={
              isAuthenticated ? <Navigate to="/conversations" replace /> : <Landing />
            }
          />

          {/* Discover Page */}
          <Route path="/discover" element={<Discover />} />

          {/* Auth Routes */}
          <Route path="/login" element={<LoginNew />} />
          <Route path="/signup" element={<SignupFluid />} />
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/recovery" element={<Recovery />} />
          <Route path="/genesis" element={<GenesisAnimation />} />

          {/* Protected Routes */}
          <Route
            path="/conversations"
            element={
              <ProtectedRoute>
                <Conversations />
              </ProtectedRoute>
            }
          />

          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />

          {/* P2P Chat Demo */}
          <Route
            path="/p2p-demo"
            element={
              <ProtectedRoute>
                <P2PChat />
              </ProtectedRoute>
            }
          />

          {/* Monitoring Dashboard */}
          <Route
            path="/monitoring"
            element={
              <ProtectedRoute>
                <MonitoringDashboard />
              </ProtectedRoute>
            }
          />

          {/* 404 - Catch all */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <AppLockOverlay />
    </ErrorBoundary>
  );
}

export default App;
