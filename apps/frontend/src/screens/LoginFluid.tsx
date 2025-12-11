/**
 * Login Flow - Fluid Cryptography Edition
 * 
 * Flux de connexion avec support DiceKey (ressaisie 300 dés)
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import DiceKeyInputFluid from '../components/DiceKeyInputFluid';
import CosmicLoader from '../components/CosmicLoader';
import { API_BASE_URL } from '../config';
import '../styles/fluidCrypto.css';
// For production, switch back to: import { deriveAllKeysFromDice } from '../lib/kdf';
import { deriveAllKeysFromDice } from '../lib/kdfSimple';
import { generateCompleteKeySet, generateUserId } from '../lib/keyGeneration';
import { calculateSeriesChecksum, splitIntoSeries } from '../lib/diceKey';
import { debugLogger } from "../debugLogger";
import '../styles/fluidCrypto.css';

// Helper function for encrypting dice rolls
async function encryptDiceRolls(diceRolls: number[], password: string): Promise<string> {
  const enc = new TextEncoder();
  const data = JSON.stringify(diceRolls);

  const passwordKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
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

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    enc.encode(data)
  );

  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);

  return btoa(String.fromCharCode(...combined));
}

type Step = 'choose' | 'username' | 'password' | 'dicekey' | 'generating' | 'error';

type GenerationStage = 'normalizing' | 'argon2' | 'hkdf' | 'keygen' | 'complete';

export default function LoginFluid() {
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('choose');
  const [_method, setMethod] = useState<'standard' | 'dicekey' | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [_diceRolls, setDiceRolls] = useState<number[]>([]);
  const [error, setError] = useState('');

  // Generation state (for DiceKey)
  const [generationStage, setGenerationStage] = useState<GenerationStage>('normalizing');
  const [generationProgress, setGenerationProgress] = useState(0);

  const handleMethodChoice = (selectedMethod: 'standard' | 'dicekey') => {
    setMethod(selectedMethod);

    if (selectedMethod === 'standard') {
      setStep('username');
    } else {
      setStep('dicekey');
    }
  };

  const handleStandardLogin = async () => {
    if (username.length < 3 || password.length < 8) {
      setError('Username (≥3) et mot de passe (≥8) requis');
      return;
    }

    try {
      // Standard login (to be implemented)
      // For now, placeholder
      alert('Standard login pas encore implémenté');
    } catch (err: any) {
      setError(err.message || 'Erreur de connexion');
      setStep('error');
    }
  };

  const handleDiceKeyComplete = async (rolls: number[]) => {
    setDiceRolls(rolls);
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

      // Generate userId and checksums for future quick login
      const generatedUserId = await generateUserId(keySet.identityKey.publicKey);
      const series = splitIntoSeries(rolls);
      const checksums = series.map((s) => calculateSeriesChecksum(s));

      // Stage 5: Complete
      setGenerationStage('complete');
      setGenerationProgress(100);
      await sleep(500);

      // Login with DiceKey
      const identityPublicKeyBase64 = btoa(String.fromCharCode(...keySet.identityKey.publicKey));

      const response = await fetch(`${API_BASE_URL}/api/v2/auth/login-dicekey`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identityPublicKey: identityPublicKeyBase64,
          masterKeyHex: seeds.masterKey, // Send masterKey for Argon2 verification
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Login failed');
      }

      const data = await response.json();

      // Store dice rolls encrypted for future quick login with ID + checksums
      try {
        const checksumPassword = checksums.join('') + generatedUserId;
        const encryptedRolls = await encryptDiceRolls(rolls, checksumPassword);
        localStorage.setItem(`diceRolls_${generatedUserId}`, encryptedRolls);
        debugLogger.debug('[LoginFluid] Dice rolls stored for quick login');
      } catch (storageError) {
        console.error('[LoginFluid] Failed to store dice rolls:', storageError);
        // Continue anyway - this is not critical for login
      }

      // Store session
      sessionStorage.setItem('accessToken', data.accessToken);
      sessionStorage.setItem('refreshToken', data.refreshToken);
      sessionStorage.setItem('userId', data.user.id);
      sessionStorage.setItem('username', data.user.username);

      // Store keys temporarily (in production, use secure storage)
      const serialized = {
        identityPublicKey: btoa(String.fromCharCode(...keySet.identityKey.publicKey)),
        identitySecretKey: btoa(String.fromCharCode(...keySet.identityKey.secretKey)),
        signaturePublicKey: btoa(String.fromCharCode(...keySet.signatureKey.publicKey)),
        signatureSecretKey: btoa(String.fromCharCode(...keySet.signatureKey.secretKey)),
      };
      sessionStorage.setItem('keySet', JSON.stringify(serialized));

      // Navigate to app
      navigate('/settings');
    } catch (error: any) {
      console.error('Login error:', error);
      setError(error.message || 'Erreur lors du login');
      setStep('error');
    }
  };

  const handleRetry = () => {
    setError('');
    setStep('choose');
    setMethod(null);
    setUsername('');
    setPassword('');
    setDiceRolls([]);
  };

  return (
    <div className="dark-matter-bg min-h-screen">
      <AnimatePresence mode="wait">
        {step === 'choose' && (
          <ChooseMethod key="choose" onSelect={handleMethodChoice} />
        )}

        {step === 'username' && (
          <StandardLoginForm
            key="username"
            username={username}
            setUsername={setUsername}
            password={password}
            setPassword={setPassword}
            onSubmit={handleStandardLogin}
            onBack={() => setStep('choose')}
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
              onCancel={() => setStep('choose')}
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
            <CosmicLoader stage={generationStage} progress={generationProgress} />
          </motion.div>
        )}

        {step === 'error' && (
          <ErrorScreen key="error" error={error} onRetry={handleRetry} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// Sub-Components
// ============================================================================

function ChooseMethod({ onSelect }: { onSelect: (method: 'standard' | 'dicekey') => void }) {
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
            Connexion
          </motion.h1>
          <p className="text-soft-grey text-xl">
            Choisissez votre méthode d'authentification
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
            <h3 className="text-2xl font-bold mb-3 text-pure-white">Standard</h3>
            <p className="text-soft-grey mb-4">
              Username + mot de passe classique
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="badge badge-quantum">⚡ Rapide</span>
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
              DiceKey
              <span className="ml-2 text-sm badge badge-trust">SÉCURISÉ</span>
            </h3>
            <p className="text-soft-grey mb-4">
              Ressaisissez vos 300 lancers de dés
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="badge badge-quantum">🌌 775 bits</span>
              <span className="badge badge-trust">🛡️ Zero-Knowledge</span>
            </div>
          </motion.button>
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center text-muted-grey text-sm mt-8"
        >
          💡 Vous devez utiliser la même méthode que lors de la création de votre compte
        </motion.p>
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
}: {
  username: string;
  setUsername: (val: string) => void;
  password: string;
  setPassword: (val: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}) {
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
            Connexion Standard
          </h2>
          <p className="text-soft-grey">
            Saisissez vos identifiants
          </p>
        </div>

        <div className="glass-card p-8 mb-6">
          <div className="mb-4">
            <label className="block mb-2 text-sm font-semibold text-pure-white">
              Nom d'utilisateur
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="alice_crypto"
              className="input"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
            />
          </div>

          <div className="mb-4">
            <label className="block mb-2 text-sm font-semibold text-pure-white">
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input"
              onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-grey">
            <span>💡</span>
            <span>Minimum 8 caractères</span>
          </div>
        </div>

        <div className="flex gap-4">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onBack}
            className="btn btn-ghost flex-1"
          >
            Retour
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onSubmit}
            disabled={username.length < 3 || password.length < 8}
            className="btn btn-primary flex-1"
          >
            Se connecter 🔐
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

function ErrorScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="flex items-center justify-center min-h-screen p-8"
    >
      <div className="max-w-md w-full">
        <div className="glass-card p-8 text-center border-l-4"
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

          <h2 className="text-2xl font-bold mb-4 text-pure-white">
            Échec de Connexion
          </h2>

          <p className="text-soft-grey mb-6">
            {error}
          </p>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onRetry}
            className="btn btn-primary w-full"
          >
            Réessayer
          </motion.button>

          <p className="text-xs text-muted-grey mt-4">
            💡 Vérifiez que vous utilisez la bonne méthode de connexion
            (Standard vs DiceKey)
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// Helper
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
