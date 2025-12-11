import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SecurityTier = 'standard' | 'dice-key';

interface User {
  id: string;
  username: string;
  securityTier: SecurityTier;
}

export interface AuthSession {
  user: User;
  accessToken: string;
  refreshToken: string;
}

interface AuthState {
  session: AuthSession | null;
  setSession: (session: AuthSession) => void;
  clearSession: () => void;
  updateTokens: (accessToken: string, refreshToken: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      session: null,
      setSession: (session) => set({ session }),
      clearSession: () => set({ session: null }),
      updateTokens: (accessToken, refreshToken) =>
        set((state) => ({
          session: state.session
            ? { ...state.session, accessToken, refreshToken }
            : null,
        })),
    }),
    {
      name: 'cipher-pulse-auth',
      /**
       * SECURITY FIX VUL-007: Explicitly exclude sensitive tokens from localStorage
       * 
       * Only persist non-sensitive user info:
       * - user.id, user.username, user.securityTier
       * 
       * Tokens are NOT persisted:
       * - accessToken (must re-authenticate on reload)
       * - refreshToken (must re-authenticate on reload)
       * 
       * This prevents token theft via XSS or physical access to browser storage.
       */
      partialize: (state) => ({
        session: state.session ? {
          user: state.session.user, // Safe: non-sensitive user info
          accessToken: '', // SECURITY: Never persist tokens
          refreshToken: '', // SECURITY: Never persist tokens
        } : null,
      }),
    }
  )
);
