/**
 * Local Storage Helper - Wallet-style Quick Unlock
 * 
 * Inspired by MetaMask and crypto wallets
 * Detects if user has previously logged in on this device
 */

export interface LocalAccount {
  username: string;
  securityTier: 'standard' | 'dice-key';
  lastUsed?: number;
}

const KNOWN_ACCOUNTS_KEY = 'cipher_pulse_known_accounts';

/**
 * Save a known account to persistent storage (independent of password)
 */
export function saveKnownAccount(account: LocalAccount): void {
  try {
    const accounts = getKnownAccounts();
    const existingIndex = accounts.findIndex(a => a.username === account.username);

    if (existingIndex >= 0) {
      accounts[existingIndex] = { ...accounts[existingIndex], ...account, lastUsed: Date.now() };
    } else {
      accounts.push({ ...account, lastUsed: Date.now() });
    }

    localStorage.setItem(KNOWN_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch (e) {
    console.error('Failed to save known account:', e);
  }
}

/**
 * Get known accounts from metadata storage
 */
function getKnownAccounts(): LocalAccount[] {
  try {
    const stored = localStorage.getItem(KNOWN_ACCOUNTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error('Failed to parse known accounts:', e);
    return [];
  }
}

/**
 * Get all accounts stored on this device
 * Merges accounts found via pwd_ scan and known_accounts metadata
 */
export function getLocalAccounts(): LocalAccount[] {
  const accountsMap = new Map<string, LocalAccount>();

  // 1. Load from known_accounts metadata
  const knownAccounts = getKnownAccounts();
  knownAccounts.forEach(acc => accountsMap.set(acc.username, acc));

  // 2. Scan localStorage for password hashes (pwd_*) - Backward compatibility & Sync
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;

    if (key.startsWith('pwd_')) {
      const username = key.substring(4); // Remove 'pwd_' prefix

      if (!accountsMap.has(username)) {
        // Found an account with password but no metadata, add it
        accountsMap.set(username, {
          username,
          securityTier: 'standard', // Default assumption
          lastUsed: undefined,
        });
      }
    }
  }

  return Array.from(accountsMap.values());
}

/**
 * Get the most recently used account
 */
export function getLastUsedAccount(): LocalAccount | null {
  const accounts = getLocalAccounts();

  if (accounts.length === 0) return null;

  // Try to get from Zustand persist storage
  try {
    const authStorage = localStorage.getItem('cipher-pulse-auth');
    if (authStorage) {
      const parsed = JSON.parse(authStorage);
      if (parsed?.state?.session?.user?.username) {
        const lastUsername = parsed.state.session.user.username;
        const account = accounts.find(a => a.username === lastUsername);
        if (account) return account;
      }
    }
  } catch (e) {
    console.error('Failed to parse auth storage:', e);
  }

  // Sort by lastUsed if available
  return accounts.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))[0];
}

/**
 * Check if a specific account has a local password set
 */
export function hasLocalPassword(username: string): boolean {
  return localStorage.getItem(`pwd_${username.toLowerCase()}`) !== null;
}

/**
 * Check if a specific account exists locally (legacy name, now checks password)
 */
export function hasLocalAccount(username: string): boolean {
  return hasLocalPassword(username);
}

/**
 * Get stored password hash for an account
 */
export function getPasswordHash(username: string): string | null {
  return localStorage.getItem(`pwd_${username.toLowerCase()}`);
}

/**
 * Get stored master key for an account (legacy)
 *
 * SECURITY: Master keys are now stored encrypted in KeyVault/IndexedDB.
 * This helper is kept only for backward compatibility and will always
 * return null for new installations.
 */
export function getMasterKey(_username: string): string | null {
  return null;
}

/**
 * Clear all local account data (logout)
 */
export function clearLocalAccount(username: string): void {
  const normalized = username.toLowerCase();
  localStorage.removeItem(`pwd_${normalized}`);
  localStorage.removeItem(`master_${normalized}`);

  // Also remove from known accounts? 
  // If we want to "forget" the user completely:
  const accounts = getKnownAccounts().filter(a => a.username !== username);
  localStorage.setItem(KNOWN_ACCOUNTS_KEY, JSON.stringify(accounts));
}

/**
 * Clear password cache for a specific user (but keep in known accounts)
 */
export function clearPasswordCache(username: string): void {
  localStorage.removeItem(`pwd_${username.toLowerCase()}`);
}

/**
 * Clear all accounts (factory reset)
 */
export function clearAllLocalAccounts(): void {
  const accounts = getLocalAccounts();
  accounts.forEach(account => {
    localStorage.removeItem(`pwd_${account.username}`);
    localStorage.removeItem(`master_${account.username}`);
  });

  localStorage.removeItem(KNOWN_ACCOUNTS_KEY);

  // Also clear Zustand persist storage
  localStorage.removeItem('cipher-pulse-auth');
}

/**
 * Check if device has any accounts (wallet-style)
 */
export function hasAnyLocalAccount(): boolean {
  return getLocalAccounts().length > 0;
}

/**
 * Clear QuickConnect cache for all users
 * This will force users to use full login instead of quick unlock
 * BUT keeps the users in the list (known_accounts)
 */
export function clearQuickConnectCache(): void {
  debugLogger.debug('🗑️ [QuickConnect] Clearing QuickConnect cache...');

  // Get all accounts first
  const accounts = getLocalAccounts();

  // Clear password hashes for all accounts
  accounts.forEach(account => {
    localStorage.removeItem(`pwd_${account.username}`);
    debugLogger.debug(`  ✅ Cleared pwd_${account.username}`);
  });

  // Clear auth session
  localStorage.removeItem('cipher-pulse-auth');
  debugLogger.debug('  ✅ Cleared cipher-pulse-auth');

  // Clear secure auth session
  localStorage.removeItem('cipher-pulse-auth-secure');
  debugLogger.debug('  ✅ Cleared cipher-pulse-auth-secure');

  debugLogger.info('✅ [QuickConnect] Cache cleared successfully');
  // SECURITY: Sensitive log removed');
}
