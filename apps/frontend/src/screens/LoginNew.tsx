/**
 * Login Page - Fluid Cryptography Edition
 *
 * Deux flux dissociés :
 * 1. Standard : Username + Mot de passe (BIP-39 mnemonic)
 * 2. DiceKey : 300 dés → Régénération Identity Key
 */

import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { TFunction } from 'i18next';
import { useAuthStore } from '../store/auth';
import { API_BASE_URL } from '../config';
import { getKeyVault } from '../lib/keyVault';
import { saveKnownAccount } from '../lib/localStorage';
import { setTemporaryMasterKey } from '../lib/secureKeyAccess';
import { setSessionMasterKey } from '../lib/masterKeyResolver';
import { initializeE2EE } from '../lib/e2ee/e2eeService';
import * as srp from 'secure-remote-password/client';
import '../styles/fluidCrypto.css';
import CosmicLoader from '../components/CosmicLoader';


import { debugLogger } from "../lib/debugLogger";
// Helper for delay
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));



async function encryptData(data: string, password: string): Promise<string | null> {
  try {
    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const passwordKey = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      passwordKey,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      key,
      enc.encode(data)
    );

    const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    combined.set(salt);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);

    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error('Encryption error:', error);
    return null;
  }
}

async function decryptData(encryptedData: string, password: string): Promise<string | null> {
  try {
    const enc = new TextEncoder();
    const dec = new TextDecoder();

    // Decode the base64
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));

    // Extract salt, iv, and encrypted data
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const encrypted = combined.slice(28);

    // Derive key from password
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      passwordKey,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      key,
      encrypted
    );

    return dec.decode(decrypted);
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
}

type Method = 'standard' | 'dicekey' | 'mnemonic' | 'file';
type DiceKeyStep = 'credentials' | 'setpassword';
type StandardStep = 'form';
type MnemonicStep = 'form';

export default function LoginNew() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as {
    userId?: string;
    checksums?: string[];
    autoSetPassword?: boolean;
    username?: string;
  } | null;
  const setSession = useAuthStore((state) => state.setSession);

  // Method selection
  const [method, setMethod] = useState<Method | null>(null);

  // Standard login state
  const [_standardStep, _setStandardStep] = useState<StandardStep>('form');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [standardError, setStandardError] = useState('');
  const [standardLoading, setStandardLoading] = useState(false);

  // Mnemonic login state
  const [_mnemonicStep, _setMnemonicStep] = useState<MnemonicStep>('form');
  const [mnemonicUsername, setMnemonicUsername] = useState('');
  const [mnemonicPhrase, setMnemonicPhrase] = useState('');
  const [mnemonicError, setMnemonicError] = useState('');
  const [mnemonicLoading, setMnemonicLoading] = useState(false);

  // DiceKey login state
  const [diceKeyStep, setDiceKeyStep] = useState<DiceKeyStep>('credentials');
  const [diceKeyUserId, setDiceKeyUserId] = useState('');
  const [diceKeyUsername, setDiceKeyUsername] = useState(''); // Added: store username for DiceKey login
  const [diceKeyChecksums, setDiceKeyChecksums] = useState<string[]>([]);
  const [expectedChecksums, setExpectedChecksums] = useState<string[]>([]);
  const [newPassword, setNewPassword] = useState('');

  const [confirmPassword, setConfirmPassword] = useState('');

  // File login state
  const [fileError, setFileError] = useState('');
  const [fileLoading, setFileLoading] = useState(false);

  // Error state
  const [error, setError] = useState('');

  // Cosmic Loader State
  const [showLoader, setShowLoader] = useState(false);
  const [loaderStage, setLoaderStage] = useState<'normalizing' | 'argon2' | 'hkdf' | 'keygen' | 'complete'>('normalizing');
  const [loaderProgress, setLoaderProgress] = useState(0);

  // Auto-redirect to password setup from Welcome page after account creation
  useEffect(() => {
    if (locationState?.autoSetPassword && locationState?.username) {
      // Account already created, go straight to password setup
      setMethod('dicekey');
      setDiceKeyStep('setpassword');
      setDiceKeyUsername(locationState.username);
      return;
    }

    // Pre-fill from Welcome page (old flow, kept for compatibility)
    if (locationState?.userId && locationState?.checksums) {
      setMethod('dicekey');
      setDiceKeyUserId(locationState.userId);
      setDiceKeyChecksums(locationState.checksums);
      setExpectedChecksums(locationState.checksums);

      // Try to get username from pendingSignup
      const pendingSignup = sessionStorage.getItem('pendingSignup');
      if (pendingSignup) {
        try {
          const signupData = JSON.parse(pendingSignup);
          if (signupData.username) {
            setDiceKeyUsername(signupData.username);
          }
        } catch (e) {
          console.error('Failed to parse pendingSignup:', e);
        }
      }
    }
  }, [locationState]);

  const handleMethodChoice = (selectedMethod: Method) => {
    setMethod(selectedMethod);
  };

  // ============================================================================ 
  // STANDARD LOGIN (Username + Password)
  // ============================================================================ 

  // ... existing imports ...

  const handleStandardLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setStandardError('');
    // setStandardLoading(true); // Replaced by CosmicLoader

    try {
      // Validate inputs
      if (username.length < 3) {
        throw new Error(t('auth.error_username_length'));
      }

      if (password.length < 6) {
        throw new Error(t('auth.error_password_length'));
      }

      // Start Cosmic Loader
      setShowLoader(true);
      setLoaderStage('normalizing');
      setLoaderProgress(10);
      await sleep(300);

      setLoaderStage('argon2');
      setLoaderProgress(30);
      await sleep(500);

      // --- SRP LOGIN FLOW ---
      try {
        // 1. Init
        const ephemeral = srp.generateEphemeral();
        const initResponse = await fetch(`${API_BASE_URL}/api/v2/auth/srp/login/init`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username,
            A: ephemeral.public,
          }),
        });

        if (initResponse.ok) {
          const initData = await initResponse.json();
          const { salt, B, sessionId } = initData;

          // 2. Derive
          const privateKey = srp.derivePrivateKey(salt, username, password);
          const session = srp.deriveSession(ephemeral.secret, B, salt, username, privateKey);

          // 3. Verify
          const verifyResponse = await fetch(`${API_BASE_URL}/api/v2/auth/srp/login/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username,
              M1: session.proof,
              sessionId,
            }),
          });

          if (!verifyResponse.ok) {
            const errorData = await verifyResponse.json();
            throw new Error(errorData.error || t('auth.error_invalid_credentials'));
          }

          const verifyData = await verifyResponse.json();

          // 4. Validate Server Proof
          srp.verifySession(ephemeral.public, session, verifyData.M2);

          // Success!
          setLoaderStage('hkdf');
          setLoaderProgress(70);
          await sleep(300);

          setLoaderStage('complete');
          setLoaderProgress(100);

          // Wait for breakthrough animation
          await sleep(1500);

          // Retrieve masterKey from KeyVault (needed for encryption)
          try {
            const vault = await getKeyVault(password);
            const masterKeyHex = await vault.getData(`masterKey:${username}`);
            if (masterKeyHex) {
              await setSessionMasterKey(masterKeyHex);
              // SECURITY: MasterKey loaded (not logging for security)

          // Init E2EE vault (keyed by masterKey) so E2EE storage works regardless of login method
          try {
            const { getE2EEVault } = await import('../lib/keyVault');
            await getE2EEVault(masterKeyHex);
          } catch (vaultInitErr) {
            console.warn('[LoginNew] Failed to init E2EE vault:', vaultInitErr);
          }

              // Best-effort: enable mnemonic/seed login for this account (for other devices)
              if (verifyData.user.securityTier === 'standard') {
                try {
                  const normalizedUsername = verifyData.user.username.toLowerCase();
                  const seedSrpSalt = srp.generateSalt();
                  const seedPrivateKey = srp.derivePrivateKey(seedSrpSalt, normalizedUsername, masterKeyHex);
                  const seedSrpVerifier = srp.deriveVerifier(seedPrivateKey);

                  const seedSetupRes = await fetch(`${API_BASE_URL}/api/v2/auth/srp-seed/setup`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${verifyData.accessToken}`
                    },
                    body: JSON.stringify({ srpSalt: seedSrpSalt, srpVerifier: seedSrpVerifier }),
                  });

                  if (!seedSetupRes.ok) {
                    console.warn('[LoginNew] SRP seed setup failed:', await seedSetupRes.text());
                  }
                } catch (seedSetupError) {
                  console.warn('[LoginNew] SRP seed setup error:', seedSetupError);
                }
              }
            } else {
              console.warn('[LoginNew] No masterKey in KeyVault for SRP login');
            }
          } catch (vaultError) {
            console.error('[LoginNew] Failed to load masterKey for SRP login:', vaultError);
          }

          // Initialize E2EE for message encryption
          try {
            await initializeE2EE(verifyData.user.username);
            debugLogger.debug('[LoginNew] E2EE initialized for SRP login');
          } catch (e2eeError) {
            console.warn('[LoginNew] E2EE initialization failed:', e2eeError);
          }

          setSession({
            user: {
              id: verifyData.user.id,
              username: verifyData.user.username,
              securityTier: verifyData.user.securityTier,
            },
            accessToken: verifyData.accessToken,
            refreshToken: verifyData.refreshToken,
          });

          saveKnownAccount({
            username: verifyData.user.username,
            securityTier: verifyData.user.securityTier,
          });

          navigate('/conversations');
          return;
        }
      } catch (srpError: any) {
        // SECURITY: SRP is the ONLY authentication method
        // masterKey must NEVER be sent to the server
        console.error('SRP Login failed:', srpError);
        
        // Check if it's a "user not found or SRP not configured" error
        if (srpError.message?.includes('not found') || srpError.message?.includes('SRP not configured')) {
          throw new Error(t('auth.error_srp_not_configured') || 'Account not configured for secure login. Please re-register.');
        }
        
        throw new Error(srpError.message || t('auth.error_invalid_credentials'));
      }
      // ---------------------

      // If we reach here, SRP failed but didn't throw - this shouldn't happen
      throw new Error(t('auth.error_login_generic'));
    } catch (error: any) {
      console.error('Standard login error:', error);
      setStandardError(error.message || t('auth.error_login_generic'));
      setShowLoader(false);
    } finally {
      setStandardLoading(false);
    }
  };


  // ============================================================================ 
  // MNEMONIC LOGIN (12/24 mots BIP-39)
  // ============================================================================ 

  const handleMnemonicLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    // setMnemonicLoading(true); // Replaced by CosmicLoader
    setMnemonicError('');

    try {
      const normalizedUsername = mnemonicUsername.trim().toLowerCase();

      if (!normalizedUsername || !mnemonicPhrase.trim()) {
        throw new Error(t('auth.error_fill_all_fields'));
      }

      // Start Cosmic Loader
      setShowLoader(true);
      setLoaderStage('normalizing');
      setLoaderProgress(10);
      await sleep(300);

      // Validate mnemonic format
      const words = mnemonicPhrase.trim().split(/\s+/);
      if (words.length !== 12 && words.length !== 24) {
        throw new Error(t('auth.mnemonic_error'));
      }

      setLoaderStage('argon2');
      setLoaderProgress(40);
      await sleep(500);

      // Import function from existing Login.tsx logic
      const { mnemonicToMasterKey } = await import('../services/api-v2');
      const masterKeyHex = await mnemonicToMasterKey(words.join(' '));

      // Store masterKey in memory for encryption (as non-extractable CryptoKey)
      // SECURITY: masterKey stays LOCAL - never sent to server
      await setSessionMasterKey(masterKeyHex);

      // Persist masterKey as non-extractable CryptoKey in IndexedDB (so encryption works after reload)
      // Note: hex itself is only cached in memory (SecureMemoryCache)
      await setTemporaryMasterKey(masterKeyHex);

      // Initialize E2EE vault (masterKey-based)
      try {
        const { getE2EEVault } = await import('../lib/keyVault');
        await getE2EEVault(masterKeyHex);
      } catch (vaultInitErr) {
        console.warn('[LoginNew] Failed to init E2EE vault:', vaultInitErr);
      }

      // SRP-SEED login: authenticate using a verifier derived from the masterKey
      // so the user can login from username + mnemonic on a new device.
      const ephemeral = srp.generateEphemeral();
      const initResponse = await fetch(`${API_BASE_URL}/api/v2/auth/srp-seed/login/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: normalizedUsername,
          A: ephemeral.public,
        }),
      });

      if (!initResponse.ok) {
        const payload = await initResponse.json().catch(() => null);
        const msg = payload?.error || t('auth.error_seed_login_not_configured') || 'Seed login not configured for this account. Login once with password to enable it.';
        throw new Error(msg);
      }

      const initData = await initResponse.json();
      const { salt, B, sessionId } = initData;

      const privateKey = srp.derivePrivateKey(salt, normalizedUsername, masterKeyHex);
      const session = srp.deriveSession(ephemeral.secret, B, salt, normalizedUsername, privateKey);

      const verifyResponse = await fetch(`${API_BASE_URL}/api/v2/auth/srp-seed/login/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: normalizedUsername,
          M1: session.proof,
          sessionId,
        }),
      });

      if (!verifyResponse.ok) {
        const payload = await verifyResponse.json().catch(() => null);
        throw new Error(payload?.error || t('auth.error_invalid_credentials'));
      }

      const data = await verifyResponse.json();
      srp.verifySession(ephemeral.public, session, data.M2);

      // Initialize E2EE for message encryption
      try {
        await initializeE2EE(data.user.username);
        debugLogger.debug('[LoginNew] E2EE initialized for SRP seed login');
      } catch (e2eeError) {
        console.warn('[LoginNew] E2EE initialization failed:', e2eeError);
      }

      setSession({
        user: {
          id: data.user.id,
          username: data.user.username,
          securityTier: data.user.securityTier,
        },
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });

      saveKnownAccount({
        username: data.user.username,
        securityTier: data.user.securityTier,
      });

      navigate('/conversations');
    } catch (error: any) {
      console.error('Mnemonic login error:', error);
      setMnemonicError(error.message || t('auth.error_login_generic'));
      setShowLoader(false);
    } finally {
      setMnemonicLoading(false);
    }
  };

  // ============================================================================ 
  // DICEKEY LOGIN (Identifiant hex + Checksums)
  // ============================================================================ 

  const handleDiceKeyCredentialsSubmit = async () => {
    // Validate userId
    if (diceKeyUserId.length !== 12) {
      setError(t('auth.error_id_length'));
      return;
    }

    // Validate checksums
    if (diceKeyChecksums.length !== 30) {
      setError(t('auth.error_checksums_missing'));
      return;
    }

    setError(''); // Clear previous errors
    // Check if this is first-time login (account creation from Welcome page)
    const pendingSignup = sessionStorage.getItem('pendingSignup');

    try {
      if (pendingSignup) {
        // First-time login: Verify checksums match, then create account
        const signupData = JSON.parse(pendingSignup);

        // Verify userId matches
        if (signupData.userId !== diceKeyUserId) {
          throw new Error(t('auth.error_id_mismatch'));
        }

        // Verify all checksums match
        const mismatch = diceKeyChecksums.some((cs, idx) => cs !== signupData.checksums[idx]);
        if (mismatch) {
          throw new Error(t('auth.error_checksums_mismatch'));
        }

        // Create account
        const response = await fetch(`${API_BASE_URL}/api/v2/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: signupData.username,
            method: 'dicekey',
            masterKeyHex: signupData.masterKeyHex || 'placeholder', // Required by backend
            identityPublicKey: signupData.keySet.identityKey.publicKey,
            signaturePublicKey: signupData.keySet.signatureKey.publicKey,
            signedPreKey: signupData.keySet.signedPreKey,
            oneTimePreKeys: signupData.keySet.oneTimePreKeys,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Erreur inconnue' }));

          // Handle 409 Conflict - account already exists
          if (response.status === 409) {
            // Clear pendingSignup since account was already created
            sessionStorage.removeItem('pendingSignup');
            throw new Error('Ce compte existe déjà. Utilisez vos identifiants pour vous reconnecter.');
          }

          throw new Error(errorData.error || t('auth.error_account_creation'));
        }

        const responseData = await response.json();

        // Store tokens and user info temporarily for session creation
        sessionStorage.setItem('tempAccessToken', responseData.accessToken);
        sessionStorage.setItem('tempRefreshToken', responseData.refreshToken);
        sessionStorage.setItem('tempUserId', responseData.id);
        sessionStorage.setItem('tempUserSecurityTier', responseData.securityTier);

        // DON'T clear pending signup yet - we need it in handleSetPassword to get masterKeyHex
        // sessionStorage.removeItem('pendingSignup'); // MOVED to handleSetPassword after use

        // Store username for password setup
        sessionStorage.setItem('tempUsername', signupData.username);

        // Go to password setup
        setDiceKeyStep('setpassword');
      } else {
        // Existing account: Try to reconnect with stored MasterKey (encrypted with Checksums)
        // The checksums serve as verification that the user has the right credentials

        // Start Cosmic Loader
        setShowLoader(true);
        setLoaderStage('normalizing');
        setLoaderProgress(10);
        await sleep(300);

        // Check if we have stored auth for this user ID
        const storedAuth = localStorage.getItem(`checksumAuth_${diceKeyUserId}`);
        const storedUsername = localStorage.getItem(`checksumAuth_${diceKeyUserId}_username`);

        if (!storedAuth) {
          // No stored auth - this device hasn't been set up for this account yet
          setShowLoader(false);
          setError(t('auth.error_no_local_config'));
          return;
        }

        // If username is not in state, try to get it from localStorage
        let usernameToUse = diceKeyUsername;
        if (!usernameToUse && storedUsername) {
          usernameToUse = storedUsername;
          setDiceKeyUsername(storedUsername); // Update state for display
        }

        if (!usernameToUse) {
          setShowLoader(false);
          setError('Username introuvable. Veuillez entrer votre nom d\'utilisateur.');
          return;
        }

        // We have stored auth - decrypt it using the checksums as a key derivation component
        try {
          setLoaderStage('argon2');
          setLoaderProgress(30);

          // Use checksums + userId as password to decrypt the stored masterKey
          const checksumPassword = diceKeyChecksums.join('') + diceKeyUserId;

          // Decrypt the stored masterKey
          const masterKeyHex = await decryptData(storedAuth, checksumPassword);

          if (!masterKeyHex) {
            throw new Error(t('auth.error_checksums_mismatch'));
          }

          setLoaderProgress(50);
          await sleep(200);

          // SECURITY: Store masterKey locally - never send to server
          await setSessionMasterKey(masterKeyHex);
          try {
            await setTemporaryMasterKey(masterKeyHex);
            // SECURITY: MasterKey stored (not logging for security)
          } catch (mkError) {
            console.error('[LoginNew] Failed to store masterKey in legacy storage:', mkError);
          }

          setLoaderStage('hkdf');
          setLoaderProgress(70);

          // SECURITY: Check if SRP is configured for this user
          const storedPasswordHash = localStorage.getItem(`pwd_${usernameToUse.toLowerCase()}`);
          
          if (!storedPasswordHash) {
            // No local password - DiceKey users need to set up SRP via recovery
            setShowLoader(false);
            setError(t('auth.error_need_password_setup') || 'Please set up a local password. Go to Settings after login.');
            // For now, redirect to recovery to set up password
            navigate('/recovery', { 
              state: { 
                reason: 'DICEKEY_SETUP_PASSWORD', 
                username: usernameToUse,
                hasMasterKey: true 
              } 
            });
            return;
          }

          // Use SRP for authentication (password stored locally)
          // Get the password from user - for DiceKey, we need a different flow
          // Since DiceKey users authenticated with checksums, we use Avatar login as fallback
          setShowLoader(false);
          setError(t('auth.error_use_avatar_login') || 'Please use Avatar file login for DiceKey accounts, or set up password login.');

        } catch (error: any) {
          console.error('DiceKey login error:', error);
          setError(error.message || t('auth.error_login_generic'));
          setShowLoader(false);
        }
      }
    } catch (error: any) {
      console.error('DiceKey credentials error:', error);
      setError(error.message || t('auth.error_generic'));
    }
  };

  // ============================================================================ 
  // FILE LOGIN (Avatar .blend file)
  // ============================================================================ 

  const handleFileLogin = async (file: File) => {
    setFileError('');
    setFileLoading(true);

    try {
      // Start Cosmic Loader
      setShowLoader(true);
      setLoaderStage('normalizing');
      setLoaderProgress(10);
      await sleep(300);

      // Calculate file hash locally (same as backend)
      const fileBuffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const fileHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      const formData = new FormData();
      formData.append('avatar', file);

      setLoaderStage('argon2'); // Hashing file
      setLoaderProgress(40);
      await sleep(500);

      const response = await fetch(`${API_BASE_URL}/api/v2/auth/login-with-avatar`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erreur inconnue' }));
        throw new Error(errorData.error || t('auth.error_invalid_credentials'));
      }

      const data = await response.json();

      // Success
      setLoaderStage('hkdf');
      setLoaderProgress(70);
      await sleep(300);

      setLoaderStage('complete');
      setLoaderProgress(100);
      await sleep(1500);

      // Try to decrypt masterKey using file hash
      const encryptedMasterKey = localStorage.getItem(`avatarAuth_${fileHash}`);
      if (encryptedMasterKey) {
        try {
          const masterKeyHex = await decryptData(encryptedMasterKey, fileHash);
          if (masterKeyHex) {
            await setSessionMasterKey(masterKeyHex);
            try {
              await setTemporaryMasterKey(masterKeyHex);
            } catch (mkErr) {
              console.warn('[LoginNew] Failed to persist masterKey for file login:', mkErr);
            }

            try {
              const { getE2EEVault } = await import('../lib/keyVault');
              await getE2EEVault(masterKeyHex);
            } catch (vaultInitErr) {
              console.warn('[LoginNew] Failed to init E2EE vault for file login:', vaultInitErr);
            }
            // SECURITY: MasterKey decrypted (not logging for security)
          } else {
            console.warn('[LoginNew] Failed to decrypt masterKey from avatarAuth');
          }
        } catch (decryptErr) {
          console.error('[LoginNew] Failed to decrypt avatarAuth:', decryptErr);
        }
      } else {
        console.warn('[LoginNew] No avatarAuth found for file hash. User may need to re-setup on this device.');
      }

      // Initialize E2EE for message encryption
      try {
        await initializeE2EE(data.user.username);
        debugLogger.debug('[LoginNew] E2EE initialized for file login');
      } catch (e2eeError) {
        console.warn('[LoginNew] E2EE initialization failed:', e2eeError);
      }

      setSession({
        user: {
          id: data.user.id,
          username: data.user.username,
          securityTier: data.user.securityTier,
        },
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });

      saveKnownAccount({
        username: data.user.username,
        securityTier: data.user.securityTier,
      });

      navigate('/conversations');
    } catch (error: any) {
      console.error('File login error:', error);
      setFileError(error.message || t('auth.error_login_generic'));
      setShowLoader(false);
    } finally {
      setFileLoading(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 6) {
      alert(t('auth.error_password_length'));
      return;
    }

    if (newPassword !== confirmPassword) {
      alert(t('auth.passwords_no_match'));
      return;
    }

    try {
      // Get data from pending signup
      const pendingSignup = sessionStorage.getItem('pendingSignup');
      let username = sessionStorage.getItem('tempUsername');

      // Fallback: try to get username from state if not in sessionStorage
      if (!username && diceKeyUsername) {
        username = diceKeyUsername;
        debugLogger.debug('[LoginNew] Using username from state:', username);
      }

      // Fallback: try to get username from pendingSignup
      if (!username && pendingSignup) {
        try {
          const signupData = JSON.parse(pendingSignup);
          username = signupData.username;
          debugLogger.debug('[LoginNew] Using username from pendingSignup:', username);
        } catch (e) {
          console.error('[LoginNew] Failed to parse pendingSignup:', e);
        }
      }

      if (!username) {
        console.error('[LoginNew] Username not found anywhere:', {
          tempUsername: sessionStorage.getItem('tempUsername'),
          pendingSignup: sessionStorage.getItem('pendingSignup'),
          diceKeyUsername,
        });
        throw new Error(t('auth.error_username_not_found'));
      }

      // Store password locally for this device (hashed with username as salt)
      const normalizedUsername = username.toLowerCase();
      const passwordHash = await hashPasswordForSetup(newPassword, normalizedUsername);
      localStorage.setItem(`pwd_${normalizedUsername}`, passwordHash);

      // Get masterKeyHex and tokens
      let masterKeyHex = '';
      const tempAccessToken = sessionStorage.getItem('tempAccessToken');
      const tempRefreshToken = sessionStorage.getItem('tempRefreshToken');
      const tempUserId = sessionStorage.getItem('tempUserId');
      const tempUserSecurityTier = sessionStorage.getItem('tempUserSecurityTier');

      // --- SRP SETUP ---
      // Configure SRP for QuickUnlock (must be done before session ends)
      if (tempAccessToken && username) {
        try {
          const srpSalt = srp.generateSalt();
          const privateKey = srp.derivePrivateKey(srpSalt, username, newPassword);
          const srpVerifier = srp.deriveVerifier(privateKey);

          const srpResponse = await fetch(`${API_BASE_URL}/api/v2/auth/srp/setup`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${tempAccessToken}`
            },
            body: JSON.stringify({ srpSalt, srpVerifier }),
          });

          if (!srpResponse.ok) {
            console.error('[LoginNew] SRP Setup failed:', await srpResponse.text());
          } else {
            debugLogger.debug('[LoginNew] ✅ SRP configured successfully');
          }
        } catch (srpError) {
          console.error('[LoginNew] SRP Setup error:', srpError);
        }
      }
      // ----------------

      // Store masterKeyHex encrypted in KeyVault for this device
      // This ensures it's saved even if session creation fails later
      if (pendingSignup) {
        try {
          const signupData = JSON.parse(pendingSignup);
          if (signupData.masterKeyHex) {
            masterKeyHex = signupData.masterKeyHex;
            try {
              const vault = await getKeyVault(newPassword);
              await vault.storeData(`masterKey:${username}`, masterKeyHex);
              // Clean up any legacy clear-text storage if it exists
              localStorage.removeItem(`master_${username}`);
            } catch (vaultError) {
              console.error('[LoginNew] Failed to store masterKey in KeyVault:', vaultError);
            }
          } else {
            console.warn('[LoginNew] ⚠️ No masterKeyHex in pendingSignup:', signupData);
          }

          // ✅ Store MasterKey Encrypted with Checksums for future DiceKey Login
          if (signupData.checksums && signupData.userId && masterKeyHex) {
            debugLogger.debug('[LoginNew] Attempting to save checksum auth...');
            try {
              const checksumPassword = signupData.checksums.join('') + signupData.userId;
              // Encrypt masterKey with checksums as password (no logging for security)

              const encryptedMasterKey = await encryptData(masterKeyHex, checksumPassword);
              if (encryptedMasterKey) {
                localStorage.setItem(`checksumAuth_${signupData.userId}`, encryptedMasterKey);
                // Store username for automatic retrieval during reconnection
                localStorage.setItem(`checksumAuth_${signupData.userId}_username`, username);
                // Encrypted masterKey saved for checksum auth
              } else {
                console.error('[LoginNew] ❌ Encryption returned null');
              }
            } catch (err) {
              console.error('[LoginNew] Failed to encrypt/save checksum auth:', err);
            }
          } else {
            console.warn('[LoginNew] ⚠️ Missing data for checksum auth:', {
              hasChecksums: !!signupData.checksums,
              hasUserId: !!signupData.userId,
              hasMasterKey: !!masterKeyHex
            });
          }

          // ✅ Store MasterKey Encrypted with AvatarHash for future File Login
          if (signupData.avatarHash && masterKeyHex) {
            // SECURITY: Storing encrypted masterKey (not logging details)
            try {
              const encryptedWithAvatar = await encryptData(masterKeyHex, signupData.avatarHash);
              if (encryptedWithAvatar) {
                localStorage.setItem(`avatarAuth_${signupData.avatarHash}`, encryptedWithAvatar);
                localStorage.setItem(`avatarAuth_${signupData.avatarHash}_username`, username);
                // SECURITY: MasterKey stored (not logging for security)
              }
            } catch (err) {
              console.error('[LoginNew] Failed to store avatarAuth:', err);
            }
          }
        } catch (e) {
          console.error('[LoginNew] Failed to extract masterKeyHex from pendingSignup:', e);
        }
      } else {
        console.warn('[LoginNew] ⚠️ No pendingSignup found in sessionStorage');
      }

      // Create session if we have all the required data
      if (tempAccessToken && tempRefreshToken && tempUserId && tempUserSecurityTier && masterKeyHex) {
        setSession({
          user: {
            id: tempUserId,
            username,
            securityTier: tempUserSecurityTier as 'standard' | 'dice-key',
          },
          accessToken: tempAccessToken,
          refreshToken: tempRefreshToken,
        });

        // Save as known account
        saveKnownAccount({
          username,
          securityTier: tempUserSecurityTier as 'standard' | 'dice-key',
        });

        // Clean up temporary session data
        sessionStorage.removeItem('pendingSignup'); // ✅ Clean up after extracting masterKeyHex
        sessionStorage.removeItem('tempAccessToken');
        sessionStorage.removeItem('tempRefreshToken');
        sessionStorage.removeItem('tempUserId');
        sessionStorage.removeItem('tempUserSecurityTier');
        sessionStorage.removeItem('tempUsername');
        sessionStorage.removeItem('verifiedChecksums');

        // Initialize E2EE immediately after account creation
        try {
          try {
            const { getE2EEVault } = await import('../lib/keyVault');
            await getE2EEVault(masterKeyHex);
          } catch (vaultInitErr) {
            console.warn('[LoginNew] Failed to init E2EE vault for new account:', vaultInitErr);
          }
          await initializeE2EE(username);
          debugLogger.debug('[LoginNew] E2EE initialized for new account');
        } catch (e2eeError) {
          console.warn('[LoginNew] E2EE initialization failed:', e2eeError);
        }

        // Success! Redirect to conversations
        alert(t('auth.success_account_created', { username }));
        navigate('/conversations');
      } else {
        // Missing session data - try to login automatically with SRP
        try {
          // Store password hash for future quick unlock
          const normalizedUsername = username.toLowerCase();
          const passwordHash = await hashPasswordForSetup(newPassword, normalizedUsername);
          void passwordHash; // Used for future quick unlock

          // Get masterKey from KeyVault (for local encryption only)
          let storedMasterKey: string | null = null;
          try {
            const vault = await getKeyVault(newPassword);
            storedMasterKey = await vault.getData(`masterKey:${username}`);
          } catch (vaultError) {
            console.error('Failed to open KeyVault for auto-login:', vaultError);
          }

          if (storedMasterKey) {
            // SECURITY: Store masterKey locally for encryption
            await setSessionMasterKey(storedMasterKey);

            try {
              await setTemporaryMasterKey(storedMasterKey);
            } catch (mkErr) {
              console.warn('[LoginNew] Failed to persist masterKey for auto-login:', mkErr);
            }

            try {
              const { getE2EEVault } = await import('../lib/keyVault');
              await getE2EEVault(storedMasterKey);
            } catch (vaultInitErr) {
              console.warn('[LoginNew] Failed to init E2EE vault for auto-login:', vaultInitErr);
            }

            // SECURITY: Use SRP for authentication (zero-knowledge)
            const ephemeral = srp.generateEphemeral();
            const initResponse = await fetch(`${API_BASE_URL}/api/v2/auth/srp/login/init`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username,
                A: ephemeral.public,
              }),
            });

            if (!initResponse.ok) {
              throw new Error('SRP init failed - account may not have SRP configured');
            }

            const initData = await initResponse.json();
            const { salt, B, sessionId } = initData;

            // Derive SRP session
            const privateKey = srp.derivePrivateKey(salt, username, newPassword);
            const session = srp.deriveSession(ephemeral.secret, B, salt, username, privateKey);

            // Verify
            const verifyResponse = await fetch(`${API_BASE_URL}/api/v2/auth/srp/login/verify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username,
                M1: session.proof,
                sessionId,
              }),
            });

            if (!verifyResponse.ok) {
              throw new Error('SRP verification failed');
            }

            const data = await verifyResponse.json();

            setSession({
              user: {
                id: data.user.id,
                username: data.user.username,
                securityTier: data.user.securityTier,
              },
              accessToken: data.accessToken,
              refreshToken: data.refreshToken,
            });

            saveKnownAccount({
              username: data.user.username,
              securityTier: data.user.securityTier,
            });

            // Clean up
            sessionStorage.removeItem('pendingSignup');
            sessionStorage.removeItem('tempAccessToken');
            sessionStorage.removeItem('tempRefreshToken');
            sessionStorage.removeItem('tempUserId');
            sessionStorage.removeItem('tempUserSecurityTier');
            sessionStorage.removeItem('tempUsername');
            sessionStorage.removeItem('verifiedChecksums');

            alert(t('auth.success_account_created', { username }));
            navigate('/conversations');
          } else {
            // Fallback to login screen
            alert(t('auth.account_created_login_required'));
            navigate('/login');
          }
        } catch (error) {
          console.error('Auto-login error:', error);
          alert(t('auth.account_created_login_required'));
          navigate('/login');
        }
      }
    } catch (error: any) {
      console.error('Set password error:', error);
      alert(error.message || t('auth.error_password_set'));
    }
  };

  // Simple password hashing with crypto.subtle for password setup  
  async function hashPasswordForSetup(password: string, salt: string): Promise<string> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: enc.encode(salt),
        iterations: 10000,
        hash: 'SHA-256',
      },
      keyMaterial,
      256
    );

    const hashArray = Array.from(new Uint8Array(derivedBits));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const handleBackToChoice = () => {
    setMethod(null);
    setUsername('');
    setPassword('');
    setStandardError('');
    setError('');
    setDiceKeyStep('credentials');
    setDiceKeyUserId('');
    setDiceKeyUsername('');
    setDiceKeyChecksums([]);
    setNewPassword('');
    setConfirmPassword('');
  };

  // ============================================================================ 
  // RENDER
  // ============================================================================ 

  return (
    <div className="dark-matter-bg min-h-screen">
      <AnimatePresence mode="wait">
        {/* Cosmic Loader has priority */}
        {showLoader ? (
          <motion.div
            key="loader"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-dark-matter flex items-center justify-center"
          >
            <CosmicLoader
              stage={loaderStage}
              progress={loaderProgress}
            // onComplete handled manually in the flow for login
            />
          </motion.div>
        ) : error ? (
          <ErrorScreen key="error" error={error} onRetry={handleBackToChoice} t={t} />
        ) : method === null ? (
          <MethodChoice key="choice" onSelect={handleMethodChoice} t={t} />
        ) : method === 'standard' ? (
          <StandardLoginForm
            key="standard"
            username={username}
            setUsername={setUsername}
            password={password}
            setPassword={setPassword}
            onSubmit={handleStandardLogin}
            onBack={handleBackToChoice}
            error={standardError}
            loading={standardLoading}
            t={t}
          />
        ) : method === 'mnemonic' ? (
          <MnemonicLoginForm
            key="mnemonic"
            username={mnemonicUsername}
            setUsername={setMnemonicUsername}
            mnemonicPhrase={mnemonicPhrase}
            setMnemonicPhrase={setMnemonicPhrase}
            onSubmit={handleMnemonicLogin}
            onBack={handleBackToChoice}
            error={mnemonicError}
            loading={mnemonicLoading}
            t={t}
          />
        ) : method === 'dicekey' && diceKeyStep === 'credentials' ? (
          <DiceKeyCredentialsForm
            key="dicekey-credentials"
            userId={diceKeyUserId}
            setUserId={setDiceKeyUserId}
            username={diceKeyUsername}
            setUsername={setDiceKeyUsername}
            checksums={diceKeyChecksums}
            setChecksums={setDiceKeyChecksums}
            onSubmit={handleDiceKeyCredentialsSubmit}
            onBack={handleBackToChoice}
            hasExpectedChecksums={expectedChecksums.length > 0}
            t={t}
          />
        ) : method === 'dicekey' && diceKeyStep === 'setpassword' ? (
          <SetPasswordForm
            key="dicekey-setpassword"
            newPassword={newPassword}
            setNewPassword={setNewPassword}
            confirmPassword={confirmPassword}
            setConfirmPassword={setConfirmPassword}
            onSubmit={handleSetPassword}
            onBack={() => setDiceKeyStep('credentials')}
            t={t}
          />
        ) : method === 'file' ? (
          <FileLoginForm
            key="file"
            onSubmit={handleFileLogin}
            onBack={handleBackToChoice}
            error={fileError}
            loading={fileLoading}
            t={t}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================ 
// SUB-COMPONENTS
// ============================================================================ 

function MethodChoice({ onSelect, t }: { onSelect: (method: Method) => void; t: TFunction }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex items-center justify-center min-h-screen p-8"
    >
      <div className="max-w-4xl w-full">
        <div className="text-center mb-12">
          <motion.h1
            className="text-5xl font-black mb-4 glow-text-cyan"
            style={{ color: 'var(--quantum-cyan)' }}
          >
            {t('auth.login')}
          </motion.h1>
          <p className="text-soft-grey text-xl">
            {t('auth.choose_auth_method')}
          </p>
        </div>

        <div className="grid grid-cols-1 md::grid-cols-3 gap-6">
          {/* Standard Method */}
          <motion.button
            whileHover={{ scale: 1.05, y: -8 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect('standard')}
            className="glass-card p-6 text-left card-hover"
          >
            <div className="text-5xl mb-3">🔑</div>
            <h3 className="text-xl font-bold mb-2 text-pure-white">{t('auth.quick_unlock')}</h3>
            <p className="text-soft-grey text-sm mb-3">
              {t('auth.quick_unlock_desc')}
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="badge badge-quantum text-xs">⚡ {t('auth.fast')}</span>
              <span className="badge badge-trust text-xs">📱 {t('auth.this_device')}</span>
            </div>
            <div className="mt-3 p-2 bg-blue-500/10 rounded border border-blue-500/20">
              <p className="text-xs text-blue-300">
                {t('auth.if_already_connected')}
              </p>
            </div>
          </motion.button>

          {/* Mnemonic Method */}
          <motion.button
            whileHover={{ scale: 1.05, y: -8 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect('mnemonic')}
            className="glass-card p-6 text-left card-hover"
            style={{
              borderColor: 'var(--quantum-cyan)',
              borderWidth: '2px',
            }}
          >
            <div className="text-5xl mb-3">📝</div>
            <h3 className="text-xl font-bold mb-2 text-pure-white">
              {t('auth.mnemonic_title')}
            </h3>
            <p className="text-soft-grey text-sm mb-3">
              {t('auth.mnemonic_desc')}
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="badge badge-quantum text-xs">🔄 {t('auth.portable')}</span>
              <span className="badge badge-trust text-xs">📱 {t('auth.multi_device')}</span>
            </div>
            <div className="mt-3 p-2 bg-cyan-500/10 rounded border border-cyan-500/20">
              <p className="text-xs text-cyan-300">
                {t('auth.standard_method')}
              </p>
            </div>
          </motion.button>

          {/* DiceKey Method */}
          <motion.button
            whileHover={{ scale: 1.05, y: -8 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect('dicekey')}
            className="glass-card p-6 text-left card-hover"
            style={{
              borderColor: 'var(--magenta-trust)',
              borderWidth: '2px',
            }}
          >
            <div className="text-5xl mb-3">🎲</div>
            <h3 className="text-xl font-bold mb-2 text-pure-white">
              {t('auth.dicekey_title')}
              <span className="ml-2 text-xs badge badge-trust">{t('auth.ultra_secure')}</span>
            </h3>
            <p className="text-soft-grey text-sm mb-3">
              {t('auth.dicekey_desc')}
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="badge badge-quantum text-xs">🌌 775 bits</span>
              <span className="badge badge-trust text-xs">🛡️ Zero-Knowledge</span>
            </div>
          </motion.button>

          {/* File Method */}
          <motion.button
            whileHover={{ scale: 1.05, y: -8 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect('file')}
            className="glass-card p-6 text-left card-hover"
            style={{
              borderColor: 'var(--neon-purple)',
              borderWidth: '2px',
            }}
          >
            <div className="text-5xl mb-3">🧊</div>
            <h3 className="text-xl font-bold mb-2 text-pure-white">
              {t('auth.file_title') || 'Key File'}
            </h3>
            <p className="text-soft-grey text-sm mb-3">
              {t('auth.file_desc') || 'Login with your 3D Avatar file'}
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="badge badge-quantum text-xs">📂 File</span>
              <span className="badge badge-trust text-xs">🔒 Secure</span>
            </div>
          </motion.button>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center mt-8"
        >
          <p className="text-muted-grey text-sm mb-4">
            {t('auth.use_same_method')}
          </p>
          <p className="text-soft-grey text-sm">
            {t('auth.no_account')}
            <a
              href="/signup"
              className="text-quantum-cyan hover:underline font-semibold"
            >
              {t('auth.create_one_now')} →
            </a>
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}

function StandardLoginForm({
  username,
  setUsername,
  password,
  setPassword,
  onSubmit,
  onBack,
  error,
  loading,
  t,
}: {
  username: string;
  setUsername: (val: string) => void;
  password: string;
  setPassword: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
  error: string;
  loading: boolean;
  t: TFunction;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex items-center justify-center min-h-screen p-8"
    >
      <div className="max-w-xl w-full">
        <div className="text-center mb-8">
          <h2
            className="text-4xl font-black mb-3 glow-text-cyan"
            style={{ color: 'var(--quantum-cyan)' }}
          >
            {t('auth.standard_login')}
          </h2>
          <p className="text-soft-grey">
            {t('auth.enter_credentials')}
          </p>
        </div>

        <form onSubmit={onSubmit}>
          <div className="glass-card p-8 mb-6">
            {/* Username */}
            <div className="mb-6">
              <label className="block mb-2 text-sm font-semibold text-pure-white">
                {t('auth.username')}
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('auth.username_placeholder')}
                className="input"
                autoFocus
                disabled={loading}
              />
            </div>

            {/* Password */}
            <div className="mb-6">
              <label className="block mb-2 text-sm font-semibold text-pure-white">
                {t('auth.password')}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input"
                disabled={loading}
              />
              <p className="text-xs text-muted-grey mt-2">
                💡 {t('auth.device_password_hint')}
              </p>
            </div>

            {/* Error Display */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-4 bg-error-glow/10 border border-error-glow/30 rounded-lg"
                role="alert"
                aria-live="polite"
              >
                <p className="text-sm text-error-glow font-semibold mb-2">⚠️ {error}</p>
              </motion.div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onBack}
              disabled={loading}
              className="btn btn-ghost flex-1"
            >
              ← {t('common.back')}
            </motion.button>

            <motion.button
              type="submit"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={username.length < 3 || password.length < 6 || loading}
              className="btn btn-primary flex-1"
            >
              {loading ? t('auth.connecting') : `${t('auth.login_button')} 🔐`}
            </motion.button>
          </div>
        </form>

        {/* Help Link */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center mt-6"
        >
          <p className="text-xs text-muted-grey">
            💡 {t('auth.first_login_hint')}
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}

function MnemonicLoginForm({
  username,
  setUsername,
  mnemonicPhrase,
  setMnemonicPhrase,
  onSubmit,
  onBack,
  error,
  loading,
  t,
}: {
  username: string;
  setUsername: (val: string) => void;
  mnemonicPhrase: string;
  setMnemonicPhrase: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
  error: string;
  loading: boolean;
  t: TFunction;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex items-center justify-center min-h-screen p-8"
    >
      <div className="max-w-2xl w-full">
        <form onSubmit={onSubmit} className="glass-card p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">📝</div>
            <h1 className="text-3xl font-black mb-2 glow-text-cyan">
              {t('auth.mnemonic_title')}
            </h1>
            <p className="text-soft-grey">
              {t('auth.mnemonic_restore_desc')}
            </p>
          </div>

          {/* Form Content */}
          <div className="space-y-6">
            {/* Username */}
            <div>
              <label className="block mb-2 text-sm font-semibold text-pure-white">
                {t('auth.username')}
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('auth.username_placeholder')}
                className="input"
                autoFocus
                disabled={loading}
              />
            </div>

            {/* Mnemonic Phrase */}
            <div>
              <label className="block mb-2 text-sm font-semibold text-pure-white">
                {t('auth.mnemonic_phrase_label')}
              </label>
              <textarea
                value={mnemonicPhrase}
                onChange={(e) => setMnemonicPhrase(e.target.value)}
                placeholder={t('auth.mnemonic_placeholder')}
                className="input font-mono text-sm"
                rows={4}
                disabled={loading}
              />
              <p className="text-xs text-muted-grey mt-2">
                💡 {t('auth.mnemonic_hint')}
              </p>
            </div>

            {/* Error Display */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-error-glow/10 border border-error-glow/30 rounded-lg"
                role="alert"
                aria-live="polite"
              >
                <p className="text-sm text-error-glow font-semibold">⚠️ {error}</p>
              </motion.div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-4 mt-8">
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onBack}
              disabled={loading}
              className="btn btn-ghost flex-1"
            >
              ← {t('common.back')}
            </motion.button>

            <motion.button
              type="submit"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={username.length < 3 || mnemonicPhrase.trim().split(/\s+/).length < 12 || loading}
              className="btn btn-primary flex-1"
            >
              {loading ? t('auth.connecting') : `${t('auth.login_button')} 🔐`}
            </motion.button>
          </div>
        </form>

        {/* Help Link */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center mt-6"
        >
          <p className="text-xs text-muted-grey">
            {t('auth.use_same_phrase')}
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}

function ErrorScreen({ error, onRetry, t }: { error: string; onRetry: () => void; t: TFunction }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="flex items-center justify-center min-h-screen p-8"
    >
      <div className="max-w-md w-full">
        <div
          className="glass-card p-8 text-center border-l-4"
          style={{ borderLeftColor: 'var(--error-glow)' }}
        >
          <motion.div
            animate={{
              scale: [1, 1.1, 1],
            }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-6xl mb-4"
          >
            ⚠️
          </motion.div>

          <h2 className="text-2xl font-bold mb-4 text-pure-white">{t('auth.login_failure')}</h2>

          <p className="text-soft-grey mb-6">{error}</p>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onRetry}
            className="btn btn-primary w-full"
          >
            {t('auth.retry')}
          </motion.button>

          <p className="text-xs text-muted-grey mt-4">
            {t('auth.check_method')}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function DiceKeyCredentialsForm({
  userId,
  setUserId,
  username,
  setUsername,
  checksums,
  setChecksums,
  onSubmit,
  onBack,
  hasExpectedChecksums,
  t,
}: {
  userId: string;
  setUserId: (val: string) => void;
  username: string;
  setUsername: (val: string) => void;
  checksums: string[];
  setChecksums: (val: string[]) => void;
  onSubmit: () => void;
  onBack: () => void;
  hasExpectedChecksums: boolean;
  t: TFunction;
}) {
  const handleChecksumInput = (value: string) => {
    // Parse checksums from text input (space or comma separated)
    const parsed = value.trim().split(/[\s,]+/).filter(s => s.length > 0);
    setChecksums(parsed);
  };

  // Check if we're in "new account" mode (pendingSignup exists)
  const hasPendingSignup = sessionStorage.getItem('pendingSignup') !== null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex items-center justify-center min-h-screen p-8"
    >
      <div className="max-w-xl w-full">
        <div className="text-center mb-8">
          <h2
            className="text-4xl font-black mb-3 glow-text-cyan"
            style={{ color: 'var(--quantum-cyan)' }}
          >
            {t('auth.dicekey_login')}
          </h2>
          <p className="text-soft-grey">
            {hasPendingSignup ? t('auth.identity_verification') : t('auth.enter_info_to_login')}
          </p>
        </div>

        <div className="glass-card p-8 mb-6">
          {/* Username */}
          <div className="mb-6">
            <label className="block mb-2 text-sm font-semibold text-pure-white">
              {t('auth.username')}
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('auth.username_placeholder')}
              className="input"
              autoFocus={!hasPendingSignup}
              readOnly={hasPendingSignup && username.length > 0}
            />
            {hasPendingSignup && username.length > 0 ? (
              <p className="text-xs text-quantum-cyan mt-2">
                {t('auth.prefilled_from_signup')}
              </p>
            ) : (
              <p className="text-xs text-muted-grey mt-2">
                {t('auth.username_from_signup')}
              </p>
            )}
          </div>

          {/* User ID */}
          <div className="mb-6">
            <label className="block mb-2 text-sm font-semibold text-pure-white">
              {t('auth.unique_id_12')}
            </label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value.toLowerCase())}
              placeholder="a3f7c9e2d8b1"
              className="input font-mono text-xl"
              maxLength={12}
            />
            <p className="text-xs text-muted-grey mt-2">
              {t('auth.id_after_creation')}
            </p>
          </div>

          {/* Checksums */}
          <div className="mb-6">
            <label className="block mb-2 text-sm font-semibold text-pure-white">
              {t('auth.checksums_30')}
            </label>
            <textarea
              value={checksums.join(' ')}
              onChange={(e) => handleChecksumInput(e.target.value)}
              placeholder="abc def ghi jkl mno pqr ..."
              className="input font-mono text-sm"
              rows={4}
              readOnly={hasExpectedChecksums}
            />
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-muted-grey">
                {t('auth.checksums_count', { count: checksums.length })}
              </p>
              {hasExpectedChecksums && (
                <span className="text-xs text-quantum-cyan">
                  {t('auth.preloaded_from_welcome')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onBack}
            className="btn btn-ghost flex-1"
          >
            ← {t('common.back')}
          </motion.button>

          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onSubmit}
            disabled={username.trim().length < 3 || userId.length !== 12 || checksums.length !== 30}
            className="btn btn-primary flex-1"
          >
            {t('auth.verify_and_continue')}
          </motion.button>
        </div>

        {/* Info */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center mt-6"
        >
          <p className="text-xs text-muted-grey">
            {t('auth.info_from_creation')}
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}

function SetPasswordForm({
  newPassword,
  setNewPassword,
  confirmPassword,
  setConfirmPassword,
  onSubmit,
  onBack,
  t,
}: {
  newPassword: string;
  setNewPassword: (val: string) => void;
  confirmPassword: string;
  setConfirmPassword: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
  t: TFunction;
}) {
  const passwordsMatch = newPassword === confirmPassword && newPassword.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex items-center justify-center min-h-screen p-8"
    >
      <div className="max-w-xl w-full">
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, ease: [0.68, -0.55, 0.265, 1.55] }}
            className="text-6xl mb-4"
          >
            🔐
          </motion.div>
          <h2
            className="text-4xl font-black mb-3 glow-text-cyan"
            style={{ color: 'var(--quantum-cyan)' }}
          >
            {t('auth.set_password')}
          </h2>
          <p className="text-soft-grey">
            {t('auth.for_this_device')}
          </p>
        </div>

        <form onSubmit={onSubmit}>
          <div className="glass-card p-8 mb-6">
            <div className="mb-4 p-4 bg-quantum-cyan/10 rounded-lg border border-quantum-cyan/30">
              <p className="text-sm text-pure-white">
                {t('auth.id_checksums_verified')}
              </p>
            </div>

            {/* New Password */}
            <div className="mb-6">
              <label className="block mb-2 text-sm font-semibold text-pure-white">
                {t('auth.new_password')}
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="input"
                autoFocus
                minLength={6}
              />
              <p className="text-xs text-muted-grey mt-2">
                {t('auth.min_6_chars')}
              </p>
            </div>

            {/* Confirm Password */}
            <div className="mb-6">
              <label className="block mb-2 text-sm font-semibold text-pure-white">
                {t('auth.confirm_password')}
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="input"
                minLength={6}
              />
              {confirmPassword.length > 0 && (
                <p className={`text-xs mt-2 ${passwordsMatch ? 'text-success-glow' : 'text-error-glow'}`}>
                  {passwordsMatch ? `✓ ${t('auth.passwords_match')}` : `✗ ${t('auth.passwords_no_match')}`}
                </p>
              )}
            </div>

            <div className="p-4 bg-amber-500/10 rounded-lg border border-amber-500/30">
              <p className="text-xs text-pure-white">
                {t('auth.password_local')}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onBack}
              className="btn btn-ghost flex-1"
            >
              ← {t('common.back')}
            </motion.button>

            <motion.button
              type="submit"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={!passwordsMatch || newPassword.length < 6}
              className="btn btn-primary flex-1"
            >
              {t('auth.set_and_login')}
            </motion.button>
          </div>
        </form>

        {/* Info */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center mt-6"
        >
          <p className="text-xs text-muted-grey">
            {t('auth.next_logins_use_password')}
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}

function FileLoginForm({
  onSubmit,
  onBack,
  error,
  loading,
  t,
}: {
  onSubmit: (file: File) => void;
  onBack: () => void;
  error: string;
  loading: boolean;
  t: TFunction;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    } else {
      setFile(null); // Clear file if no file selected (e.g., user cancels file dialog)
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.endsWith('.blend')) {
        setFile(droppedFile);
      } else {
        // Optionally provide feedback for invalid file type
        console.warn('Only .blend files are accepted.');
        setFile(null);
      }
    }
  };

  const handleClearFile = () => {
    setFile(null);
    // Reset file input value to allow re-uploading the same file if needed
    const fileInput = document.getElementById('blend-file-input') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (file) {
      onSubmit(file);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex items-center justify-center min-h-screen p-8"
    >
      <div className="max-w-xl w-full">
        <div className="text-center mb-8">
          <h2
            className="text-4xl font-black mb-3 glow-text-cyan"
            style={{ color: 'var(--neon-purple)' }}
          >
            {t('auth.file_login') || 'Login with Key File'}
          </h2>
          <p className="text-soft-grey">
            {t('auth.upload_key_file') || 'Upload your .blend avatar file'}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="glass-card p-8 mb-6">
            <div className="mb-6">
              <label className="block mb-2 text-sm font-semibold text-pure-white">
                {t('auth.key_file') || 'Key File (.blend)'}
              </label>
              <div
                className={`flex flex-col items-center justify-center w-full min-h-[120px] border-2 rounded-lg cursor-pointer
                  ${isDragging ? 'border-quantum-cyan bg-white/5' :
                    file ? 'border-green-500/50 bg-green-900/20' :
                      'border-gray-600 hover:border-gray-500 hover:bg-white/5'}
                `}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <label
                  htmlFor="blend-file-input"
                  className="flex flex-col items-center justify-center w-full h-full p-4"
                >
                  {file ? (
                    <div className="flex items-center gap-2 text-green-300">
                      <span className="text-2xl">✅</span>
                      <span className="text-lg font-semibold truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={handleClearFile}
                        className="text-red-400 hover:text-red-300 text-sm ml-2"
                        aria-label="Clear selected file"
                      >
                        (Clear)
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="text-4xl mb-2 text-soft-grey">🧊</div>
                      <p className="mb-2 text-sm text-gray-400">
                        <span className="font-semibold">{t('auth.click_to_upload') || 'Click to upload'}</span>
                        {' '}{t('common.or')}
                        <span className="font-semibold">{t('common.drag_and_drop') || 'drag and drop'}</span>
                      </p>
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        .blend files only
                      </p>
                    </>
                  )}
                  <input
                    id="blend-file-input"
                    type="file"
                    className="hidden"
                    accept=".blend"
                    onChange={handleFileChange}
                    disabled={loading}
                  />
                </label>
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-4 bg-error-glow/10 border border-error-glow/30 rounded-lg"
                role="alert"
                aria-live="polite"
              >
                <p className="text-sm text-error-glow font-semibold mb-2">⚠️ {error}</p>
              </motion.div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onBack}
              disabled={loading}
              className="btn btn-ghost flex-1"
            >
              ← {t('common.back')}
            </motion.button>

            <motion.button
              type="submit"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={!file || loading}
              className="btn btn-primary flex-1"
            >
              {loading ? t('auth.connecting') : `${t('auth.login_button')} 🔐`}
            </motion.button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}