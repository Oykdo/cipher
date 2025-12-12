import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import { ErrorBoundary } from './components/ErrorBoundary';
import { proactiveTokenRefresh } from './services/api-interceptor';
import { useKeyInitialization } from './hooks/useKeyInitialization';

const Landing = lazy(() => import('./screens/Landing'));
const Login = lazy(() => import('./screens/Login'));
const LoginNew = lazy(() => import('./screens/LoginNew'));
const Welcome = lazy(() => import('./screens/Welcome'));
const Signup = lazy(() => import('./screens/Signup'));
const SignupFluid = lazy(() => import('./screens/SignupFluid'));
const LoginFluid = lazy(() => import('./screens/LoginFluid'));
const Discover = lazy(() => import('./screens/Discover'));
const Conversations = lazy(() => import('./screens/Conversations'));
const Settings = lazy(() => import('./screens/Settings').then(m => ({ default: m.Settings })));
const P2PChat = lazy(() => import('./screens/P2PChat'));
const MonitoringDashboard = lazy(() => import('./screens/MonitoringDashboard'));
const NotFound = lazy(() => import('./screens/NotFound'));
const Recovery = lazy(() => import('./screens/Recovery'));

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

          {/* Auth Routes - Use New versions */}
          <Route path="/login" element={<LoginNew />} />
          <Route path="/login-fluid" element={<LoginFluid />} />
          <Route path="/signup" element={<SignupFluid />} />
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/recovery" element={<Recovery />} />

          {/* Legacy Routes (keep for compatibility) */}
          <Route path="/login-old" element={<Login />} />
          <Route path="/signup-old" element={<Signup />} />

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
    </ErrorBoundary>
  );
}

export default App;
