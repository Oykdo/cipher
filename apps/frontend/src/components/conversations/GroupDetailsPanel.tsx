/**
 * Panneau de gestion d'un groupe (Cipher 1.2.0).
 *
 * Affiche la liste des membres avec badges owner / vous, et propose les
 * actions selon le rôle :
 *
 *   - Owner          : ajouter un membre (search + select), retirer un
 *                      membre (sauf soi-même), supprimer le groupe.
 *   - Non-owner      : quitter le groupe.
 *
 * Lors d'un add member, on RE-CHIFFRE le titre du groupe avec la
 * nouvelle keys-map qui inclut le nouveau membre, et on l'envoie au
 * bridge via le champ optionnel `newEncryptedTitle` de POST
 * /api/v2/groups/:id/members. Sans ce re-wrap le nouveau membre verrait
 * `null` à la place du titre — la sémantique e2ee-v2 ne permet pas de
 * "donner accès" rétroactivement à une keys-map antérieure.
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  apiv2,
  type ConversationSummaryV3,
  type ConversationMemberV3,
} from '../../services/api-v2';
import { encryptSelfEncryptingMessage } from '../../lib/e2ee/selfEncryptingMessage';
import { getPublicKeys } from '../../lib/e2ee/publicKeyService';
import { isConversationOwner } from '../../lib/conversations/helpers';
import { debugLogger } from '../../lib/debugLogger';
import type { UserSearchResult } from '../UserSearch';
import { AtomLoader } from '../ui';

const GROUP_MAX_MEMBERS = 10;

interface GroupDetailsPanelProps {
  conversation: ConversationSummaryV3;
  currentUserId: string;
  /** Decrypted title (used to re-wrap when an owner adds a member). */
  decryptedTitle: string | null;
  /**
   * Called after a successful add-member roundtrip so the parent can
   * reload the conversation row. Optional newEncryptedTitle is the
   * re-wrapped envelope, ready to drop into Conversation.encryptedTitle.
   */
  onMemberAdded: (
    member: ConversationMemberV3,
    memberCount: number,
    newEncryptedTitle: string | null,
  ) => void;
  onMemberRemoved: (userId: string, memberCount: number) => void;
  /** Called when the current user leaves OR the owner deletes the group. */
  onConversationGone: () => void;
  onClose: () => void;
}

export function GroupDetailsPanel({
  conversation,
  currentUserId,
  decryptedTitle,
  onMemberAdded,
  onMemberRemoved,
  onConversationGone,
  onClose,
}: GroupDetailsPanelProps) {
  const { t } = useTranslation();
  const isOwner = isConversationOwner(conversation, currentUserId);

  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [showAddSearch, setShowAddSearch] = useState(false);

  // ============================================================================
  // ADD MEMBER (owner only)
  // ============================================================================
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showAddSearch) inputRef.current?.focus();
  }, [showAddSearch]);

  useEffect(() => {
    if (!showAddSearch || searchQuery.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await apiv2.searchUsers(searchQuery);
        const memberIds = new Set(conversation.members.map((m) => m.id));
        setResults((data.users || []).filter((u) => !memberIds.has(u.id)));
      } catch (err) {
        debugLogger.error('[GroupDetailsPanel] search', err);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, showAddSearch, conversation.members]);

  async function handleAddMember(user: UserSearchResult) {
    if (working) return;
    if (conversation.memberCount >= GROUP_MAX_MEMBERS) {
      setError(
        t('conversations.group.max_members_reached', {
          defaultValue: 'Maximum of 10 members reached',
        }),
      );
      return;
    }

    setWorking(true);
    setError('');
    try {
      // Re-wrap the title (if any) with the new keys-map. Otherwise the
      // new member sees null instead of the group name on first load.
      let newEncryptedTitle: string | undefined;
      if (decryptedTitle && decryptedTitle.trim().length > 0) {
        const allUserIds = [...conversation.members.map((m) => m.id), user.id];
        const keys = await getPublicKeys(allUserIds);
        if (keys.length === allUserIds.length) {
          const envelope = await encryptSelfEncryptingMessage(
            decryptedTitle,
            keys.map((k) => ({ userId: k.userId, publicKey: k.publicKey })),
            'standard',
          );
          newEncryptedTitle = JSON.stringify(envelope);
        } else {
          // Don't block the add if a key is unavailable for the title;
          // just drop the title rewrap. The new member will see no title.
          debugLogger.warn(
            '[GroupDetailsPanel] missing keys, skipping title rewrap',
          );
        }
      }

      const result = await apiv2.addGroupMember(conversation.id, {
        username: user.username,
        newEncryptedTitle,
      });

      onMemberAdded(result.member, result.memberCount, newEncryptedTitle ?? null);
      setShowAddSearch(false);
      setSearchQuery('');
    } catch (err: any) {
      debugLogger.error('[GroupDetailsPanel] addMember failed', err);
      setError(
        err?.message ||
          t('conversations.group.error_adding_member', {
            defaultValue: 'Error adding member',
          }),
      );
    } finally {
      setWorking(false);
    }
  }

  // ============================================================================
  // REMOVE MEMBER (owner only)
  // ============================================================================
  async function handleRemoveMember(member: ConversationMemberV3) {
    if (working) return;
    const confirmed = window.confirm(
      t('conversations.group.remove_member_confirm', {
        username: member.username,
        defaultValue: `Remove ${member.username} from the group?`,
      }),
    );
    if (!confirmed) return;

    setWorking(true);
    setError('');
    try {
      await apiv2.removeGroupMember(conversation.id, member.id);
      onMemberRemoved(member.id, conversation.memberCount - 1);
    } catch (err: any) {
      debugLogger.error('[GroupDetailsPanel] removeMember failed', err);
      setError(
        err?.message ||
          t('conversations.group.error_removing_member', {
            defaultValue: 'Error removing member',
          }),
      );
    } finally {
      setWorking(false);
    }
  }

  // ============================================================================
  // LEAVE (non-owner only)
  // ============================================================================
  async function handleLeave() {
    if (working) return;
    const confirmed = window.confirm(
      t('conversations.group.leave_group_confirm', {
        defaultValue:
          'Leave this group? You will no longer receive its messages.',
      }),
    );
    if (!confirmed) return;

    setWorking(true);
    setError('');
    try {
      await apiv2.leaveGroup(conversation.id);
      onConversationGone();
    } catch (err: any) {
      debugLogger.error('[GroupDetailsPanel] leave failed', err);
      setError(
        err?.message ||
          t('conversations.group.error_leaving_group', {
            defaultValue: 'Error leaving group',
          }),
      );
    } finally {
      setWorking(false);
    }
  }

  // ============================================================================
  // DELETE (owner only)
  // ============================================================================
  async function handleDelete() {
    if (working) return;
    const confirmed = window.confirm(
      t('conversations.group.delete_group_confirm', {
        defaultValue:
          'Permanently delete this group? This action cannot be undone.',
      }),
    );
    if (!confirmed) return;

    setWorking(true);
    setError('');
    try {
      await apiv2.deleteGroup(conversation.id);
      onConversationGone();
    } catch (err: any) {
      debugLogger.error('[GroupDetailsPanel] delete failed', err);
      setError(
        err?.message ||
          t('conversations.group.error_deleting_group', {
            defaultValue: 'Error deleting group',
          }),
      );
    } finally {
      setWorking(false);
    }
  }

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-card p-4 md:p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto border-2 border-quantum-cyan/40 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-black text-pure-white flex items-center gap-2 leading-none">
            <span className="text-xl leading-none">👥</span>
            <span className="leading-none">
              {t('conversations.group.members_panel_title', {
                defaultValue: 'Group members',
              })}
            </span>
          </h3>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="text-muted-grey hover:text-pure-white"
          >
            ✕
          </button>
        </div>

        {/* Member list */}
        <ul className="space-y-2 mb-4">
          {conversation.members.map((member) => {
            const memberIsOwner = conversation.createdBy === member.id;
            const memberIsSelf = member.id === currentUserId;
            return (
              <li
                key={member.id}
                className="flex items-center justify-between p-3 bg-dark-matter-lighter rounded-lg border border-quantum-cyan/15"
              >
                <span className="flex items-center gap-2">
                  <span className="text-pure-white font-medium">
                    @{member.username}
                  </span>
                  {memberIsOwner && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-magenta-trust/20 text-magenta-trust border border-magenta-trust/40">
                      {t('conversations.group.owner_badge', {
                        defaultValue: 'Owner',
                      })}
                    </span>
                  )}
                  {memberIsSelf && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-quantum-cyan/15 text-quantum-cyan border border-quantum-cyan/40">
                      {t('conversations.group.you_badge', {
                        defaultValue: 'You',
                      })}
                    </span>
                  )}
                </span>
                {isOwner && !memberIsOwner && !memberIsSelf && (
                  <button
                    onClick={() => handleRemoveMember(member)}
                    disabled={working}
                    className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40"
                  >
                    {t('common.delete')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {/* Add member (owner) */}
        {isOwner && conversation.memberCount < GROUP_MAX_MEMBERS && (
          <div className="mb-4">
            {showAddSearch ? (
              <div className="space-y-2">
                <div className="relative">
                  <input
                    ref={inputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('conversations.search_placeholder')}
                    className="input w-full pl-12 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  />
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-grey pointer-events-none flex items-center justify-center w-5 h-5">
                    {searching ? <AtomLoader size="sm" /> : <span className="text-base leading-none">🔍</span>}
                  </div>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  <AnimatePresence>
                    {results.map((u) => (
                      <motion.button
                        key={u.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        onClick={() => handleAddMember(u)}
                        disabled={working}
                        className="w-full p-2 text-left bg-dark-matter-lighter hover:bg-quantum-cyan/10 rounded border border-quantum-cyan/20 text-pure-white text-sm disabled:opacity-50"
                      >
                        @{u.username}
                      </motion.button>
                    ))}
                  </AnimatePresence>
                </div>
                <button
                  onClick={() => {
                    setShowAddSearch(false);
                    setSearchQuery('');
                  }}
                  className="text-xs text-muted-grey hover:text-pure-white"
                >
                  {t('common.cancel')}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAddSearch(true)}
                disabled={working}
                className="btn btn-ghost w-full border border-quantum-cyan/40 text-quantum-cyan hover:bg-quantum-cyan/10 disabled:opacity-50"
              >
                <span className="mr-2">+</span>
                {t('conversations.group.add_member_button', {
                  defaultValue: 'Add a member',
                })}
              </button>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-sm text-red-400 flex items-center gap-2">
              <span>❌</span>
              {error}
            </p>
          </div>
        )}

        {/* Destructive actions */}
        <div className="border-t border-quantum-cyan/20 pt-4 space-y-2">
          {isOwner ? (
            <button
              onClick={handleDelete}
              disabled={working}
              className="btn w-full bg-red-500/15 border border-red-500/40 text-red-400 hover:bg-red-500/25 disabled:opacity-50"
            >
              <span className="mr-2">🗑️</span>
              {t('conversations.group.delete_group_button', {
                defaultValue: 'Delete group',
              })}
            </button>
          ) : (
            <button
              onClick={handleLeave}
              disabled={working}
              className="btn w-full bg-amber-500/15 border border-amber-500/40 text-amber-400 hover:bg-amber-500/25 disabled:opacity-50"
            >
              <span className="mr-2">🚪</span>
              {t('conversations.group.leave_group_button', {
                defaultValue: 'Leave group',
              })}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
