/**
 * Signup Flow - Fluid Cryptography Edition
 * 
 * Intégration complète des composants DiceKeyInputFluid, CosmicLoader, DiceKeyResults
 * avec l'esthétique "Fluid Cryptography"
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/auth';
import DiceKeyInputFluid from '../components/DiceKeyInputFluid';
import CosmicLoader from '../components/CosmicLoader';
import DiceKeyResults from '../components/DiceKeyResults';
import * as srp from 'secure-remote-password/client';
// Use kdfSimple for browser compatibility (PBKDF2 instead of Argon2)
// For production, switch back to: import { deriveAllKeysFromDice } from '../lib/kdf';
import { deriveAllKeysFromDice } from '../lib/kdfSimple';
import { generateCompleteKeySet, generateUserId, serializeKeySet } from '../lib/keyGeneration';
import { calculateSeriesChecksum, splitIntoSeries } from '../lib/diceKey';
import { getKeyVault } from '../lib/keyVault';
import { API_BASE_URL } from '../config';
import { createSafeHTML } from '../lib/sanitize';
import { initializeE2EE } from '../lib/e2ee/e2eeService';
import { debugLogger } from '../lib/debugLogger';
import '../styles/fluidCrypto.css';

type Step = 'choose' | 'username' | 'standard-length' | 'standard-display' | 'standard-verify' | 'standard-welcome' | 'standard-password' | 'dicekey' | 'generating' | 'display';

type GenerationStage = 'normalizing' | 'argon2' | 'hkdf' | 'keygen' | 'complete';

export default function SignupFluid() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);

  const [step, setStep] = useState<Step>('choose');
  const [method, setMethod] = useState<'standard' | 'dicekey' | null>(null);
  const [username, setUsername] = useState('');
  const [_diceRolls, setDiceRolls] = useState<number[]>([]);

  // Generation state
  const [generationStage, setGenerationStage] = useState<GenerationStage>('normalizing');
  const [generationProgress, setGenerationProgress] = useState(0);

  // Results
  const [userId, setUserId] = useState('');
  const [checksums, setChecksums] = useState<string[]>([]);
  const [keysGenerated, setKeysGenerated] = useState({
    identityKey: false,
    signatureKey: false,
    signedPreKey: false,
    oneTimePreKeysCount: 0,
  });

  // Standard method state
  const [_mnemonicLength, setMnemonicLength] = useState<12 | 24>(12);
  const [generatedMnemonic, setGeneratedMnemonic] = useState<string[]>([]);
  const [randomWords, setRandomWords] = useState<{ index: number; value: string }[]>([]);
  const [userWordInputs, setUserWordInputs] = useState<string[]>(['', '', '', '', '', '']);
  const [verificationError, setVerificationError] = useState('');
  const [standardPassword, setStandardPassword] = useState('');
  const [standardPasswordConfirm, setStandardPasswordConfirm] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const handleMethodChoice = (selectedMethod: 'standard' | 'dicekey') => {
    setMethod(selectedMethod);
    setStep('username');
  };

  const handleUsernameSubmit = async () => {
    if (username.length < 3) {
      alert(t('signup.username_error'));
      return;
    }

    if (method === 'standard') {
      // Go to length selection
      setStep('standard-length');
    } else {
      // DiceKey flow
      setStep('dicekey');
    }
  };

  const handleStandardLengthSubmit = async (length: 12 | 24) => {
    setMnemonicLength(length);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v2/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          method: 'standard',
          mnemonicLength: length,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: t('signup.error_unknown') }));
        throw new Error(errorData.error || t('signup.error_account_creation'));
      }

      const data = await response.json();

      // Store mnemonic
      setGeneratedMnemonic(data.mnemonic);

      // Store masterKeyHex temporarily (will be saved to localStorage after password setup)
      sessionStorage.setItem('tempMasterKeyHex', data.masterKeyHex);

      // Store session
      sessionStorage.setItem('accessToken', data.accessToken);
      sessionStorage.setItem('refreshToken', data.refreshToken);
      sessionStorage.setItem('userId', data.id);
      sessionStorage.setItem('username', data.username);

      // Show mnemonic display
      setStep('standard-display');
    } catch (error: any) {
      console.error('Standard signup error:', error);
      alert(`${t('common.error')} : ${error.message}`);
    }
  };

  const handleStandardMnemonicConfirm = () => {
    // Generate 6 random word indices to verify
    const indices: number[] = [];
    while (indices.length < 6) {
      const rand = Math.floor(Math.random() * generatedMnemonic.length);
      if (!indices.includes(rand)) {
        indices.push(rand);
      }
    }
    indices.sort((a, b) => a - b);
    setRandomWords(indices.map(i => ({ index: i, value: generatedMnemonic[i] })));

    // Go to verification
    setStep('standard-verify');
  };

  const handleStandardVerification = () => {
    // Check if all inputs match
    const allCorrect = randomWords.every((item, idx) => {
      return userWordInputs[idx].toLowerCase().trim() === item.value.toLowerCase().trim();
    });

    if (allCorrect) {
      // Verification successful, show welcome
      setStep('standard-welcome');
    } else {
      setVerificationError(t('signup.verification_error'));
    }
  };

  const handleStandardWelcomeComplete = () => {
    // Go to password setup
    setStep('standard-password');
  };

  const handleStandardPasswordSubmit = async () => {
    // Validate password
    if (standardPassword.length < 8) {
      setPasswordError(t('signup.password_error_length'));
      return;
    }

    if (standardPassword !== standardPasswordConfirm) {
      setPasswordError(t('signup.password_error_match'));
      return;
    }

    try {
      // Get masterKeyHex from session storage (provided by backend)
      const masterKeyHex = sessionStorage.getItem('tempMasterKeyHex');
      const accessToken = sessionStorage.getItem('accessToken');
      const refreshToken = sessionStorage.getItem('refreshToken');
      const userId = sessionStorage.getItem('userId');

      if (!masterKeyHex || !accessToken || !refreshToken || !userId) {
        throw new Error(t('signup.error_session_missing'));
      }

      // --- SRP SETUP ---
      // Generate SRP credentials
      const srpSalt = srp.generateSalt();
      const privateKey = srp.derivePrivateKey(srpSalt, username, standardPassword);
      const srpVerifier = srp.deriveVerifier(privateKey);

      // Send SRP credentials to backend
      const srpResponse = await fetch(`${API_BASE_URL}/api/v2/auth/srp/setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          srpSalt,
          srpVerifier
        }),
      });

      if (!srpResponse.ok) {
        console.error('SRP Setup failed');
        // We continue anyway, as local encryption is the primary method for now
        // But ideally we should handle this error
      }
      // ----------------

      // Hash the password locally (PBKDF2)
      const encoder = new TextEncoder();
      const salt = encoder.encode(username);
      const passwordKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(standardPassword),
        'PBKDF2',
        false,
        ['deriveBits']
      );

      const derivedBits = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: 10000,
          hash: 'SHA-256',
        },
        passwordKey,
        256
      );

      const hashedPassword = Array.from(new Uint8Array(derivedBits))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // Store password hash locally for this device
      localStorage.setItem(`pwd_${username}`, hashedPassword);

      // Store masterKey encrypted in KeyVault instead of localStorage
      try {
        const vault = await getKeyVault(standardPassword);
        await vault.storeData(`masterKey:${username}`, masterKeyHex);
        // Clean up any legacy clear-text storage if it exists
        localStorage.removeItem(`master_${username}`);
      } catch (vaultError) {
        console.error('[SignupFluid] Failed to store masterKey in KeyVault', vaultError);
      }

      // Create session in auth store
      setSession({
        user: {
          id: userId,
          username,
          securityTier: 'standard',
        },
        accessToken,
        refreshToken,
      });

      // Clear temporary session data
      sessionStorage.removeItem('tempMasterKeyHex');
      sessionStorage.removeItem('accessToken');
      sessionStorage.removeItem('refreshToken');
      sessionStorage.removeItem('userId');
      sessionStorage.removeItem('username');

      // Initialize E2EE immediately after account creation
      try {
        await initializeE2EE(username);
        debugLogger.debug('[SignupFluid] E2EE initialized for new account');
      } catch (e2eeError) {
        console.warn('[SignupFluid] E2EE initialization failed:', e2eeError);
      }

      // Navigate to conversations
      navigate('/conversations');
    } catch (error: any) {
      console.error('Password setup error:', error);
      setPasswordError(t('signup.password_error_setup'));
    }
  };

  const handleWordInputChange = (index: number, value: string) => {
    const newInputs = [...userWordInputs];
    newInputs[index] = value;
    setUserWordInputs(newInputs);
    setVerificationError('');
  };

  const handleDiceKeyComplete = async (rolls: number[]) => {
    setDiceRolls(rolls);

    // Calculate checksums before generation
    const series = splitIntoSeries(rolls);
    const calculatedChecksums = series.map((s) => calculateSeriesChecksum(s));

    setChecksums(calculatedChecksums);

    // Start generation
    setStep('generating');

    try {
      // Stage 1: Normalizing
      setGenerationStage('normalizing');
      setGenerationProgress(10);
      await sleep(300);

      // Stage 2: Argon2id (le plus long)
      setGenerationStage('argon2');
      setGenerationProgress(25);

      const seeds = await deriveAllKeysFromDice(rolls, (progress) => {
        // Argon2 prend 25% → 70% du total
        setGenerationProgress(25 + progress * 0.45);
      });

      // Stage 3: HKDF
      setGenerationStage('hkdf');
      setGenerationProgress(75);
      await sleep(200);

      // Stage 4: Key Generation
      setGenerationStage('keygen');
      setGenerationProgress(85);

      const keySet = await generateCompleteKeySet(seeds);
      const generatedUserId = await generateUserId(keySet.identityKey.publicKey);

      setUserId(generatedUserId);
      setKeysGenerated({
        identityKey: true,
        signatureKey: true,
        signedPreKey: true,
        oneTimePreKeysCount: keySet.oneTimePreKeys.length,
      });

      // Stage 5: Complete
      setGenerationStage('complete');
      setGenerationProgress(100);

      // Transition is now handled by CosmicLoader onComplete callback
      // await sleep(500);
      // setStep('display');

      // ⚠️ IMPORTANT: Use calculatedChecksums directly, not checksums state
      // React state updates are asynchronous, so checksums might be empty here
      sessionStorage.setItem('pendingSignup', JSON.stringify({
        username,
        userId: generatedUserId,
        checksums: calculatedChecksums, // ✅ Use direct value, not state
        masterKeyHex: seeds.masterKey, // ✅ Use direct hex value
        keySet: serializeKeySet(keySet),
      }));

    } catch (error) {
      console.error('Generation error:', error);
      alert(t('signup.error_account_creation'));
      setStep('dicekey');
    }
  };

  const handleConfirmSignup = () => {
    // Don't create account yet, go to Welcome page first
    // User will create account after reconnection
    const pendingData = sessionStorage.getItem('pendingSignup');

    if (!pendingData) {
      alert(t('signup.error_missing_data'));
      return;
    }

    const data = JSON.parse(pendingData);

    navigate('/welcome', {
      state: {
        userId: data.userId,
        username: data.username,
        checksums: data.checksums,
        avatarHash: data.avatarHash,
      },
    });
  };

  const handleRetry = () => {
    setStep('dicekey');
    setDiceRolls([]);
    setUserId('');
    setChecksums([]);
    setKeysGenerated({
      identityKey: false,
      signatureKey: false,
      signedPreKey: false,
      oneTimePreKeysCount: 0,
    });
  };

  return (
    <div className="dark-matter-bg min-h-screen">
      <AnimatePresence mode="wait">
        {step === 'choose' && (
          <ChooseMethod key="choose" onSelect={handleMethodChoice} />
        )}

        {step === 'username' && (
          <UsernameStep
            key="username"
            username={username}
            setUsername={setUsername}
            onSubmit={handleUsernameSubmit}
            onBack={() => setStep('choose')}
          />
        )}

        {step === 'standard-length' && (
          <StandardLengthChoice
            key="standard-length"
            onSelect={handleStandardLengthSubmit}
            onBack={() => setStep('username')}
          />
        )}

        {step === 'standard-display' && (
          <StandardMnemonicDisplay
            key="standard-display"
            mnemonic={generatedMnemonic}
            username={username}
            onConfirm={handleStandardMnemonicConfirm}
          />
        )}

        {step === 'standard-verify' && (
          <StandardVerification
            key="standard-verify"
            randomWords={randomWords}
            userInputs={userWordInputs}
            onInputChange={handleWordInputChange}
            onVerify={handleStandardVerification}
            onBack={() => setStep('standard-display')}
            error={verificationError}
          />
        )}

        {step === 'standard-welcome' && (
          <StandardWelcome
            key="standard-welcome"
            username={username}
            onContinue={handleStandardWelcomeComplete}
          />
        )}

        {step === 'standard-password' && (
          <StandardPasswordForm
            key="standard-password"
            username={username}
            password={standardPassword}
            passwordConfirm={standardPasswordConfirm}
            error={passwordError}
            onPasswordChange={setStandardPassword}
            onPasswordConfirmChange={setStandardPasswordConfirm}
            onSubmit={handleStandardPasswordSubmit}
            onBack={() => setStep('standard-welcome')}
          />
        )}

        {step === 'dicekey' && (
          <motion.div
            key="dicekey"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <DiceKeyInputFluid
              onComplete={handleDiceKeyComplete}
              onCancel={() => setStep('username')}
            />
          </motion.div>
        )}

        {step === 'generating' && (
          <motion.div
            key="generating"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <CosmicLoader
              stage={generationStage}
              progress={generationProgress}
              onComplete={() => setStep('display')}
            />
          </motion.div>
        )}

        {step === 'display' && (
          <motion.div
            key="display"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <DiceKeyResults
              userId={userId}
              username={username}
              keysGenerated={keysGenerated}
              checksums={checksums}
              onConfirm={handleConfirmSignup}
              onRetry={handleRetry}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// Sub-Components
// ============================================================================

function ChooseMethod({ onSelect }: { onSelect: (method: 'standard' | 'dicekey') => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

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
            {t('signup.title')}
          </motion.h1>
          <p className="text-soft-grey text-xl">
            {t('signup.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Standard Method */}
          <motion.button
            whileHover={{ scale: 1.02, y: -4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect('standard')}
            className="glass-card p-8 text-left card-hover"
          >
            <div className="text-4xl mb-4">🔑</div>
            <h3 className="text-2xl font-bold mb-3 text-pure-white">{t('signup.method_standard')}</h3>
            <p className="text-soft-grey mb-4">
              {t('signup.method_standard_desc')}
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="badge badge-quantum">⚡ {t('signup.fast')}</span>
              <span className="badge badge-trust">🔒 {t('signup.bits_256')}</span>
            </div>
          </motion.button>

          {/* DiceKey Method */}
          <motion.button
            whileHover={{ scale: 1.02, y: -4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect('dicekey')}
            className="glass-card p-8 text-left card-hover"
            style={{
              borderColor: 'var(--magenta-trust)',
              borderWidth: '2px',
            }}
          >
            <div className="text-4xl mb-4">🎲</div>
            <h3 className="text-2xl font-bold mb-3 text-pure-white">
              {t('signup.method_dicekey')}
              <span className="ml-2 text-sm badge badge-trust">{t('signup.recommended')}</span>
            </h3>
            <p className="text-soft-grey mb-4">
              {t('signup.method_dicekey_desc')}
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="badge badge-quantum">🌌 {t('signup.bits_775')}</span>
              <span className="badge badge-trust">🛡️ {t('signup.quantum_resistant')}</span>
            </div>
          </motion.button>
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center text-muted-grey text-sm mt-8"
        >
          {t('signup.dicekey_info')}
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="text-center mt-6"
        >
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/')}
            className="btn btn-ghost"
          >
            {t('signup.back_home')}
          </motion.button>
        </motion.div>
      </div>
    </motion.div>
  );
}

function UsernameStep({
  username,
  setUsername,
  onSubmit,
  onBack,
}: {
  username: string;
  setUsername: (val: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex items-center justify-center min-h-screen p-8"
    >
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h2
            className="text-4xl font-black mb-3 glow-text-cyan"
            style={{ color: 'var(--quantum-cyan)' }}
          >
            {t('signup.your_identity')}
          </h2>
          <p className="text-soft-grey">
            {t('signup.choose_username')}
          </p>
        </div>

        <div className="glass-card p-8 mb-6">
          <label className="block mb-2 text-sm font-semibold text-pure-white">
            {t('signup.username_label')}
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder=""
            className="input mb-4"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
          />

          <div className="flex items-center gap-2 text-xs text-muted-grey">
            <span>{t('signup.username_hint')}</span>
          </div>
        </div>

        <div className="flex gap-4">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onBack}
            className="btn btn-ghost flex-1"
          >
            {t('signup.back')}
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onSubmit}
            disabled={username.length < 3}
            className="btn btn-primary flex-1"
          >
            {t('signup.start_input')}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

// Standard Length Choice Component
function StandardLengthChoice({
  onSelect,
  onBack,
}: {
  onSelect: (length: 12 | 24) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();

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
            {t('signup.mnemonic_phrase_title')}
          </motion.h1>
          <p className="text-soft-grey text-xl">
            {t('signup.choose_length')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* 12 Words */}
          <motion.button
            whileHover={{ scale: 1.05, y: -8 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect(12)}
            className="glass-card p-8 text-left card-hover"
          >
            <div className="text-6xl mb-4">📝</div>
            <h3 className="text-2xl font-bold mb-3 text-pure-white">{t('signup.words_12')}</h3>
            <p className="text-soft-grey mb-4">
              {t('signup.words_12_desc')}
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="badge badge-quantum">🔒 {t('signup.bits_128')}</span>
              <span className="badge badge-trust">⚡ {t('signup.fast')}</span>
            </div>
          </motion.button>

          {/* 24 Words */}
          <motion.button
            whileHover={{ scale: 1.05, y: -8 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect(24)}
            className="glass-card p-8 text-left card-hover"
            style={{
              borderColor: 'var(--magenta-trust)',
              borderWidth: '2px',
            }}
          >
            <div className="text-6xl mb-4">🔐</div>
            <h3 className="text-2xl font-bold mb-3 text-pure-white">
              {t('signup.words_24')}
              <span className="ml-2 text-sm badge badge-trust">{t('signup.ultra_secure')}</span>
            </h3>
            <p className="text-soft-grey mb-4">
              {t('signup.words_24_desc')}
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="badge badge-quantum">🛡️ {t('signup.bits_256')}</span>
              <span className="badge badge-trust">🏆 {t('signup.maximum')}</span>
            </div>
          </motion.button>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center mt-8"
        >
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onBack}
            className="btn btn-ghost"
          >
            {t('signup.back')}
          </motion.button>
        </motion.div>
      </div>
    </motion.div>
  );
}

// Standard Mnemonic Display Component
function StandardMnemonicDisplay({
  mnemonic,
  username,
  onConfirm,
}: {
  mnemonic: string[];
  username: string;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copyMnemonic = () => {
    navigator.clipboard.writeText(mnemonic.join(' '));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center justify-center min-h-screen p-8"
    >
      <div className="max-w-4xl w-full">
        {/* Success Header */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, ease: [0.68, -0.55, 0.265, 1.55] }}
            className="text-7xl mb-4"
          >
            ✅
          </motion.div>

          <motion.h1
            className="text-4xl font-black mb-4 glow-text-cyan"
            style={{ color: 'var(--quantum-cyan)' }}
          >
            {t('signup.account_created')}
          </motion.h1>

          <p className="text-soft-grey text-xl">
            @{username}
          </p>
        </div>

        {/* Mnemonic Display */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-8 mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-pure-white">
              🔐 {t('signup.your_mnemonic', { count: mnemonic.length })}
            </h3>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={copyMnemonic}
              className="p-3 rounded-lg bg-dark-matter-lighter hover:bg-quantum-cyan/20 transition-colors"
              title={t('signup.copy')}
              aria-label={copied ? t('common.success') : t('signup.copy_all')}
            >
              {copied ? '✅' : '📋'}
            </motion.button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            {mnemonic.map((word, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + idx * 0.02 }}
                className="flex items-center gap-2 p-3 bg-dark-matter-lighter rounded-lg"
              >
                <span className="text-quantum-cyan font-mono text-sm font-bold w-8">
                  {idx + 1}.
                </span>
                <span className="text-pure-white font-mono font-semibold">
                  {word}
                </span>
              </motion.div>
            ))}
          </div>

          <p className="text-sm text-soft-grey text-center">
            {t('signup.copy_hint')}
          </p>
        </motion.div>

        {/* Critical Warning */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="glass-card p-6 mb-6 border-l-4"
          style={{ borderLeftColor: 'var(--error-glow)' }}
        >
          <div className="flex items-start gap-4">
            <motion.span
              animate={{
                scale: [1, 1.1, 1],
              }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-4xl"
            >
              ⚠️
            </motion.span>
            <div>
              <h4 className="font-bold text-pure-white mb-3 text-xl">
                {t('signup.write_down_now')}
              </h4>
              <div className="space-y-2 text-sm text-soft-grey">
                <p>✓ {t('signup.warning_only_way')}</p>
                <p>✓ {t('signup.warning_lose_access')}</p>
                <p>✓ {t('signup.warning_never_share')}</p>
                <p>✓ {t('signup.warning_safe_place')}</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="text-center"
        >
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onConfirm}
            className="btn btn-primary text-xl px-12 py-4"
            style={{
              background: 'linear-gradient(135deg, var(--quantum-cyan), var(--magenta-trust))',
            }}
          >
            {t('signup.noted_continue')}
          </motion.button>

          <p className="text-xs text-muted-grey mt-4">
            {t('signup.use_any_device')}
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}

// Standard Password Form Component
function StandardPasswordForm({
  username,
  password,
  passwordConfirm,
  error,
  onPasswordChange,
  onPasswordConfirmChange,
  onSubmit,
  onBack,
}: {
  username: string;
  password: string;
  passwordConfirm: string;
  error: string;
  onPasswordChange: (val: string) => void;
  onPasswordConfirmChange: (val: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center justify-center min-h-screen p-8"
    >
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, ease: [0.68, -0.55, 0.265, 1.55] }}
            className="text-6xl mb-4"
          >
            🔒
          </motion.div>

          <h2 className="text-4xl font-black mb-4 text-pure-white">
            {t('signup.password_setup')}
          </h2>

          <p className="text-soft-grey text-xl">
            {t('signup.password_setup_desc')}
          </p>
        </div>

        <div className="glass-card p-8 mb-6">
          <div className="mb-6">
            <label className="block text-sm font-semibold text-soft-grey mb-2">
              {t('auth.username')}
            </label>
            <div className="text-2xl font-bold text-quantum-cyan">
              @{username}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-soft-grey mb-2">
                {t('signup.password_label')} ({t('signup.password_min_chars')})
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                placeholder="••••••••"
                className="input w-full"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-soft-grey mb-2">
                {t('signup.password_confirm_label')}
              </label>
              <input
                type="password"
                value={passwordConfirm}
                onChange={(e) => onPasswordConfirmChange(e.target.value)}
                placeholder="••••••••"
                className="input w-full"
              />
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-3 bg-error-glow/10 border border-error-glow/30 rounded-lg"
              role="alert"
              aria-live="polite"
            >
              <p className="text-sm text-error-glow">{error}</p>
            </motion.div>
          )}

          <div className="mt-6 p-4 bg-quantum-cyan/5 border border-quantum-cyan/20 rounded-lg">
            <p className="text-xs text-soft-grey">
              {t('auth.password_local')}
            </p>
          </div>
        </div>

        <div className="flex gap-4">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onBack}
            className="btn btn-ghost flex-1"
          >
            {t('signup.back')}
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onSubmit}
            disabled={password.length < 8 || password !== passwordConfirm}
            className="btn btn-primary flex-1"
          >
            {t('signup.set_password')}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

// Standard Verification Component
function StandardVerification({
  randomWords,
  userInputs,
  onInputChange,
  onVerify,
  onBack,
  error,
}: {
  randomWords: { index: number; value: string }[];
  userInputs: string[];
  onInputChange: (index: number, value: string) => void;
  onVerify: () => void;
  onBack: () => void;
  error: string;
}) {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center justify-center min-h-screen p-8"
    >
      <div className="max-w-3xl w-full">
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, ease: [0.68, -0.55, 0.265, 1.55] }}
            className="text-6xl mb-4"
          >
            🔍
          </motion.div>

          <h2 className="text-4xl font-black mb-4 text-pure-white">
            {t('signup.verification_title')}
          </h2>

          <p className="text-soft-grey text-xl">
            {t('signup.verification_desc')}
          </p>
        </div>

        <div className="glass-card p-8 mb-6">
          <div className="space-y-4 mb-6">
            {randomWords.map((item, idx) => (
              <div key={idx} className="flex items-center gap-4">
                <span className="text-quantum-cyan font-mono font-bold w-24">
                  {t('signup.word_number', { number: item.index + 1 })}:
                </span>
                <input
                  type="text"
                  value={userInputs[idx]}
                  onChange={(e) => onInputChange(idx, e.target.value)}
                  placeholder={t('welcome.checksum_placeholder')}
                  className="input flex-1 font-mono"
                  autoFocus={idx === 0}
                />
              </div>
            ))}
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-error-glow/10 border border-error-glow/30 rounded-lg"
              role="alert"
              aria-live="polite"
            >
              <p className="text-sm text-error-glow">{error}</p>
            </motion.div>
          )}
        </div>

        <div className="flex gap-4">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onBack}
            className="btn btn-ghost flex-1"
          >
            {t('signup.back')}
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onVerify}
            disabled={userInputs.some(input => input.trim() === '')}
            className="btn btn-primary flex-1"
          >
            {t('signup.verify')}
          </motion.button>
        </div>

        <p className="text-xs text-muted-grey text-center mt-6">
          {t('auth.separate_words')}
        </p>
      </div>
    </motion.div>
  );
}

// Standard Welcome Component
function StandardWelcome({
  username,
  onContinue,
}: {
  username: string;
  onContinue: () => void;
}) {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center justify-center min-h-screen p-8"
    >
      <div className="max-w-3xl w-full">
        {/* Success Header */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, ease: [0.68, -0.55, 0.265, 1.55] }}
            className="text-7xl mb-4"
          >
            🎉
          </motion.div>

          <motion.h1
            className="text-5xl font-black mb-4 glow-text-cyan"
            style={{ color: 'var(--quantum-cyan)' }}
            animate={{
              textShadow: [
                '0 0 20px rgba(0, 229, 255, 0.4)',
                '0 0 40px rgba(0, 229, 255, 0.6)',
                '0 0 20px rgba(0, 229, 255, 0.4)',
              ],
            }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            {t('signup.welcome_title', { username })}
          </motion.h1>

          <p className="text-soft-grey text-xl">
            {t('signup.welcome_desc')}
          </p>
        </div>

        {/* Success Message */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-8 mb-6"
        >
          <h3 className="text-2xl font-bold mb-4 text-pure-white text-center">
            ✅ {t('common.success')}
          </h3>
          <p className="text-soft-grey text-center">
            {t('auth.noted_phrase')}
          </p>
        </motion.div>

        {/* Responsibility Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="glass-card p-8 mb-8 border-l-4"
          style={{ borderLeftColor: 'var(--quantum-cyan)' }}
        >
          <h3 className="text-xl font-bold mb-4 text-pure-white flex items-center gap-2">
            <span>🔐</span>
            {t('auth.important_warning')}
          </h3>

          <div className="space-y-4 text-sm text-soft-grey">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🔑</span>
              <div>
                <p className="text-pure-white font-semibold mb-1">{t('signup.warning_safe_place')}</p>
                <p>{t('auth.warning_desc')}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="text-2xl">🚫</span>
              <div>
                <p className="text-pure-white font-semibold mb-1">{t('signup.warning_never_share')}</p>
                <p>{t('auth.warning_desc')}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <p className="text-pure-white font-semibold mb-1">{t('signup.warning_lose_access')}</p>
                {/* SECURITY FIX VULN-005: Sanitize translation HTML */}
                <p className="text-sm text-soft-grey" dangerouslySetInnerHTML={createSafeHTML(t('welcome.zero_knowledge'))} />
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="text-2xl">💾</span>
              <div>
                <p className="text-pure-white font-semibold mb-1">{t('settings.backup_export')}</p>
                <p>{t('auth.warning_desc')}</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="text-center"
        >
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onContinue}
            className="btn btn-primary text-xl px-16 py-4"
            style={{
              background: 'linear-gradient(135deg, var(--quantum-cyan), var(--magenta-trust))',
            }}
          >
            {t('signup.continue')}
          </motion.button>
        </motion.div>

        {/* Security Badges */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
          className="flex justify-center gap-3 mt-8"
        >
          <div className="badge badge-quantum">🔐 E2E Encryption</div>
          <div className="badge badge-trust">🛡️ Zero-Knowledge</div>
          <div className="badge badge-quantum">🔥 Burn After Reading</div>
        </motion.div>
      </div>
    </motion.div>
  );
}

// Helper
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
