/**
 * Conversations - Cipher Messenger
 * 
 * Interface de messagerie avec support de :
 * - Burn After Reading (messages auto-destructibles)
 * - Time Capsule / Time-Lock (messages verrouillés jusqu'à une date)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/auth';
import { type ConversationSummaryV3, type MessageV2, apiv2 } from '../services/api-v2';
import {
  isGroupConversation,
  getDirectPeer,
} from '../lib/conversations/helpers';
import { useSocketWithRefresh } from '../hooks/useSocketWithRefresh';
import { useX3DHHandshake } from '../hooks/useX3DHHandshake';
import { useSocketEvent, useConversationRoom, useTypingIndicator } from '../hooks/useSocket';
import UserSearch, { type UserSearchResult } from '../components/UserSearch';
import { GroupConversationModal } from '../components/conversations/GroupConversationModal';
import { GroupDetailsPanel } from '../components/conversations/GroupDetailsPanel';
import { ConversationList } from '../components/conversations/ConversationList';
import { ChatHeader, type ConnectionMode } from '../components/conversations/ChatHeader';
import { CallOverlay } from '../components/conversations/CallOverlay';
import { MessageList } from '../components/conversations/MessageList';
import { MessageInput } from '../components/conversations/MessageInput';
import { useConversationMessages } from '../hooks/useConversationMessages';
import { decryptReceivedMessage } from '../lib/e2ee/messagingIntegration';
import { encryptOutgoing, GroupEncryptionError } from '../lib/messaging/encryptionDispatch';
import { getEncryptionModePreference } from '../lib/e2ee/sessionManager';
import { getCachedDecryptedMessage, cacheDecryptedMessage, clearAllDecryptedCache, flushPendingWrites as flushDecryptedCacheWrites } from '../lib/e2ee/decryptedMessageCache';
import { hasUserKeys, loadUserKeys } from '../lib/e2ee/keyManager';
import { getCurrentE2EEKeyPair } from '../lib/e2ee/e2eeService';
import CosmicConstellationLogo from '../components/CosmicConstellationLogo';
import { decryptSelfEncryptingMessage, isSelfEncryptingMessage } from '../lib/e2ee/selfEncryptingMessage';
import { hasArchivedMessages } from '../lib/backup';
import ConversationRequests from '../components/ConversationRequests';
import { useP2P } from '../hooks/useP2P';
import { useConversationCall } from '../hooks/useConversationCall';
import { P2P_CONFIG, SIGNALING_SERVERS, TIMELOCK_ENABLED } from '../config';
import { encryptKeyToRound, scheduleLockAt } from '../lib/tlock';
import { debugLogger } from "../lib/debugLogger";
import { encryptAttachment, type EncryptedAttachment, type SecurityMode } from '../lib/attachment';
import { base64ToBytes } from '../shared/crypto';
import { loadPendingBurnAcks, removePendingBurnAck, upsertPendingBurnAck } from '../lib/burn/pendingBurnAcks';
import { clearKeyCache } from '../lib/encryption';
import VaultResonanceWidget from '../components/VaultResonanceWidget';
import { useVaultMetrics } from '../hooks/useVaultMetrics';
import '../styles/fluidCrypto.css';

type ViewMode = 'list' | 'chat';

export default function Conversations() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const session = useAuthStore((state) => state.session);
  const clearSession = useAuthStore((state) => state.clearSession);
  const linkedVault = session?.user?.linkedVault;
  const vaultMetrics = useVaultMetrics();

  // WebSocket connection with auto-refresh
  const { socket, connected } = useSocketWithRefresh();

  // If an acknowledge fails due to connectivity, keep a record and retry on reconnect.
  const pendingBurnAcksRef = useRef(new Map<string, { conversationId: string; revealedAt: number }>());

  const pendingAckUserId = session?.user?.id;

  // Load persisted pending acks when the session user changes (survives full app close)
  useEffect(() => {
    if (!pendingAckUserId) return;
    const persisted = loadPendingBurnAcks(pendingAckUserId);
    const next = new Map<string, { conversationId: string; revealedAt: number }>();
    for (const e of persisted) {
      next.set(e.messageId, { conversationId: e.conversationId, revealedAt: e.revealedAt });
    }
    pendingBurnAcksRef.current = next;
  }, [pendingAckUserId]);

  // Configure X3DH handshake transport over Socket.IO (required for Double Ratchet / PFS)
  useX3DHHandshake({ socket, connected });

  // Conversations state
  const [conversations, setConversations] = useState<ConversationSummaryV3[]>([]);
  // Decrypted group titles, keyed by conversation id. Populated client-side
  // from `encryptedTitle` after E2EE decryption succeeds.
  const [decryptedGroupTitles] = useState<Map<string, string>>(() => new Map());
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  // New conversation modal
  const [showNewConvModal, setShowNewConvModal] = useState(false);
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [showGroupDetailsForId, setShowGroupDetailsForId] = useState<string | null>(null);
  const [creatingConv, setCreatingConv] = useState(false);

  // Online status tracking
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  // Messages state
  const [messages, setMessages] = useState<MessageV2[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageBody, setMessageBody] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  
  // Attachment state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // Archived messages indicator (from backup import)
  const [hasArchived, setHasArchived] = useState(false);

  // Screen reader announcements
  const [srAnnouncement, setSrAnnouncement] = useState('');

  // Burn After Reading & Time-Lock
  const [burnAfterReading, setBurnAfterReading] = useState(false);
  const [burnDelay, setBurnDelay] = useState(30); // seconds
  const [timeLockEnabled, setTimeLockEnabled] = useState(false);
  const [timeLockDate, setTimeLockDate] = useState('');
  const [timeLockTime, setTimeLockTime] = useState('');

  // Burn animation state
  const [burningMessages, setBurningMessages] = useState<Set<string>>(new Set());

  // e2ee-v2 state
  const [useE2EEv2, setUseE2EEv2] = useState(false);

  // View mode (responsive)
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Bumped after sending a conversation request to force ConversationRequests to reload.
  const [requestsRefreshKey, setRequestsRefreshKey] = useState(0);

  // P2P connection mode per conversation
  const [connectionModes, setConnectionModes] = useState<Map<string, ConnectionMode>>(new Map());

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Crypto helpers
  const { decryptIncomingMessage, encryptMessage } = useConversationMessages(session);

  // P2P handler for incoming messages
  const handleP2PMessage = useCallback((conversationId: string, message: any) => {
    if (message.type === 'text' && message.payload?.text) {
      const p2pMessage: MessageV2 = {
        id: message.messageId,
        conversationId,
        senderId: message.senderId || message.from || 'p2p-peer',
        body: message.payload.text,
        createdAt: message.timestamp,
        isP2P: true,
      };
      setMessages((prev) => {
        if (prev.some((msg) => msg.id === p2pMessage.id)) return prev;
        return [...prev, p2pMessage];
      });
      setSrAnnouncement(t('conversations.p2p_message_received'));
    }
  }, [t]);

  // P2P hook initialization with multi-server failover
  const {
    sendMessage: sendP2PMessage,
    isPeerOnline,
    isInitialized: isP2PInitialized,
    connectToPeer,
    manager: p2pManager,
  } = useP2P({
    signalingUrls: SIGNALING_SERVERS,
    onMessage: handleP2PMessage,
    onServerSwitch: (oldUrl: string, newUrl: string) => {
      debugLogger.debug(`🔄 [P2P] Switched signaling server: ${oldUrl} -> ${newUrl}`);
    },
  });

  const {
    callState,
    startCall,
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
    toggleVideo,
  } = useConversationCall(
    p2pManager,
    useCallback(
      (peerId: string, conversationId: string) => {
        // Calls are direct-only in 1.2.0 — return null for groups so the
        // call manager declines the invocation rather than misroute it.
        const currentUserId = session?.user?.id ?? '';
        const conversation = conversations.find((conv) => conv.id === conversationId);
        if (!conversation || isGroupConversation(conversation)) return null;

        const peer = getDirectPeer(conversation, currentUserId);
        if (peer && peer.id === peerId) return peer.username;

        // Fallback: locate any direct conversation that has this peerId.
        for (const conv of conversations) {
          if (isGroupConversation(conv)) continue;
          const candidate = getDirectPeer(conv, currentUserId);
          if (candidate && candidate.id === peerId) return candidate.username;
        }
        return null;
      },
      [conversations, session?.user?.id]
    )
  );

  // Load conversations on mount AND when session becomes available
  // Check if user has e2ee-v2 keys
  useEffect(() => {
    if (session?.user?.id) {
      const keysExist = hasUserKeys(session.user.id);
      setUseE2EEv2(keysExist);
      if (keysExist) {
        console.log('✅ [Conversations] e2ee-v2 keys detected, will use new format for messages');
      } else {
        console.log('ℹ️ [Conversations] No e2ee-v2 keys, using e2ee-v1 fallback');
      }
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (session?.accessToken) {
      // Clear encryption key cache to regenerate with new logic
      clearKeyCache();
      // SECURITY: Sensitive log removed
      loadConversations();
    }
  }, [session?.accessToken]); // ✅ Re-run when session/token changes

  // Load messages when conversation selected (with cleanup to prevent race conditions)
  useEffect(() => {
    let cancelled = false;

    if (selectedConvId) {
      loadMessages(selectedConvId).then(() => {
        if (!cancelled) setViewMode('chat');
      });
    }

    return () => { cancelled = true; };
  }, [selectedConvId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Clear screen-reader announcement after it has been read
  useEffect(() => {
    if (!srAnnouncement) return;
    const timeout = setTimeout(() => setSrAnnouncement(''), 1500);
    return () => clearTimeout(timeout);
  }, [srAnnouncement]);

  // ============================================================================
  // WEBSOCKET HOOKS
  // ============================================================================

  // Join conversation room
  useConversationRoom(socket, selectedConvId);

  // Typing indicator
  const { setTyping } = useTypingIndicator(socket, selectedConvId);

  // Listen for new messages
  useSocketEvent(socket, 'new_message', async (data) => {
    if (!session) return;

    console.log('[tlock/recv] new_message', {
      id: data.message.id,
      senderId: data.message.senderId,
      unlockBlockHeight: data.message.unlockBlockHeight,
      bodyLen: typeof data.message.body === 'string' ? data.message.body.length : 0,
      bodyHead: typeof data.message.body === 'string' ? data.message.body.slice(0, 32) : null,
    });

    // SECURITY: Check if message is time-locked BEFORE decryption
    const isTimeLocked = data.message.unlockBlockHeight && Date.now() < data.message.unlockBlockHeight;

    // If this message is for a different conversation than the one currently open,
    // don't append it into the current message list (would mix conversations).
    if (!selectedConvId || data.conversationId !== selectedConvId) {
      const preview = isTimeLocked ? '[Time Capsule]' : '[Nouveau message]';
      setConversations(prev => {
        const exists = prev.some(c => c.id === data.conversationId);
        if (!exists) return prev;
        return prev.map(c => c.id === data.conversationId
          ? {
            ...c,
            lastMessageAt: data.message.createdAt,
            lastMessagePreview: preview,
          }
          : c
        );
      });

      // If it's a brand new conversation (e.g., request just accepted), refresh the list.
      if (!conversations.some(c => c.id === data.conversationId)) {
        void loadConversations();
      }

      if (data.message.senderId !== session.user.id) {
        setSrAnnouncement('Nouveau message reçu');
      }

      return;
    }
    
    // Don't decrypt locked messages - show placeholder instead
    let plaintext: string;
    if (isTimeLocked) {
      plaintext = '[Message verrouillé]';
    } else {
      const incomingConv = conversations.find(c => c.id === data.conversationId);
      const isGroupIncoming = !!incomingConv && isGroupConversation(incomingConv);
      const peerUsername = incomingConv && !isGroupIncoming
        ? getDirectPeer(incomingConv, session.user.id)?.username
        : undefined;

      // First, try to detect an e2ee-v2 self-encrypting envelope. This is
      // the path that works for BOTH direct (when keys are published) and
      // group messages (e2ee-v2 mandatory). Without this dispatch, group
      // realtime messages would fall through to the legacy masterKey path
      // and crash with `atob()` on the JSON envelope.
      let parsedV2: unknown = null;
      try {
        parsedV2 = JSON.parse(data.message.body);
      } catch {
        parsedV2 = null;
      }

      if (isSelfEncryptingMessage(parsedV2) && session?.user?.id) {
        // Prefer the DETERMINISTIC e2ee-v2 keypair from e2eeService —
        // that's the one whose pubkey was uploaded to users.public_key
        // and which the sender encrypted to via getPublicKeys. The
        // local random keypair from loadUserKeys is kept as a last-
        // resort fallback for backward compatibility (older messages
        // sealed to a previously-uploaded random key).
        const detKeyPair = getCurrentE2EEKeyPair();
        let decrypted: string | null = null;
        const attempts: Array<{ pub: Uint8Array; priv: Uint8Array; label: string }> = [];
        if (detKeyPair) {
          attempts.push({
            pub: detKeyPair.publicKey,
            priv: detKeyPair.privateKey,
            label: 'deterministic',
          });
        }
        try {
          const userKeys = await loadUserKeys(session.user.id);
          if (userKeys) {
            attempts.push({
              pub: userKeys.publicKey,
              priv: userKeys.privateKey,
              label: 'random-local',
            });
          }
        } catch {
          // ignore — deterministic alone is enough in normal cases
        }

        let lastErr: unknown = null;
        for (const attempt of attempts) {
          try {
            decrypted = await decryptSelfEncryptingMessage(
              parsedV2,
              session.user.id,
              attempt.pub,
              attempt.priv,
            );
            break;
          } catch (err) {
            lastErr = err;
            // Try next keypair
          }
        }

        if (decrypted !== null) {
          plaintext = decrypted;
        } else {
          console.warn('[Realtime] e2ee-v2 decrypt failed (all keypairs)', lastErr);
          plaintext = '[Erreur de déchiffrement]';
        }
      } else if (isGroupIncoming) {
        // Group message that isn't a v2 envelope — refuse to fall back
        // to v1 / legacy paths (see §4 of the 1.2.0 plan).
        plaintext = '[Message non lisible — format incompatible]';
      } else if (peerUsername) {
        try {
          const result = await decryptReceivedMessage(peerUsername, data.message.body, undefined, true);
          console.log('[tlock/recv] after E2EE decrypt', {
            textLen: result.text?.length ?? 0,
            textHead: result.text?.slice(0, 32),
          });
          if (result.text && !result.text.startsWith('[')) {
            plaintext = result.text;
          } else {
            let parsed: any = null;
            try {
              parsed = JSON.parse(data.message.body);
            } catch {
              parsed = null;
            }
            plaintext = parsed?.version === 'e2ee-v1'
              ? '[Erreur de déchiffrement]'
              : await decryptIncomingMessage(data.conversationId, data.message);
          }
        } catch {
          let parsed: any = null;
          try {
            parsed = JSON.parse(data.message.body);
          } catch {
            parsed = null;
          }
          plaintext = parsed?.version === 'e2ee-v1'
            ? '[Erreur de déchiffrement]'
            : await decryptIncomingMessage(data.conversationId, data.message);
        }
      } else {
        plaintext = await decryptIncomingMessage(data.conversationId, data.message);
      }
    }

    setMessages((prev) => {
      if (prev.some((msg) => msg.id === data.message.id)) {
        return prev;
      }
      return [
        ...prev,
        {
          ...data.message,
          body: plaintext,
          isLocked: isTimeLocked,
        },
      ];
    });

    if (data.message.senderId !== session.user.id && plaintext !== '[Erreur de déchiffrement]' && !isTimeLocked) {
      setSrAnnouncement('Nouveau message reçu');
    }
  });

  // Listen for burned messages
  useSocketEvent(socket, 'message_burned', async (data) => {
    // debugLogger.debug('🔥 Received burn event for message:', data.messageId);
    
    // ✅ FIX: Clear decrypted message cache immediately
    try {
      const { clearMessageCache } = await import('../lib/e2ee/decryptedMessageCache');
      clearMessageCache(data.messageId);
    } catch (e) {
      console.error('Failed to clear message cache:', e);
    }
    
    // Cancel any pending burn timeout for this message (sender side)
    try {
      const { cancelBurnTimeout } = await import('../lib/burn/burnService');
      cancelBurnTimeout(data.messageId);
    } catch (e) {
      // Ignore import errors
    }

    // If we had a pending acknowledge for this message, clear it.
    if (pendingAckUserId) {
      pendingBurnAcksRef.current.delete(data.messageId);
      removePendingBurnAck(pendingAckUserId, data.messageId);
    }

    // Find the message to check if it's a BurnMessage (recipient) or normal (sender)
    const message = messages.find(m => m.id === data.messageId);
    const isOwnMessage = message?.senderId === session?.user?.id;
    const isBurnMessage = message?.scheduledBurnAt && !isOwnMessage;

    /*
    debugLogger.debug('Burn event details:', {
      messageId: data.messageId,
      isOwnMessage,
      isBurnMessage,
      messageExists: !!message,
      scheduledBurnAt: message?.scheduledBurnAt
    });
    */

    // ✅ FIX: Remove message IMMEDIATELY from state on both sides
    // The server already filtered it from future loadMessages() calls
    if (isBurnMessage) {
      // BurnMessage component handles its own animation via isBurnedFromServer prop
      // Just update the message state - the component will animate and then disappear
      // debugLogger.debug('⚡ Updating BurnMessage state to burned (recipient)');
      setMessages(prev => prev.map(msg =>
        msg.id === data.messageId
          ? { ...msg, isBurned: true, burnedAt: data.burnedAt }
          : msg
      ));
      
      // Remove from state after animation completes (BurnMessage animates for ~3s)
      setTimeout(() => {
        setMessages(prev => prev.filter(msg => msg.id !== data.messageId));
      }, 3500);
    } else {
      // ✅ FIX: For sender's messages, also mark as burned and remove from UI
      // debugLogger.debug('⚡ Burning sender message');
      setBurningMessages(prev => new Set(prev).add(data.messageId));

      // Update message state after short delay, then REMOVE from messages
      setTimeout(() => {
        setMessages(prev => prev.filter(msg => msg.id !== data.messageId));
        setBurningMessages(prev => {
          const newSet = new Set(prev);
          newSet.delete(data.messageId);
          return newSet;
        });
      }, 2000); // Match animation duration
    }
  });

  // Listen for unlocked messages
  useSocketEvent(socket, 'message_unlocked', (data) => {
    setMessages(prev => prev.map(msg =>
      msg.id === data.messageId
        ? { ...msg, body: data.body, isLocked: false }
        : msg
    ));
  });

  // Listen for typing indicators
  useSocketEvent(socket, 'user_typing', (data) => {
    if (data.isTyping) {
      setTypingUsers(prev => [...new Set([...prev, data.username])]);
    } else {
      setTypingUsers(prev => prev.filter(u => u !== data.username));
    }
  });

  // Listen for user status changes (online/offline)
  useSocketEvent(socket, 'user_status_changed', (data) => {
    setOnlineUsers(prev => {
      const newSet = new Set(prev);
      if (data.online) {
        newSet.add(data.userId);
      } else {
        newSet.delete(data.userId);
      }
      return newSet;
    });
  });

  // Presence snapshot on connect so presence is symmetric even if some users were online before we connected
  useSocketEvent(socket, 'presence_snapshot', (data: { onlineUserIds?: string[] }) => {
    const ids = Array.isArray(data?.onlineUserIds) ? data.onlineUserIds : [];
    setOnlineUsers(new Set(ids));
  });

  // The server emits a presence_snapshot eagerly on connection, but on a fresh
  // login the client's useSocketEvent handlers attach only after the re-render
  // triggered by `connected` flipping to true — i.e. *after* that first emit.
  // Pull the snapshot ourselves once we know we're listening.
  useEffect(() => {
    if (!socket || !connected) return;
    socket.emit('request_presence_snapshot');
  }, [socket, connected]);

  // Realtime: when a sent contact request is accepted, refresh conversations list for requester
  useSocketEvent(socket, 'contactRequestAccepted', (_data) => {
    void loadConversations();
  });

  useSocketEvent(socket, 'message', (payload: any) => {
    if (!payload || typeof payload !== 'object') return;

    switch (payload.type) {
      case 'conversation': {
        const conversation = payload.conversation as ConversationSummaryV3 | undefined;
        if (!conversation?.id) {
          void loadConversations();
          return;
        }
        setConversations((prev) => {
          const withoutExisting = prev.filter((conv) => conv.id !== conversation.id);
          return [conversation, ...withoutExisting].sort(
            (a, b) => (b.lastMessageAt ?? b.createdAt ?? 0) - (a.lastMessageAt ?? a.createdAt ?? 0),
          );
        });
        break;
      }
      case 'conversation_request':
      case 'conversation_request_rejected':
        setRequestsRefreshKey((key) => key + 1);
        break;
      case 'conversation_request_accepted':
        setRequestsRefreshKey((key) => key + 1);
        void loadConversations();
        break;
      case 'group_member_added': {
        const conversationId = payload.conversationId as string | undefined;
        if (!conversationId) return;
        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id !== conversationId) return conv;
            const member = payload.member;
            const hasMember = member?.id && conv.members.some((m) => m.id === member.id);
            return {
              ...conv,
              members: member?.id && !hasMember ? [...conv.members, member] : conv.members,
              memberCount: Number(payload.memberCount ?? conv.memberCount),
            };
          }),
        );
        break;
      }
      case 'group_member_removed': {
        const conversationId = payload.conversationId as string | undefined;
        const removedUserId = payload.userId as string | undefined;
        if (!conversationId || !removedUserId) return;
        if (removedUserId === session?.user?.id) {
          setConversations((prev) => prev.filter((conv) => conv.id !== conversationId));
          decryptedGroupTitles.delete(conversationId);
          if (selectedConvId === conversationId) {
            setSelectedConvId(null);
            setViewMode('list');
          }
          return;
        }
        setConversations((prev) =>
          prev.map((conv) =>
            conv.id === conversationId
              ? {
                  ...conv,
                  members: conv.members.filter((member) => member.id !== removedUserId),
                  memberCount: Number(payload.memberCount ?? Math.max(0, conv.memberCount - 1)),
                }
              : conv,
          ),
        );
        break;
      }
      case 'group_title_updated': {
        const conversationId = payload.conversationId as string | undefined;
        if (!conversationId) return;
        decryptedGroupTitles.delete(conversationId);
        setConversations((prev) =>
          prev.map((conv) =>
            conv.id === conversationId
              ? { ...conv, encryptedTitle: payload.encryptedTitle ?? conv.encryptedTitle }
              : conv,
          ),
        );
        break;
      }
      case 'conversation_deleted': {
        const conversationId = payload.conversationId as string | undefined;
        if (!conversationId) return;
        setConversations((prev) => prev.filter((conv) => conv.id !== conversationId));
        decryptedGroupTitles.delete(conversationId);
        if (selectedConvId === conversationId) {
          setSelectedConvId(null);
          setViewMode('list');
        }
        break;
      }
      default:
        break;
    }
  });

  // ============================================================================
  // API CALLS
  // ============================================================================

  const loadConversations = async () => {
    try {
      setLoading(true);
      const data = await apiv2.listConversations();
      setConversations(data.conversations || []); // ✅ Ensure always an array
      setError('');
    } catch (err: any) {
      console.error('Failed to load conversations:', err);
      setError(err.message || 'Erreur lors du chargement des conversations');
      setConversations([]); // ✅ Reset to empty array on error
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      setLoadingMessages(true);
      
      // Check if this conversation has archived messages from backup import
      const hasArchivedMsgs = hasArchivedMessages(conversationId);
      setHasArchived(hasArchivedMsgs);
      
      const data = await apiv2.listMessages(conversationId);

      if (!data?.messages || data.messages.length === 0) {
        setMessages([]);
        return;
      }

      // Get peer username from conversation. For groups, this stays
      // undefined — group decryption goes through the e2ee-v2 self-
      // encrypting envelope which doesn't need a peer username at all.
      const selectedConv = conversations.find(c => c.id === conversationId);
      const peerUsername = selectedConv && !isGroupConversation(selectedConv) && session?.user?.id
        ? getDirectPeer(selectedConv, session.user.id)?.username
        : undefined;

      // SECURITY FIX: Sort messages by timestamp to ensure correct decryption order
      // The Double Ratchet protocol requires messages to be processed in order
      const sortedMessages = [...data.messages].sort((a, b) => a.createdAt - b.createdAt);
      
      // SECURITY FIX: Decrypt messages SEQUENTIALLY instead of in parallel
      // Parallel decryption causes race conditions that corrupt the ratchet state
      const decryptedMessages: MessageV2[] = [];
      
      for (const msg of sortedMessages) {
        try {
          console.log(`[LOAD] Processing message ${msg.id} from sender ${msg.senderId}`);

          // If this BAR message was already revealed on this device but the ack didn't reach the server
          // (e.g., full app close), enforce the original reveal deadline locally to avoid timer extension.
          const pending = pendingBurnAcksRef.current.get(msg.id);
          if (
            pending &&
            typeof msg.burnDelay === 'number' &&
            msg.burnDelay > 0 &&
            typeof msg.scheduledBurnAt !== 'number'
          ) {
            (msg as any).scheduledBurnAt = pending.revealedAt + msg.burnDelay * 1000;
          }
          
          // Skip decryption for locked or burned messages
          if (msg.isLocked || msg.isBurned) {
            decryptedMessages.push(msg);
            continue;
          }

          // P2P messages are already decrypted (marked with isP2P flag)
          if (msg.isP2P) {
            decryptedMessages.push(msg);
            continue;
          }

          let decryptedBody: string;

          // Determine the actual sender's username for decryption
          // CRITICAL: E2EE sessions are between (currentUser, peer) - we ALWAYS use peerUsername
          // - Messages FROM peer: encrypted with peer's sending chain, decrypt with our receiving chain
          // - Messages TO peer (our own): we cannot decrypt them (only peer can)
          //   BUT we stored plaintext locally, so check for that first
          const isOwnMessage = msg.senderId === session?.user?.id;

          // Privacy-l1: the server-side `sender_plaintext` shortcut is gone.
          // For own messages we fall through to the local cache (fast path)
          // and then to the senderCopy / e2ee-v2 sender-key path
          // (cryptographic re-read). Both are already wired below.

          // CRITICAL FIX: Check cache first to avoid re-decrypting messages
          // Double Ratchet consumes keys on each decryption - re-decrypting fails!
          const cachedPlaintext = getCachedDecryptedMessage(msg.id);
          if (cachedPlaintext !== null) {
            // debugLogger.debug(`[CACHE] Found cached plaintext for message ${msg.id}`);
            decryptedBody = cachedPlaintext;
          } else {
            // Try to parse message body to detect format
            let parsedBody: any = null;
            try {
              parsedBody = JSON.parse(msg.body);
            } catch {
              // Not JSON, plaintext message
              parsedBody = null;
            }

            // Check if it's e2ee-v2 format
            if (parsedBody && isSelfEncryptingMessage(parsedBody)) {
              console.log('🔐 [E2EE-v2] Detected e2ee-v2 message, decrypting...');
              
              try {
                // Ensure keys are loaded (might be missing on first load)
                if (!hasUserKeys(session!.user.id)) {
                   console.warn('⚠️ [E2EE-v2] No user keys found, cannot decrypt message');
                   throw new Error('User keys not found');
                }
                
                // Prefer the deterministic keypair (matches what the
                // sender encrypted to via users.public_key); fall back
                // to the local random keypair for older messages.
                const detKeyPair = getCurrentE2EEKeyPair();
                const userKeys = await loadUserKeys(session!.user.id);
                const attempts: Array<{ pub: Uint8Array; priv: Uint8Array }> = [];
                if (detKeyPair) {
                  attempts.push({ pub: detKeyPair.publicKey, priv: detKeyPair.privateKey });
                }
                if (userKeys) {
                  attempts.push({ pub: userKeys.publicKey, priv: userKeys.privateKey });
                }
                if (attempts.length === 0) {
                  throw new Error('No usable user keypair for e2ee-v2 decrypt');
                }

                let decrypted: string | null = null;
                let lastErr: unknown = null;
                for (const attempt of attempts) {
                  try {
                    decrypted = await decryptSelfEncryptingMessage(
                      parsedBody,
                      session!.user.id,
                      attempt.pub,
                      attempt.priv,
                    );
                    break;
                  } catch (err) {
                    lastErr = err;
                  }
                }
                if (decrypted === null) throw lastErr ?? new Error('e2ee-v2 decrypt failed');

                decryptedBody = decrypted;
                console.log('✅ [E2EE-v2] Decrypted successfully');
                
                // Cache the decrypted plaintext
                cacheDecryptedMessage(msg.id, conversationId, decryptedBody);
              } catch (e2eev2Error) {
                console.error('❌ [E2EE-v2] Decryption failed:', e2eev2Error);
                // Don't throw, just show error message in UI
                decryptedBody = '[Erreur de déchiffrement]';
              }
            } else if (isOwnMessage) {
            // For own messages, we stored the plaintext in cache when sending
            // BUT if cache is empty (cleared or first load), we cannot decrypt our own E2EE messages
            // Try to parse the body - if it's E2EE encrypted, show placeholder
            // debugLogger.debug(`[DECRYPT] Own message ${msg.id} not in cache, checking format`);
            try {
              const parsed = JSON.parse(msg.body);
              if (parsed.version === 'e2ee-v1') {
                // Try to decrypt sender copy if available
                if (parsed.senderCopy) {
                   // Ensure we have our OWN public key for sender copy decryption
                   // We don't need peerUsername here, we need session.user.username
                   const result = await decryptReceivedMessage(
                    session.user.username,
                    msg.body,
                    undefined,
                    true
                  );
                  if (result.text && !result.text.startsWith('[')) {
                    decryptedBody = result.text;
                    cacheDecryptedMessage(msg.id, conversationId, decryptedBody);
                  } else {
                    decryptedBody = '🔒 Message envoyé (chiffré de bout en bout)\n\nCe message a été chiffré avec la clé publique de votre destinataire. Seul le destinataire peut le déchiffrer.\n\nPour relire vos propres messages, gardez cette session ouverte ou utilisez la fonctionnalité de sauvegarde.';
                  }
                } else {
                  // This is an encrypted message we sent (legacy) - we can't decrypt our own outgoing messages
                  // The message was encrypted with peer's public key, only they can decrypt
                  console.warn(`[DECRYPT] Own message ${msg.id} is E2EE encrypted but not in cache - cannot decrypt`);
                  // Show a user-friendly placeholder
                  decryptedBody = '🔒 Message envoyé (chiffré de bout en bout)\n\nCe message a été chiffré avec la clé publique de votre destinataire. Seul le destinataire peut le déchiffrer.\n\nPour relire vos propres messages, gardez cette session ouverte ou utilisez la fonctionnalité de sauvegarde.';
                  // DON'T cache the placeholder - it would prevent future cache lookups from working
                  // If the real plaintext is cached later (e.g., via WebSocket), we want to use it
                }
              } else {
                // Legacy format or plaintext
                decryptedBody = msg.body;
                // Only cache actual plaintext, not placeholders
                cacheDecryptedMessage(msg.id, conversationId, decryptedBody);
              }
            } catch {
              // Not JSON, probably plaintext
              decryptedBody = msg.body;
              // Cache plaintext
              cacheDecryptedMessage(msg.id, conversationId, decryptedBody);
            }
            } else if (peerUsername && selectedConv && !isGroupConversation(selectedConv)) {
            // Direct messages from peer — try E2EE first, fallback to legacy.
            // Group v1 reception is forbidden (see §4 of the 1.2.0 plan):
            // a v1 envelope received in a group context is either a buggy
            // sender or an attack, never legitimate.
            try {
              const result = await decryptReceivedMessage(
                peerUsername,
                msg.body,
                undefined,
                true // returnDetails
              );
              
              // ✅ FIX: Check if E2EE decryption succeeded
              if (result.text && !result.text.startsWith('[')) {
                // Successfully decrypted with E2EE
                decryptedBody = result.text;
                (msg as any).encryptionType = result.encryptionType;
                cacheDecryptedMessage(msg.id, conversationId, decryptedBody);
              } else {
                // E2EE failed: if it's an E2EE envelope, do NOT show raw JSON by falling back.
                let parsed: any = null;
                try {
                  parsed = JSON.parse(msg.body);
                } catch {
                  parsed = null;
                }
                decryptedBody = parsed?.version === 'e2ee-v1'
                  ? '[Erreur de déchiffrement]'
                  : await decryptIncomingMessage(conversationId, msg);
                cacheDecryptedMessage(msg.id, conversationId, decryptedBody);
              }
            } catch (e2eeError) {
              // E2EE decryption threw error, fallback to legacy
              // debugLogger.debug(`[DECRYPT] E2EE error for message ${msg.id}, trying legacy:`, e2eeError);
              try {
                let parsed: any = null;
                try {
                  parsed = JSON.parse(msg.body);
                } catch {
                  parsed = null;
                }
                decryptedBody = parsed?.version === 'e2ee-v1'
                  ? '[Erreur de déchiffrement]'
                  : await decryptIncomingMessage(conversationId, msg);
                cacheDecryptedMessage(msg.id, conversationId, decryptedBody);
              } catch (legacyError) {
                // Both failed
                console.error(`[DECRYPT] Both E2EE and legacy failed for ${msg.id}`);
                decryptedBody = '[Erreur de déchiffrement]';
              }
            }
            } else {
              // No peer username, use legacy decryption directly
              try {
                decryptedBody = await decryptIncomingMessage(conversationId, msg);
                // Cache legacy decryption too
                cacheDecryptedMessage(msg.id, conversationId, decryptedBody);
              } catch (e) {
                decryptedBody = '[Erreur de déchiffrement]';
              }
            }
          }

          decryptedMessages.push({
            ...msg,
            body: decryptedBody,
            encryptionType: (msg as any).encryptionType,
          });
        } catch (decryptError) {
          console.error('❌ [DECRYPT] Failed to decrypt message:', decryptError);
          decryptedMessages.push({
            ...msg,
            body: '[Erreur de déchiffrement]',
          });
        }
      }

      setMessages(decryptedMessages);

    } catch (err: any) {
      console.error('❌ [LOAD] Erreur lors du chargement des messages:', err);
      setError(err.message || 'Erreur lors du chargement des messages');
    } finally {
      setLoadingMessages(false);
    }
  };

  const createConversation = async (selectedUser: UserSearchResult) => {
    try {
      setCreatingConv(true);
      setError('');

      // Send a conversation request instead of creating directly
      await apiv2.sendConversationRequest(selectedUser.username);

      // Force the ConversationRequests panel to reload + switch to the "sent" tab
      // so the user immediately sees their pending invitation without having to
      // navigate away and back.
      setRequestsRefreshKey((k) => k + 1);

      // Show success message
      alert(t('conversations.request_sent'));

      // Close modal
      setShowNewConvModal(false);
    } catch (err: any) {
      console.error('Failed to send conversation request:', err);
      setError(err.message || t('conversations.error_sending_request'));
    } finally {
      setCreatingConv(false);
    }
  };



  /**
   * Helper: Update connection mode for a conversation
   */
  const updateConnectionMode = useCallback((convId: string, mode: ConnectionMode) => {
    setConnectionModes(prev => {
      const next = new Map(prev);
      next.set(convId, mode);
      return next;
    });
  }, []);

  /**
   * Try to send message via P2P, returns true if successful
   * 
   * ARCHITECTURE FIX: Now uses unified E2EE (Double Ratchet) via peerUsername,
   * ensuring compatibility with server relay transport.
   */
  const trySendP2P = async (
    peerId: string,
    peerUsername: string,
    conversationId: string,
    text: string
  ): Promise<boolean> => {
    if (!P2P_CONFIG.enabled || !isP2PInitialized) {
      return false;
    }

    // Check if peer is online for P2P
    if (!isPeerOnline(peerId)) {
      debugLogger.debug('📡 [P2P] Peer not online, will use server relay');
      return false;
    }

    try {
      updateConnectionMode(conversationId, 'connecting');

      // Try to establish P2P connection if not already connected
      // ARCHITECTURE FIX: Pass peerUsername for unified E2EE
      // Let connectToPeer determine initiator role automatically (deterministic)
      await connectToPeer(peerId, peerUsername, conversationId);

      // Send via P2P with unified E2EE
      const result = await sendP2PMessage(peerId, peerUsername, conversationId, text);
      if (!result?.sent) {
        // If P2P couldn't actually deliver (e.g., missing keys), fall back to server relay.
        updateConnectionMode(conversationId, 'relayed');
        return false;
      }

      updateConnectionMode(conversationId, 'p2p');
      debugLogger.info('✅ [P2P] Message sent via P2P (unified E2EE)');
      return true;
    } catch (error) {
      console.warn('⚠️ [P2P] P2P send failed, falling back to server:', error);
      updateConnectionMode(conversationId, 'relayed');
      return false;
    }
  };

  /**
   * SECURITY FIX VUL-006: Optimistic UI with proper reconciliation
   * 
   * Uses temporary IDs for client-side messages to prevent race conditions.
   * Messages are reconciled when server confirms, preventing duplicates.
   * 
   * P2P ENHANCEMENT: Try P2P first, fallback to WebSocket/server relay
   * ATTACHMENT SUPPORT: Handle both text messages and file attachments
   */
  const sendMessage = async () => {
    if (!session?.accessToken || !selectedConvId) return;
    if (!messageBody.trim() && !selectedFile) return;

    console.log('[tlock/send] entry', {
      TIMELOCK_ENABLED,
      timeLockEnabled,
      timeLockDate,
      timeLockTime,
      burnAfterReading,
      hasFile: !!selectedFile,
    });

    // Store plaintext for local display
    const plaintextBody = messageBody;
    const attachmentFile = selectedFile;

    // Generate temporary ID for optimistic update
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Get peer info. For groups, both stay undefined — the e2ee-v2
    // dispatcher (encryptionDispatch.ts in §7) handles the N-recipient
    // path and the legacy 1:1 fields are intentionally not populated.
    const selectedConv = conversations.find(c => c.id === selectedConvId);
    const directPeer = selectedConv && !isGroupConversation(selectedConv)
      ? getDirectPeer(selectedConv, session.user.id)
      : null;
    const peerId = directPeer?.id;
    const peerUsername = directPeer?.username;

    // Optimistic add with temp ID (shows immediately)
    const optimisticBody = attachmentFile
      ? (plaintextBody.trim() ? `${plaintextBody}\n📎 ${attachmentFile.name}` : `📎 ${attachmentFile.name}`)
      : plaintextBody;

    const optimisticMessage = {
      id: tempId,
      conversationId: selectedConvId,
      senderId: session.user.id,
      body: optimisticBody,
      createdAt: Date.now(),
      isPending: true,
      hasAttachment: !!attachmentFile,
    };

    setMessages(prev => [...prev, optimisticMessage]);

    // Clear input immediately for better UX
    setMessageBody('');
    setSelectedFile(null);

    try {
      setSendingMessage(true);

      // Handle attachment encryption
      let encryptedAttachment: EncryptedAttachment | null = null;
      
      if (attachmentFile) {
        // timeLockEpoch and burnAfterReading are independent layers and must
        // be able to coexist. Previously burn "won" via an else-if and the
        // recipient silently lost the timelock (reported bug : destinataire
        // ne voyait que la couche burn). Now we set both independently.
        let securityMode: SecurityMode = 'none';
        let timeLockEpoch: number | undefined;

        if (timeLockEnabled && timeLockDate && timeLockTime) {
          const unlockDate = new Date(`${timeLockDate}T${timeLockTime}`);
          timeLockEpoch = unlockDate.getTime();
          // Keep legacy 'timeLock' mode when there is no burn, so existing
          // clients (including older builds) still detect the lock via the
          // historical securityMode check.
          securityMode = 'timeLock';
        }
        if (burnAfterReading) {
          // Burn takes precedence for the storage/lifecycle mode, but
          // timeLockEpoch above is preserved — attachmentService now gates
          // the download on timeLockEpoch independently of securityMode.
          securityMode = 'burnAfterReading';
        }

        // Encrypt attachment
        encryptedAttachment = await encryptAttachment(
          attachmentFile,
          session.user.id,
          peerId || '',
          securityMode,
          timeLockEpoch
        );

        // Include optional caption text so we can display it together with the attachment.
        const caption = plaintextBody.trim();
        if (caption) {
          encryptedAttachment = {
            ...encryptedAttachment,
            payload: {
              ...encryptedAttachment.payload,
              caption,
            },
          };
        }

        // Upload encrypted attachment data to the server (store ciphertext out-of-band)
        // Then send only a small attachment envelope inside the message.
        const { uploadId } = await apiv2.initAttachmentUpload(selectedConvId, {
          filename: attachmentFile.name,
          mime: attachmentFile.type || 'application/octet-stream',
          // Encrypted size is ~same as plaintext + 16-byte GCM tag
          size: attachmentFile.size + 16,
        });

        const total = encryptedAttachment.payload.totalChunks;
        for (let i = 0; i < total; i++) {
          const chunkBytes = base64ToBytes(encryptedAttachment.payload.encryptedChunks[i]);
          await apiv2.uploadAttachmentChunk(uploadId, i, total, chunkBytes);
        }

        const committed = await apiv2.commitAttachmentUpload(uploadId);

        // Replace inline chunks with a server reference to keep message size small.
        encryptedAttachment = {
          ...encryptedAttachment,
          id: committed.id,
          payload: {
            ...encryptedAttachment.payload,
            encryptedChunks: [],
            remoteAttachmentId: committed.id,
          },
        };
      }

      // Try P2P first if peer is online (for simple text without special options)
      // ARCHITECTURE FIX: P2P now uses unified E2EE, requires peerUsername
      // NOTE: Attachments always use server relay for now
      const canUseP2P = peerId && peerUsername && !burnAfterReading && !timeLockEnabled && !attachmentFile;
      let sentViaP2P = false;

      if (canUseP2P) {
        sentViaP2P = await trySendP2P(peerId, peerUsername, selectedConvId, plaintextBody);
      }

      // If P2P succeeded for simple message, update UI and return
      if (sentViaP2P) {
        setMessages(prev => prev.map(msg =>
          msg.id === tempId
            ? { ...msg, isPending: false, isP2P: true }
            : msg
        ));
        setSrAnnouncement(t('conversations.p2p_message_sent'));
        return;
      }

      // Fallback to server relay (also required for burn/time-lock features and attachments)
      updateConnectionMode(selectedConvId, 'relayed');

      // Time-lock (tlock/drand): when the user sets a future unlock time, wrap
      // the plaintext with tlock BEFORE the E2EE layer. The resulting AGE-format
      // ciphertext is what gets E2EE-encrypted. The recipient E2EE-decrypts to
      // recover the tlock ciphertext, and can only decrypt it once the drand
      // round signature is published. Nothing server-side gates this — the
      // guarantee is cryptographic.
      let effectiveTextBody = plaintextBody;
      let drandUnlockRound: number | undefined;
      console.log('[tlock] send path state', {
        TIMELOCK_ENABLED,
        timeLockEnabled,
        timeLockDate,
        timeLockTime,
      });
      if (TIMELOCK_ENABLED && timeLockEnabled && timeLockDate && timeLockTime) {
        try {
          const unlockAtMs = new Date(`${timeLockDate}T${timeLockTime}`).getTime();
          console.log('[tlock] target unlock timestamp', new Date(unlockAtMs).toISOString());
          if (Number.isFinite(unlockAtMs) && unlockAtMs > Date.now()) {
            const schedule = await scheduleLockAt(unlockAtMs);
            drandUnlockRound = schedule.round;
            console.log('[tlock] drand round scheduled', {
              round: schedule.round,
              estimatedUnlock: new Date(schedule.estimatedUnlockMs).toISOString(),
            });
            const bytes = new TextEncoder().encode(plaintextBody);
            effectiveTextBody = await encryptKeyToRound(bytes, schedule.round);
            console.log('[tlock] plaintext wrapped, ciphertext length', effectiveTextBody.length);
          } else {
            console.warn('[tlock] unlock time is in the past or invalid, skipping wrap');
          }
        } catch (tlockErr) {
          console.error('[tlock] failed to wrap plaintext, sending without time-lock:', tlockErr);
          drandUnlockRound = undefined;
          effectiveTextBody = plaintextBody;
        }
      }

      let encryptedBody: string;

      // ENCRYPTION: single dispatcher entry point — see lib/messaging/
      // encryptionDispatch.ts. Discriminates direct (v2 → v1 fallback)
      // vs group (v2 only, hard error). The previous "no peerUsername →
      // raw masterKey envelope" branch (RISQUE 008 in the 1.2.0 plan)
      // is GONE: every direct conversation has a peer by construction,
      // and groups never reach v1 / legacy paths.
      if (!selectedConv) {
        throw new Error('Selected conversation not found');
      }
      let messageType: import('../lib/messaging/encryptionDispatch').OutgoingMessageType;
      let bodyToEncrypt: string;
      let attachmentMetadata: { filename?: string; mimeType?: string; size?: number } | undefined;
      if (encryptedAttachment) {
        messageType = 'attachment';
        bodyToEncrypt = JSON.stringify(encryptedAttachment);
        attachmentMetadata = attachmentFile
          ? {
              filename: attachmentFile.name,
              mimeType: attachmentFile.type,
              size: attachmentFile.size,
            }
          : undefined;
      } else if (burnAfterReading) {
        messageType = 'bar';
        bodyToEncrypt = effectiveTextBody;
      } else if (timeLockEnabled) {
        messageType = 'timelock';
        bodyToEncrypt = effectiveTextBody;
      } else {
        messageType = 'standard';
        bodyToEncrypt = effectiveTextBody;
      }

      try {
        encryptedBody = await encryptOutgoing(selectedConv, bodyToEncrypt, messageType, {
          conversationId: selectedConvId,
          currentUserId: session.user.id,
          useE2EEv2,
          legacyEncrypt: async (text: string) => encryptMessage(selectedConvId, text),
          attachmentMetadata,
        });
      } catch (err) {
        if (err instanceof GroupEncryptionError) {
          // Surface a user-actionable message; never silently fall back
          // to v1 for groups (would leave most members unable to decrypt).
          console.error(`[E2EE] Group send blocked: ${err.code}`, err);
          setError(
            t('conversations.group.error_e2ee_missing_keys', {
              defaultValue: 'Cannot send: a group member has not published their E2EE keys.',
            }),
          );
          setSendingMessage(false);
          // Roll back the optimistic message
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          return;
        }
        throw err;
      }

      // Calculate options
      const options: { scheduledBurnAt?: number; unlockBlockHeight?: number; burnDelay?: number } = {};

      if (burnAfterReading) {
        // IMPORTANT: For Burn-After-Reading, store the delay (in seconds)
        // The actual scheduledBurnAt will be calculated when the recipient reads the message
        options.burnDelay = burnDelay; // Store delay in seconds
      }

      if (drandUnlockRound !== undefined) {
        // Repurposed field: server now just passes the drand round through.
        // The actual lock is enforced by tlock/drand client-side — no chain
        // check needed server-side.
        options.unlockBlockHeight = drandUnlockRound;
      }

      // Privacy-l1: senderPlaintext is no longer sent. The sender's ability
      // to re-read their own messages is provided by `senderCopy` (e2ee-v1)
      // or the sender entry in `keys` (e2ee-v2) — both already in the
      // ciphertext envelope above. `textToCache` is still kept for the
      // local memory cache below so the message displays instantly without
      // a round-trip through decryption.
      const textToCache = attachmentFile ? JSON.stringify(encryptedAttachment) : plaintextBody;

      // Send encrypted message via server
      const sentMessage = await apiv2.sendMessage(selectedConvId, encryptedBody, options);
      console.log(`[SEND] Server returned message with ID: ${sentMessage.id}`);

      // CRITICAL: Cache the plaintext for this message ID
      // This ensures we can display it on reload without re-decryption
      // For attachments, cache the attachment JSON (not the plaintext description)
      cacheDecryptedMessage(sentMessage.id, selectedConvId, textToCache);
      console.log(`[SEND] Cached message ${sentMessage.id} after sending (text length: ${textToCache.length})`);
      
      // Verify cache immediately
      const verifyCache = getCachedDecryptedMessage(sentMessage.id);
      if (verifyCache) {
        console.log(`[SEND] ✅ Verified: message ${sentMessage.id} is in cache`);
      } else {
        console.error(`[SEND] ❌ ERROR: message ${sentMessage.id} was NOT cached despite calling cacheDecryptedMessage!`);
      }

      // Schedule burn timeout for sender (5 min fallback)
      if (burnAfterReading && sentMessage.id) {
        const { scheduleBurnTimeout, setTimeoutBurnCallback } = await import('../lib/burn/burnService');
        
        // Set callback for timeout-based auto-deletion
        setTimeoutBurnCallback((messageId, _convId) => {
          setMessages(prev => prev.map(msg =>
            msg.id === messageId
              ? { ...msg, isBurned: true, burnedAt: Date.now() }
              : msg
          ));
          // Show notification
          setSrAnnouncement(t('messages.burn_timeout_triggered'));
        });
        
        // Schedule 5 minute timeout
        scheduleBurnTimeout(sentMessage.id, selectedConvId, 5 * 60 * 1000);
      }

      // Determine encryption type used for UI display
      const encMode = peerUsername ? getEncryptionModePreference(peerUsername) : 'nacl-box';
      const encryptionType = encMode === 'double-ratchet' ? 'double-ratchet-v1' : 'nacl-box-v1';

      // Reconcile: Replace temp message with confirmed message
      setMessages(prev => {
        const withoutTemp = prev.filter(msg => msg.id !== tempId);

        if (withoutTemp.some(msg => msg.id === sentMessage.id)) {
          return withoutTemp;
        }

        return [...withoutTemp, {
          ...sentMessage,
          body: attachmentFile ? JSON.stringify(encryptedAttachment) : plaintextBody,
          conversationId: selectedConvId,
          isPending: false,
          isP2P: false,
          encryptionType,
        }];
      });

      setSrAnnouncement(t('conversations.message_sent'));

      // Reset options
      setBurnAfterReading(false);
      setBurnDelay(30);
      setTimeLockEnabled(false);
      setTimeLockDate('');
      setTimeLockTime('');
    } catch (err: any) {
      console.error('Failed to send message:', err);

      setMessages(prev => prev.filter(msg => msg.id !== tempId));
      setMessageBody(plaintextBody);

      alert(err.message || t('conversations.error_sending_message'));
    } finally {
      setSendingMessage(false);
    }
  };

  const acknowledgeMessage = async (messageId: string) => {
    if (!selectedConvId) return;

    try {
      await apiv2.acknowledgeMessage(messageId, selectedConvId, Date.now());

      // Reload messages to see burn effect
      await loadMessages(selectedConvId);
    } catch (err: any) {
      console.error('Failed to acknowledge message:', err);
    }
  };

  // Handle burn message reveal - start countdown AND persist it server-side (survives reconnect)
  const handleBurnReveal = useCallback(async (messageId: string) => {
    if (!selectedConvId) return;

    const revealedAt = Date.now();

    // Persist immediately so a full app close during the request can't “pause” the burn.
    if (pendingAckUserId) {
      pendingBurnAcksRef.current.set(messageId, { conversationId: selectedConvId, revealedAt });
      upsertPendingBurnAck(pendingAckUserId, { messageId, conversationId: selectedConvId, revealedAt });
    }

    // Start server-side countdown immediately so BAR persists across reconnect.
    try {
      const resp = await apiv2.acknowledgeMessage(messageId, selectedConvId, revealedAt);

      // Ack succeeded, ensure we don't retry it.
      pendingBurnAcksRef.current.delete(messageId);
      if (pendingAckUserId) {
        removePendingBurnAck(pendingAckUserId, messageId);
      }

      if (resp?.scheduledBurnAt) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                ...m,
                scheduledBurnAt: resp.scheduledBurnAt,
              }
              : m
          )
        );
      }
    } catch (err: any) {
      console.error('Failed to acknowledge burn-after-reading message:', err);
      // Keep pending entry; it will be retried on reconnect/login.
      // Keep local countdown; if the socket burn succeeds later, server will still burn.
    }
  }, [selectedConvId, pendingAckUserId]);

  // Retry pending acknowledgements on reconnect.
  useEffect(() => {
    if (!connected) return;
    if (!pendingAckUserId) return;
    if (pendingBurnAcksRef.current.size === 0) return;

    const entries = Array.from(pendingBurnAcksRef.current.entries());
    for (const [messageId, entry] of entries) {
      apiv2
        .acknowledgeMessage(messageId, entry.conversationId, entry.revealedAt)
        .then((resp) => {
          pendingBurnAcksRef.current.delete(messageId);
          removePendingBurnAck(pendingAckUserId, messageId);

          if (resp?.scheduledBurnAt) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === messageId
                  ? {
                    ...m,
                    scheduledBurnAt: resp.scheduledBurnAt,
                  }
                  : m
              )
            );
          }
        })
        .catch(() => {
          // Keep pending; we'll retry on next reconnect.
        });
    }
  }, [connected, pendingAckUserId]);

  // Handle burn complete - send burn event via WebSocket after animation
  const handleBurnComplete = useCallback(async (messageId: string) => {
    if (!selectedConvId || !socket || !session?.user?.username) return;

    // debugLogger.debug('🔥 Burn animation complete, notifying server:', messageId);

    try {
      let signedData = '';
      
      // Try to sign the burn event (optional, server validates access anyway)
      try {
        const { signBurnEvent } = await import('../lib/burn/burnService');
        const { getSigningKeyPair } = await import('../lib/e2ee/e2eeService');
        
        const signingKeyPair = getSigningKeyPair();
        if (signingKeyPair) {
          signedData = await signBurnEvent(
            messageId,
            selectedConvId,
            session.user.username,
            signingKeyPair.privateKey
          );
        }
      } catch {
        // Signing failed, continue with unsigned event
      }

      // Send via WebSocket
      socket.emit('burn_message', {
        messageId,
        conversationId: selectedConvId,
        signedData: signedData || `UNSIGNED:${messageId}:${session.user.username}:${Date.now()}`,
      });
    } catch (error) {
      console.error('Failed to send burn_message:', error);
      // Burn reveal failed silently
    }
  }, [selectedConvId, socket, session?.user?.username]);

  const handleLogout = async () => {
    // Best-effort: flush any pending BAR acknowledges before wiping session.
    // This reduces the chance that a user can extend the burn window by logging out.
    try {
      if (pendingAckUserId && pendingBurnAcksRef.current.size > 0) {
        const entries = Array.from(pendingBurnAcksRef.current.entries());

        await Promise.race([
          Promise.allSettled(
            entries.map(([messageId, entry]) =>
              apiv2
                .acknowledgeMessage(messageId, entry.conversationId, entry.revealedAt)
                .then(() => {
                  pendingBurnAcksRef.current.delete(messageId);
                  removePendingBurnAck(pendingAckUserId, messageId);
                })
            )
          ),
          new Promise((resolve) => setTimeout(resolve, 1200)),
        ]);
      }
    } catch {
      // Ignore logout flush errors.
    }

    // Clear E2EE decrypted message cache. The sync call wipes the
    // in-memory map immediately; flushPendingWrites awaits the vault
    // removal queue so we don't get interrupted by the navigation
    // below and leave stale ciphertext entries in IndexedDB that the
    // next session would re-hydrate. Bounded to 2s — privacy-l1 logout
    // must not hang on a flaky vault.
    clearAllDecryptedCache();
    try {
      await Promise.race([
        flushDecryptedCacheWrites(),
        new Promise<void>((resolve) => setTimeout(resolve, 2000)),
      ]);
    } catch {
      // Best-effort: any leftover entries are still sealed by the
      // master key, which is cleared on the next line.
    }
    clearSession();
    window.location.href = '/';
  };

  // ============================================================================
  // HELPERS
  // ============================================================================

  const selectedConv = conversations?.find(c => c.id === selectedConvId);
  const activeCallConversation = callState.conversationId
    ? conversations.find(c => c.id === callState.conversationId)
    : null;
  // Calls are direct-only in 1.2.0; getDirectPeer returns null for groups,
  // which can't reach this UI anyway (see ChatHeader call buttons hidden).
  const activeCallPeerLabel = activeCallConversation && session?.user?.id
    ? getDirectPeer(activeCallConversation, session.user.id)?.username ?? 'Contact'
    : 'Contact';

  useEffect(() => {
    if (callState.conversationId && callState.phase === 'incoming' && callState.conversationId !== selectedConvId) {
      setSelectedConvId(callState.conversationId);
      setViewMode('chat');
    }
  }, [callState.conversationId, callState.phase, selectedConvId]);

  const handleStartAudioCall = useCallback(async () => {
    if (!selectedConv || !session?.user?.id) return;
    if (isGroupConversation(selectedConv)) return; // Group calls deferred to 1.3+
    const peer = getDirectPeer(selectedConv, session.user.id);
    if (!peer) return;
    await startCall(peer.id, peer.username, selectedConv.id, 'audio');
  }, [selectedConv, session?.user?.id, startCall]);

  const handleStartVideoCall = useCallback(async () => {
    if (!selectedConv || !session?.user?.id) return;
    if (isGroupConversation(selectedConv)) return; // Group calls deferred to 1.3+
    const peer = getDirectPeer(selectedConv, session.user.id);
    if (!peer) return;
    await startCall(peer.id, peer.username, selectedConv.id, 'video');
  }, [selectedConv, session?.user?.id, startCall]);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
  };

  const isMessageLocked = (message: MessageV2) => {
    if (!message.unlockBlockHeight) return false;
    // For now, treat blockHeight as timestamp
    return Date.now() < message.unlockBlockHeight;
  };



  // ============================================================================
  // RENDER
  // ============================================================================

  // Garde supplémentaire au cas où la route serait atteinte sans token
  if (!session?.accessToken) {
    return (
      <div className="cosmic-scene min-h-screen flex items-center justify-center relative overflow-hidden">
        <div className="cosmic-nebula" aria-hidden="true" />
        <div className="cosmic-stars" aria-hidden="true" />
        <div className="cosmic-p2p-grid" aria-hidden="true" />
        <p className="text-soft-grey">{t('auth.session_expired_message')}</p>
      </div>
    );
  }

  return (
    <div className="cosmic-scene min-h-screen flex flex-col relative overflow-hidden">
      <div className="cosmic-nebula" aria-hidden="true" />
      <div className="cosmic-stars" aria-hidden="true" />
      <div className="cosmic-p2p-grid" aria-hidden="true" />
      <div className="cosmic-volumetric" aria-hidden="true" />
      {/* Screen-reader live region */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {srAnnouncement}
      </div>

      {/* Header */}
      <header className="border-b border-[rgba(0,240,255,0.12)] p-4 bg-[rgba(6,12,26,0.88)] backdrop-blur-xl relative z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0 overflow-hidden">
            <div className="shrink-0 [&_svg]:!w-7 [&_svg]:!h-7 [&_svg]:!m-0 md:[&_svg]:!w-8 md:[&_svg]:!h-8">
              <CosmicConstellationLogo />
            </div>
            <h1 className="text-lg md:text-2xl font-black whitespace-nowrap shrink-0">
              <span className="cosmic-title-cipher">Cipher</span>
            </h1>
            <span className="text-sm text-soft-grey truncate hidden md:inline">
              @{linkedVault?.vaultName || session.user.username}
            </span>

            {/* Connection status */}
            <div className={`
              text-xs px-2 py-1 rounded-full whitespace-nowrap shrink-0
              ${connected ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}
            `}>
              {connected ? '●' : '○'} <span className="hidden sm:inline">{connected ? 'En ligne' : 'Hors ligne'}</span>
            </div>

            {/* Vault resonance orb — live data from Eidolon */}
            {linkedVault && vaultMetrics && (
              <div className="hidden md:block shrink-0">
                <VaultResonanceWidget
                  metrics={{
                    resonance: vaultMetrics.resonance,
                    entropy: vaultMetrics.entropy,
                    rosettaBonus: vaultMetrics.rosettaBonus,
                    dailyYield: vaultMetrics.dailyYield,
                  }}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/settings')}
              className="cosmic-btn-ghost p-2 md:px-4 flex items-center"
              title={t('settings.title')}
            >
              <span className="hidden md:inline ml-2">{t('settings.title')}</span>
              <span className="md:hidden">{t('settings.title')}</span>
            </button>
            <button
              onClick={handleLogout}
              className="cosmic-btn-ghost p-2 md:px-4 flex items-center text-error-glow"
              title={t('settings.security_settings.logout')}
            >
              <span className="hidden md:inline ml-2">{t('settings.security_settings.logout')}</span>
              <span className="md:hidden">{t('settings.security_settings.logout')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative z-10">
        <div className={`${viewMode === 'list' ? 'flex' : 'hidden md:flex'} flex-col w-full md:w-80 border-r border-[rgba(0,240,255,0.12)] bg-[rgba(6,12,26,0.84)] backdrop-blur-xl`}>
          {/* Conversation Requests */}
          <div className="p-4 overflow-y-auto">
            <ConversationRequests
              onRequestAccepted={loadConversations}
              onSentRequestAccepted={loadConversations}
              refreshSignal={requestsRefreshKey}
            />
          </div>

          {/* Vault resonance — mobile visible */}
          {linkedVault && vaultMetrics && (
            <div className="md:hidden px-4 pb-2">
              <VaultResonanceWidget
                metrics={{
                  resonance: vaultMetrics.resonance,
                  entropy: vaultMetrics.entropy,
                  rosettaBonus: vaultMetrics.rosettaBonus,
                  dailyYield: vaultMetrics.dailyYield,
                }}
                compact={false}
              />
            </div>
          )}

          {/* Conversation List */}
          <div className="flex-1 overflow-hidden">
            <ConversationList
              loading={loading}
              conversations={conversations}
              selectedConversationId={selectedConvId}
              onlineUsers={onlineUsers}
              currentUserId={session.user.id}
              decryptedTitles={decryptedGroupTitles}
              onSelectConversation={(id) => setSelectedConvId(id)}
              onOpenNewConversation={() => setShowNewConvModal(true)}
              onOpenNewGroup={() => setShowNewGroupModal(true)}
              formatTime={formatTime}
            />
          </div>
        </div>

        {/* Chat Area */}
        <div
          className={`
          ${viewMode === 'chat' ? 'flex' : 'hidden md:flex'}
          flex-1 flex flex-col
        `}
        >
          {selectedConv ? (
            <>
              <ChatHeader
                conversation={selectedConv}
                onlineUsers={onlineUsers}
                currentUserId={session.user.id}
                decryptedGroupTitle={decryptedGroupTitles.get(selectedConv.id) ?? null}
                onBackToList={() => setViewMode('list')}
                onOpenGroupDetails={() => setShowGroupDetailsForId(selectedConv.id)}
                connectionMode={
                  connectionModes.get(selectedConvId!) ||
                  ((!isGroupConversation(selectedConv) &&
                    onlineUsers.has(getDirectPeer(selectedConv, session.user.id)?.id ?? ''))
                    ? 'connecting'
                    : 'relayed')
                }
                callState={callState}
                onStartAudioCall={handleStartAudioCall}
                onStartVideoCall={handleStartVideoCall}
                onEndCall={() => endCall('user-ended')}
              />

              {/* Archived messages indicator */}
              {hasArchived && (
                <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30">
                  <p className="text-amber-400 text-sm flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                    </svg>
                    {t('conversations.has_archived_messages', 'This conversation has archived messages from a backup. Go to Settings > Backup to view them.')}
                  </p>
                </div>
              )}

              <MessageList
                messages={messages}
                sessionUserId={session.user.id}
                loadingMessages={loadingMessages}
                isMessageLocked={isMessageLocked}
                burningMessages={burningMessages}
                setBurningMessages={(updater) =>
                  setBurningMessages((prev) => updater(prev))
                }
                acknowledgeMessage={acknowledgeMessage}
                onBurnReveal={handleBurnReveal}
                onBurnComplete={handleBurnComplete}
                onMessageUnlock={() => {
                  // Reload messages when a time-locked message is unlocked
                  if (selectedConvId) {
                    loadMessages(selectedConvId);
                  }
                }}
                typingUsers={typingUsers}
                messagesEndRef={messagesEndRef}
                formatTime={formatTime}
              />

              <MessageInput
                messageBody={messageBody}
                onChangeMessageBody={setMessageBody}
                onSend={sendMessage}
                sendingMessage={sendingMessage}
                burnAfterReading={burnAfterReading}
                setBurnAfterReading={setBurnAfterReading}
                burnDelay={burnDelay}
                setBurnDelay={setBurnDelay}
                timeLockEnabled={timeLockEnabled}
                setTimeLockEnabled={setTimeLockEnabled}
                timeLockDate={timeLockDate}
                setTimeLockDate={setTimeLockDate}
                timeLockTime={timeLockTime}
                setTimeLockTime={setTimeLockTime}
                setTyping={setTyping}
                selectedFile={selectedFile}
                onAttachmentSelect={setSelectedFile}
                onAttachmentClear={() => setSelectedFile(null)}
              />
            </>
          ) : (
            /* No conversation selected */
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="flex flex-col items-center">
                <div className="mb-6 [&_svg]:!w-24 [&_svg]:!h-24 [&_svg]:!m-0 opacity-50">
                  <CosmicConstellationLogo />
                </div>
                <p className="text-soft-grey text-lg">
                  {t('conversations.select_conversation')}
                </p>
                <p className="text-muted-grey text-sm mt-2">
                  {t('conversations.or_create_new')}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <CallOverlay
        callState={callState}
        peerLabel={activeCallPeerLabel}
        onAccept={() => {
          void acceptCall();
        }}
        onDecline={() => declineCall('declined')}
        onEnd={() => endCall('user-ended')}
        onToggleMute={toggleMute}
        onToggleVideo={toggleVideo}
      />

      {/* New Conversation Modal - User Search */}
      <AnimatePresence>
        {showNewConvModal && (
          <UserSearch
            onSelectUser={createConversation}
            onCancel={() => setShowNewConvModal(false)}
            loading={creatingConv}
            error={error}
          />
        )}
        {showNewGroupModal && session?.user?.id && (
          <GroupConversationModal
            currentUserId={session.user.id}
            onCreated={(conv, title) => {
              setConversations((prev) =>
                prev.find((c) => c.id === conv.id) ? prev : [conv, ...prev],
              );
              if (title) decryptedGroupTitles.set(conv.id, title);
              setShowNewGroupModal(false);
              setSelectedConvId(conv.id);
              setViewMode('chat');
            }}
            onCancel={() => setShowNewGroupModal(false)}
          />
        )}
        {showGroupDetailsForId && session?.user?.id && (() => {
          const conv = conversations.find((c) => c.id === showGroupDetailsForId);
          if (!conv) return null;
          return (
            <GroupDetailsPanel
              conversation={conv}
              currentUserId={session.user.id}
              decryptedTitle={decryptedGroupTitles.get(conv.id) ?? null}
              onMemberAdded={(member, memberCount, newEncryptedTitle) => {
                setConversations((prev) =>
                  prev.map((c) =>
                    c.id === conv.id
                      ? {
                          ...c,
                          members: [...c.members, member],
                          memberCount,
                          encryptedTitle: newEncryptedTitle ?? c.encryptedTitle,
                        }
                      : c,
                  ),
                );
              }}
              onMemberRemoved={(userId, memberCount) => {
                setConversations((prev) =>
                  prev.map((c) =>
                    c.id === conv.id
                      ? {
                          ...c,
                          members: c.members.filter((m) => m.id !== userId),
                          memberCount,
                        }
                      : c,
                  ),
                );
              }}
              onConversationGone={() => {
                setConversations((prev) => prev.filter((c) => c.id !== conv.id));
                decryptedGroupTitles.delete(conv.id);
                setShowGroupDetailsForId(null);
                if (selectedConvId === conv.id) {
                  setSelectedConvId(null);
                  setViewMode('list');
                }
              }}
              onClose={() => setShowGroupDetailsForId(null)}
            />
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
