/**
 * DiceKey Results Display - Fluid Cryptography Edition
 * 
 * Affichage élégant des résultats de génération avec
 * animations de particules et feedback visuel
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import '../styles/fluidCrypto.css';

interface DiceKeyResultsProps {
  userId: string;
  username: string;
  keysGenerated: {
    identityKey: boolean;
    signatureKey: boolean;
    signedPreKey: boolean;
    oneTimePreKeysCount: number;
  };
  checksums: string[];
  onConfirm: () => void;
  onRetry?: () => void;
}

export default function DiceKeyResults({
  userId,
  username,
  keysGenerated,
  checksums,
  onConfirm,
  onRetry,
}: DiceKeyResultsProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [copiedChecksums, setCopiedChecksums] = useState(false);

  // Avatar State
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(true);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const copyUserId = () => {
    navigator.clipboard.writeText(userId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyAllChecksums = () => {
    const formatted = checksums
      .map((checksum, idx) => `${idx + 1}. ${checksum}`)
      .join('\n');
    navigator.clipboard.writeText(formatted);
    setCopiedChecksums(true);
    setTimeout(() => setCopiedChecksums(false), 2000);
  };

  // Generate Avatar on Mount
  useEffect(() => {
    const generateAvatar = async () => {
      try {
        setIsGenerating(true);
        console.log('[DiceKeyResults] Generating avatar with', { checksums: checksums.length, userId });
        
        // Use relative URL - Vite proxy will forward to backend
        const response = await fetch('/api/generate-dicekey-avatar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checksums, userId }),
        });

        console.log('[DiceKeyResults] Response status:', response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('[DiceKeyResults] API Error:', response.status, errorText);
          throw new Error(`Generation failed: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('[DiceKeyResults] API Response:', data);
        
        if (data.success && data.avatarUrl) {
          // Use relative URL - Vite proxy will forward to backend
          setAvatarUrl(data.avatarUrl);

          // Store avatarHash in pendingSignup for account creation
          if (data.avatarHash) {
            const pendingData = sessionStorage.getItem('pendingSignup');
            if (pendingData) {
              const parsed = JSON.parse(pendingData);
              parsed.avatarHash = data.avatarHash;
              sessionStorage.setItem('pendingSignup', JSON.stringify(parsed));
            }
          }
        } else {
          throw new Error(data.error || 'Unknown error');
        }
      } catch (err: any) {
        console.error('[DiceKeyResults] Error:', err);
        setGenerationError(err.message || 'Failed to generate visual identity.');
      } finally {
        setIsGenerating(false);
      }
    };

    generateAvatar();
  }, [checksums, userId]);

  return (
    <div className="dark-matter-bg min-h-screen flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-2 gap-8"
      >
        {/* Left Column: Avatar & Identity */}
        <div className="space-y-6">
          {/* Avatar Display */}
          <motion.div
            className="glass-card p-1 aspect-square relative overflow-hidden flex items-center justify-center bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            {isGenerating ? (
              <div className="text-center">
                <div className="loading-spinner mb-4 mx-auto border-quantum-cyan"></div>
                <p className="text-quantum-cyan animate-pulse text-sm">
                  {t('dicekey_results.generating_avatar', 'Forging your unique visual identity...')}
                </p>
              </div>
            ) : generationError ? (
              <div className="text-error-glow text-center p-4">
                <p>⚠️ {generationError}</p>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative w-full h-full group flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 to-black rounded-lg border border-white/10"
              >
                <div className="text-6xl mb-4">🧊</div>
                <p className="text-quantum-cyan font-bold mb-2">DiceKey Avatar</p>
                <p className="text-xs text-muted-grey mb-4">Format: .blend</p>

                <a
                  href={avatarUrl!}
                  download={`dicekey-avatar-${userId}.blend`}
                  className="btn btn-primary flex items-center gap-2"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span>⬇️</span> {t('dicekey_results.download_blend', 'Download Key File')}
                </a>
              </motion.div>
            )}
          </motion.div>

          {/* User ID Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-card p-6 card-hover"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <label className="text-xs uppercase tracking-wider text-muted-grey font-semibold mb-2 block">
                  {t('dicekey_results.unique_identity')}
                </label>
                <div className="flex items-center gap-3">
                  <motion.code
                    className="text-2xl font-bold font-mono"
                    style={{ color: 'var(--quantum-cyan)' }}
                    animate={{
                      textShadow: [
                        '0 0 10px rgba(0, 229, 255, 0.4)',
                        '0 0 20px rgba(0, 229, 255, 0.6)',
                        '0 0 10px rgba(0, 229, 255, 0.4)',
                      ],
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    {userId}
                  </motion.code>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={copyUserId}
                    className="p-2 rounded-lg bg-dark-matter-lighter hover:bg-quantum-cyan/20 transition-colors"
                    title={t('dicekey_results.copy')}
                  >
                    {copied ? t('dicekey_results.copied') : '📋'}
                  </motion.button>
                </div>
                <p className="text-xs text-muted-grey mt-1">
                  @{username}
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Right Column: Details & Actions */}
        <div className="space-y-6">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, ease: [0.68, -0.55, 0.265, 1.55] }}
            className="text-left"
          >
            <h2
              className="text-3xl font-black mb-2 glow-text-cyan"
              style={{ color: 'var(--quantum-cyan)' }}
            >
              {t('dicekey_results.title')}
            </h2>
            <p className="text-soft-grey text-lg">
              {t('dicekey_results.subtitle')}
            </p>
          </motion.div>

          {/* Generated Keys */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="glass-card p-6"
          >
            <h3 className="text-lg font-bold mb-4 text-pure-white flex items-center gap-2">
              {t('dicekey_results.keys_generated')}
            </h3>

            <div className="space-y-3">
              <KeyStatusItem
                label={t('dicekey_results.key_identity')}
                type={t('dicekey_results.key_type_ed25519')}
                status={keysGenerated.identityKey}
                delay={0.6}
              />
              <KeyStatusItem
                label={t('dicekey_results.key_signature')}
                type={t('dicekey_results.key_type_ed25519')}
                status={keysGenerated.signatureKey}
                delay={0.7}
              />
              <KeyStatusItem
                label={t('dicekey_results.key_signed_pre')}
                type={t('dicekey_results.key_type_x25519')}
                status={keysGenerated.signedPreKey}
                delay={0.8}
              />
              <KeyStatusItem
                label={t('dicekey_results.key_one_time')}
                type={t('dicekey_results.key_type_count', { count: keysGenerated.oneTimePreKeysCount })}
                status={keysGenerated.oneTimePreKeysCount > 0}
                delay={0.9}
              />
            </div>
          </motion.div>

          {/* Checksums Summary - Improved Layout */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 }}
            className="glass-card p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-pure-white flex items-center gap-2">
                🔐 {t('dicekey_results.checksums_title', { count: checksums.length })}
              </h3>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={copyAllChecksums}
                className="px-3 py-1.5 text-xs rounded-lg bg-dark-matter-lighter hover:bg-quantum-cyan/20 transition-colors flex items-center gap-1.5"
                title={t('dicekey_results.copy_all_checksums')}
              >
                {copiedChecksums ? '✓' : '📋'} 
                <span className="hidden sm:inline">{copiedChecksums ? t('dicekey_results.copied') : 'Copy'}</span>
              </motion.button>
            </div>

            {/* Grouped checksums - 3 rows of 10 */}
            <div className="space-y-2">
              {[0, 1, 2].map((rowIdx) => (
                <div key={rowIdx} className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-grey w-8 flex-shrink-0">
                    {rowIdx * 10 + 1}-{rowIdx * 10 + 10}
                  </span>
                  <div className="flex-1 flex gap-0.5 overflow-hidden">
                    {checksums.slice(rowIdx * 10, rowIdx * 10 + 10).map((checksum, idx) => (
                      <motion.div
                        key={rowIdx * 10 + idx}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1 + (rowIdx * 10 + idx) * 0.015 }}
                        className="group relative flex-1 min-w-0"
                        title={`#${rowIdx * 10 + idx + 1}: ${checksum}`}
                      >
                        <div 
                          className="px-1 py-1.5 text-center rounded text-[10px] font-mono truncate cursor-default transition-all duration-200 hover:z-10 hover:absolute hover:left-0 hover:bg-dark-matter hover:px-2 hover:shadow-lg hover:border hover:border-quantum-cyan/30"
                          style={{
                            backgroundColor: `hsl(${(rowIdx * 10 + idx) * 12}, 50%, 15%)`,
                            color: `hsl(${(rowIdx * 10 + idx) * 12}, 70%, 70%)`,
                          }}
                        >
                          <span className="group-hover:hidden">{checksum.substring(0, 4)}</span>
                          <span className="hidden group-hover:inline text-quantum-cyan">{checksum}</span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <p 
              className="text-[10px] text-muted-grey mt-2 text-center"
              dangerouslySetInnerHTML={{ __html: t('dicekey_results.checksums_hint') }}
            />
          </motion.div>

          {/* Actions */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
            className="flex gap-4 pt-4"
          >
            {onRetry && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onRetry}
                className="btn btn-ghost flex-1"
              >
                {t('dicekey_results.retry')}
              </motion.button>
            )}

            <motion.button
              whileHover={{ scale: isGenerating ? 1 : 1.02 }}
              whileTap={{ scale: isGenerating ? 1 : 0.98 }}
              onClick={onConfirm}
              disabled={isGenerating}
              className="btn btn-primary flex-1"
              style={{
                background: 'linear-gradient(135deg, var(--quantum-cyan), var(--magenta-trust))',
                opacity: isGenerating ? 0.5 : 1,
                cursor: isGenerating ? 'not-allowed' : 'pointer',
              }}
            >
              {isGenerating ? t('dicekey_results.generating_identity', 'Generating Identity...') : t('dicekey_results.create_account')}
            </motion.button>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

// Helper Component
function KeyStatusItem({
  label,
  type,
  status,
  delay,
}: {
  label: string;
  type: string;
  status: boolean;
  delay: number;
}) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className="flex items-center justify-between p-3 bg-dark-matter-lighter rounded-lg"
    >
      <div className="flex items-center gap-3">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: delay + 0.2, ease: [0.68, -0.55, 0.265, 1.55] }}
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{
            background: status
              ? 'linear-gradient(135deg, var(--success-glow), #059669)'
              : 'var(--dark-matter-light)',
          }}
        >
          {status ? '✓' : '⏳'}
        </motion.div>
        <div>
          <div className="text-sm font-semibold text-pure-white">{label}</div>
          <div className="text-xs text-muted-grey">{type}</div>
        </div>
      </div>

      {status && (
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: delay + 0.3 }}
          className="text-success-glow text-sm font-bold"
        >
          {t('dicekey_results.key_generated')}
        </motion.div>
      )}
    </motion.div>
  );
}
