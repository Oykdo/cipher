/**
 * Modale de création d'un groupe (Cipher 1.2.0).
 *
 * Le créateur est ajouté automatiquement (owner). On accepte 1 à 9 autres
 * membres pour rester dans la limite produit de 10 au total. Le titre
 * est optionnel : s'il est non vide il est chiffré côté client via
 * `encryptSelfEncryptingMessage` avec les clés publiques de TOUS les
 * membres (incl. le créateur), exactement comme un message e2ee-v2 — le
 * serveur ne voit qu'un blob opaque.
 *
 * Échec sur clé manquante : si un seul membre n'a pas publié sa clé
 * publique e2ee-v2, on refuse la création (un groupe avec un membre
 * sans clé serait illisible pour lui dès le premier message). L'erreur
 * est affichée via la clé i18n `conversations.group.error_creating_group`.
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { apiv2, type ConversationSummaryV3 } from '../../services/api-v2';
import { encryptSelfEncryptingMessage } from '../../lib/e2ee/selfEncryptingMessage';
import { getPublicKeys } from '../../lib/e2ee/publicKeyService';
import { debugLogger } from '../../lib/debugLogger';
import type { UserSearchResult } from '../UserSearch';
import { AtomLoader } from '../ui';

const GROUP_MIN_OTHER_MEMBERS = 1;
const GROUP_MAX_MEMBERS = 10;

interface GroupConversationModalProps {
  currentUserId: string;
  onCreated: (conversation: ConversationSummaryV3, decryptedTitle: string | null) => void;
  onCancel: () => void;
}

export function GroupConversationModal({
  currentUserId,
  onCreated,
  onCancel,
}: GroupConversationModalProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [selected, setSelected] = useState<UserSearchResult[]>([]);
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced search — same shape as UserSearch.
  useEffect(() => {
    if (searchQuery.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await apiv2.searchUsers(searchQuery);
        // Filter out users already selected and the creator themselves.
        const filtered = (data.users || []).filter(
          (u) => u.id !== currentUserId && !selected.find((s) => s.id === u.id),
        );
        setResults(filtered);
      } catch (err: any) {
        debugLogger.error('[GroupConversationModal] search error', err);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, currentUserId, selected]);

  const totalMembers = selected.length + 1; // +1 = owner
  const canSubmit =
    selected.length >= GROUP_MIN_OTHER_MEMBERS &&
    totalMembers <= GROUP_MAX_MEMBERS &&
    !submitting;

  function toggleSelect(user: UserSearchResult) {
    setSelected((prev) =>
      prev.find((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)
        : prev.length + 1 >= GROUP_MAX_MEMBERS
          ? prev
          : [...prev, user],
    );
    setSearchQuery('');
    setResults([]);
  }

  function removeSelected(userId: string) {
    setSelected((prev) => prev.filter((u) => u.id !== userId));
  }

  async function handleCreate() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');

    try {
      const trimmedTitle = title.trim();

      // Step 1 — encrypt the title, if any. We need the public keys of
      // every member (selected users + creator) to wrap the title with
      // exactly the same keys-map the eventual messages will use.
      let encryptedTitle: string | undefined;
      if (trimmedTitle.length > 0) {
        const allUserIds = [currentUserId, ...selected.map((u) => u.id)];
        const participantKeys = await getPublicKeys(allUserIds);

        if (participantKeys.length !== allUserIds.length) {
          const fetched = new Set(participantKeys.map((k) => k.userId));
          const missing = allUserIds.filter((id) => !fetched.has(id));
          throw new Error(
            `Missing e2ee-v2 keys for ${missing.length} member(s). They must publish their keys before joining a group.`,
          );
        }

        const envelope = await encryptSelfEncryptingMessage(
          trimmedTitle,
          participantKeys.map((p) => ({ userId: p.userId, publicKey: p.publicKey })),
          'standard',
        );
        encryptedTitle = JSON.stringify(envelope);
      }

      // Step 2 — POST /api/v2/groups. The bridge persists the opaque
      // encryptedTitle as-is and broadcasts the new conversation to
      // every member's user-room.
      const conv = await apiv2.createGroup({
        memberUsernames: selected.map((u) => u.username),
        encryptedTitle,
      });

      onCreated(conv, trimmedTitle.length > 0 ? trimmedTitle : null);
    } catch (err: any) {
      debugLogger.error('[GroupConversationModal] create failed', err);
      setError(
        err?.message ||
          t('conversations.group.error_creating_group', {
            defaultValue: 'Error creating group',
          }),
      );
    } finally {
      setSubmitting(false);
    }
  }

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
        className="glass-card p-4 md:p-6 max-w-lg w-full border-2 border-quantum-cyan/40 shadow-2xl"
      >
        <div className="mb-4">
          <h3 className="text-2xl font-black text-pure-white mb-1 flex items-center gap-2 leading-none">
            <span className="text-2xl leading-none">👥</span>
            <span className="leading-none">
              {t('conversations.group.modal_title', { defaultValue: 'New group' })}
            </span>
          </h3>
          <p className="text-xs text-muted-grey mt-2">
            {t('conversations.group.member_count', {
              count: totalMembers,
              defaultValue: `${totalMembers} / 10 members`,
            })}
          </p>
        </div>

        {/* Title input — optional, end-to-end encrypted on submit. */}
        <div className="mb-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('conversations.group.name_placeholder', {
              defaultValue: 'Group name (optional)',
            })}
            maxLength={120}
            className="input w-full focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
          />
        </div>

        {/* Selected members chips */}
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {selected.map((u) => (
              <span
                key={u.id}
                className="inline-flex items-center gap-2 px-3 py-1 bg-quantum-cyan/15 border border-quantum-cyan/40 text-quantum-cyan rounded-full text-sm"
              >
                @{u.username}
                <button
                  onClick={() => removeSelected(u.id)}
                  className="hover:text-pure-white text-quantum-cyan/70"
                  aria-label={`Remove ${u.username}`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Search input */}
        <div className="mb-4">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('conversations.search_placeholder')}
              disabled={totalMembers >= GROUP_MAX_MEMBERS}
              className="input w-full !pl-12 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 disabled:opacity-50"
            />
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-grey pointer-events-none flex items-center justify-center w-5 h-5">
              {searching ? <AtomLoader size="sm" /> : <span className="text-base leading-none">🔍</span>}
            </div>
          </div>
          {totalMembers >= GROUP_MAX_MEMBERS && (
            <p className="text-xs text-amber-400 mt-2">
              {t('conversations.group.max_members_reached', {
                defaultValue: 'Maximum of 10 members reached',
              })}
            </p>
          )}
        </div>

        {/* Search results */}
        <div className="max-h-60 overflow-y-auto space-y-2 mb-4">
          <AnimatePresence>
            {results.map((user) => (
              <motion.button
                key={user.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                onClick={() => toggleSelect(user)}
                className="w-full p-3 bg-dark-matter-lighter hover:bg-quantum-cyan/10 rounded-lg border border-quantum-cyan/20 hover:border-quantum-cyan/40 transition-all text-left flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  <span className="text-lg">
                    {user.securityTier === 'dice-key' ? '🎲' : '🔐'}
                  </span>
                  <span className="text-pure-white font-medium">@{user.username}</span>
                </span>
                <span className="text-xs text-muted-grey">
                  {user.online ? t('common.online') : t('common.offline')}
                </span>
              </motion.button>
            ))}
          </AnimatePresence>
          {searchQuery.length >= 2 && !searching && results.length === 0 && (
            <p className="text-center text-muted-grey text-sm py-4">
              {t('conversations.no_user_found')}
            </p>
          )}
          {selected.length === 0 && searchQuery.length < 2 && (
            <p className="text-center text-muted-grey text-xs py-4">
              {t('conversations.group.min_members_hint', {
                defaultValue: 'Select at least one other member',
              })}
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-sm text-red-400 flex items-center gap-2">
              <span>❌</span>
              {error}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="btn btn-ghost flex-1 border border-quantum-cyan/30 hover:border-quantum-cyan/50 disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleCreate}
            disabled={!canSubmit}
            className="btn btn-primary flex-1 disabled:opacity-40"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <AtomLoader size="sm" />
                {t('common.loading')}
              </span>
            ) : (
              t('conversations.group.create_button', { defaultValue: 'Create group' })
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
