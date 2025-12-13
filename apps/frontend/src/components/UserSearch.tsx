/**
 * UserSearch Component - Enhanced Version
 * Search users to start conversation with improved UX and error handling
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { apiv2 } from '../services/api-v2';
import { debugLogger } from "../lib/debugLogger";
import '../styles/fluidCrypto.css';

export interface UserSearchResult {
  id: string;
  username: string;
  securityTier: 'standard' | 'dice-key';
  online: boolean;
  lastSeen?: number;
}

interface UserSearchProps {
  onSelectUser: (user: UserSearchResult) => void;
  onCancel: () => void;
  loading?: boolean;
  error?: string;
}

export default function UserSearch({ onSelectUser, onCancel, error: externalError }: UserSearchProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced search
  useEffect(() => {
    if (searchQuery.length < 2) {
      setResults([]);
      setError('');
      return;
    }

    const timer = setTimeout(async () => {
      await searchUsers(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const searchUsers = async (query: string) => {
    try {
      setSearching(true);
      setError('');

      debugLogger.debug('[UserSearch] Searching for:', query);

      // Use the apiv2 service instead of direct fetch
      const data = await apiv2.searchUsers(query);

      debugLogger.debug('[UserSearch] Results:', data);
      setResults(data.users || []);

      if (data.users.length === 0) {
        setError(t('conversations.no_user_found'));
      }
    } catch (err: any) {
      console.error('[UserSearch] Search error:', err);
      setError(err.message || t('conversations.search_error'));
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const getSecurityIcon = (tier: string) => {
    return tier === 'dice-key' ? '🎲' : '🔐';
  };

  const getSecurityColor = (tier: string) => {
    return tier === 'dice-key' ? 'text-magenta-trust' : 'text-quantum-cyan';
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-card p-4 md:p-8 max-w-lg w-full border-2 border-quantum-cyan/40 shadow-2xl"
      >
        {/* Header */}
        <div className="mb-6">
          <h3 className="text-2xl font-black text-pure-white mb-2 flex items-center gap-2">
            <span className="text-3xl">🔍</span>
            {t('conversations.search_user_title')}
          </h3>
          <p className="text-sm text-muted-grey">
            {t('conversations.search_user_description')}
          </p>
        </div>

        {/* Search Input */}
        <div className="mb-6">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('conversations.search_placeholder')}
              className="input w-full px-4 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
            />
          </div>
          <p className="text-xs text-muted-grey mt-2 flex items-center gap-1">
            <span>💡</span>
            {t('conversations.search_hint')}
          </p>
        </div>

        {/* Error */}
        <AnimatePresence>
          {(error || externalError) && !searching && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`mb-4 p-3 ${externalError ? 'bg-red-500/10 border-red-500/30' : 'bg-yellow-500/10 border-yellow-500/30'} border rounded-lg`}
            >
              <p className={`text-sm flex items-center gap-2 ${externalError ? 'text-red-400' : 'text-yellow-400'}`}>
                <span>{externalError ? '❌' : 'ℹ️'}</span>
                {externalError || error}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto space-y-2 mb-6">
          <AnimatePresence mode="popLayout">
            {results.length > 0 ? (
              results.map((user, index) => (
                <motion.button
                  key={user.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => onSelectUser(user)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full p-4 bg-dark-matter-lighter hover:bg-quantum-cyan/10 rounded-lg border border-quantum-cyan/20 hover:border-quantum-cyan/40 transition-all text-left shadow-lg"
                >
                  <div className="flex items-center justify-between">
                    {/* User Info */}
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className="relative">
                        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-quantum-cyan to-magenta-trust flex items-center justify-center text-xl font-bold text-white shadow-lg">
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                        {/* Online Indicator */}
                        {user.online && (
                          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-400 border-2 border-dark-matter-lighter rounded-full animate-pulse"></div>
                        )}
                      </div>

                      {/* Name & Security */}
                      <div>
                        <p className="text-white font-bold text-lg flex items-center gap-2">
                          @{user.username}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-sm font-medium flex items-center gap-1 ${getSecurityColor(user.securityTier)}`}>
                            <span>{getSecurityIcon(user.securityTier)}</span>
                            {user.securityTier === 'dice-key' ? t('auth.security_dicekey') : t('auth.security_standard')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="text-right">
                      {user.online ? (
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                          <span className="text-green-400 font-bold text-sm">{t('common.online')}</span>
                        </div>
                      ) : (
                        <span className="text-gray-500 text-sm">{t('common.offline')}</span>
                      )}
                    </div>
                  </div>
                </motion.button>
              ))
            ) : searchQuery.length >= 2 && !searching ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-12 text-muted-grey"
              >
                <p className="text-6xl mb-4">🤷</p>
                <p className="text-lg font-medium text-soft-grey">{t('conversations.no_user_found')}</p>
                <p className="text-sm mt-2">{t('conversations.try_another_name')}</p>
              </motion.div>
            ) : searchQuery.length < 2 && !searching ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-12 text-muted-grey"
              >
                <p className="text-6xl mb-4">⌨️</p>
                <p className="text-sm">{t('conversations.start_typing_to_search')}</p>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Cancel Button */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="btn btn-ghost flex-1 border border-quantum-cyan/30 hover:border-quantum-cyan/50"
          >
            <span className="mr-2">✕</span>
            {t('common.cancel')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
