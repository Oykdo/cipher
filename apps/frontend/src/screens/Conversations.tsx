/**
 * Conversations - Cipher Pulse Messenger
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
import { type ConversationSummaryV2, type MessageV2, apiv2 } from '../services/api-v2';
import { useSocketWithRefresh } from '../hooks/useSocketWithRefresh';
import { useSocketEvent, useConversationRoom, useTypingIndicator } from '../hooks/useSocket';
import UserSearch, { type UserSearchResult } from '../components/UserSearch';
import { ConversationList } from '../components/conversations/ConversationList';
import { ChatHeader, type ConnectionMode } from '../components/conversations/ChatHeader';
import { MessageList } from '../components/conversations/MessageList';
import { MessageInput } from '../components/conversations/MessageInput';
import { useConversationMessages } from '../hooks/useConversationMessages';
import { encryptMessageForSending, decryptReceivedMessage } from '../lib/e2ee/messagingIntegration';
import { getEncryptionModePreference } from '../lib/e2ee/sessionManager';
import { getCachedDecryptedMessage, cacheDecryptedMessage, clearAllDecryptedCache } from '../lib/e2ee/decryptedMessageCache';
import { hasUserKeys, loadUserKeys } from '../lib/e2ee/keyManager';
import { getConversationParticipantKeys } from '../lib/e2ee/publicKeyService';
import { encryptSelfEncryptingMessage, decryptSelfEncryptingMessage, isSelfEncryptingMessage } from '../lib/e2ee/selfEncryptingMessage';
import { hasArchivedMessages } from '../lib/backup';
import ConversationRequests from '../components/ConversationRequests';
import { useP2P } from '../hooks/useP2P';
import { P2P_CONFIG, SIGNALING_SERVERS } from '../config';
import { debugLogger } from "../lib/debugLogger";
import { encryptAttachment, type EncryptedAttachment, type SecurityMode } from '../lib/attachment';
import { base64ToBytes } from '../shared/crypto';
import '../styles/fluidCrypto.css';

type ViewMode = 'list' | 'chat';

export default function Conversations() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const session = useAuthStore((state) => state.session);
  const clearSession = useAuthStore((state) => state.clearSession);

  // WebSocket connection with auto-refresh
  const { socket, connected } = useSocketWithRefresh();

  // Conversations state
  const [conversations, setConversations] = useState<ConversationSummaryV2[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  // New conversation modal
  const [showNewConvModal, setShowNewConvModal] = useState(false);
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
  } = useP2P({
    signalingUrls: SIGNALING_SERVERS,
    onMessage: handleP2PMessage,
    onServerSwitch: (oldUrl: string, newUrl: string) => {
      debugLogger.debug(`🔄 [P2P] Switched signaling server: ${oldUrl} -> ${newUrl}`);
    },
  });

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
      import('../lib/encryption').then(({ clearKeyCache }) => {
        clearKeyCache();
        // SECURITY: Sensitive log removed
      });
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

    // SECURITY: Check if message is time-locked BEFORE decryption
    const isTimeLocked = data.message.unlockBlockHeight && Date.now() < data.message.unlockBlockHeight;
    
    // Don't decrypt locked messages - show placeholder instead
    let plaintext: string;
    if (isTimeLocked) {
      plaintext = '[Message verrouillé]';
    } else {
      // ✅ FIX: Try E2EE decryption first, fallback to legacy
      const peerUsername = conversations.find(c => c.id === data.conversationId)?.otherParticipant?.username;
      
      if (peerUsername) {
        try {
          const result = await decryptReceivedMessage(peerUsername, data.message.body, undefined, true);
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

  // Realtime: when a sent contact request is accepted, refresh conversations list for requester
  useSocketEvent(socket, 'contactRequestAccepted', (_data) => {
    void loadConversations();
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

      // Get peer username from conversation
      const selectedConv = conversations.find(c => c.id === conversationId);
      const peerUsername = selectedConv?.otherParticipant?.username;

      // SECURITY FIX: Sort messages by timestamp to ensure correct decryption order
      // The Double Ratchet protocol requires messages to be processed in order
      const sortedMessages = [...data.messages].sort((a, b) => a.createdAt - b.createdAt);
      
      // SECURITY FIX: Decrypt messages SEQUENTIALLY instead of in parallel
      // Parallel decryption causes race conditions that corrupt the ratchet state
      const decryptedMessages: MessageV2[] = [];
      
      for (const msg of sortedMessages) {
        try {
          console.log(`[LOAD] Processing message ${msg.id} from sender ${msg.senderId}`);
          
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

          // MESSAGE_WORKFLOW.md (Problème 1): If backend returned sender_plaintext for our own message,
          // use it and skip decryption entirely.
          const backendSenderPlaintext = msg.sender_plaintext;
          if (isOwnMessage && typeof backendSenderPlaintext === 'string' && backendSenderPlaintext.length > 0) {
            decryptedBody = backendSenderPlaintext;
            cacheDecryptedMessage(msg.id, conversationId, decryptedBody);
            decryptedMessages.push({
              ...msg,
              body: decryptedBody,
            });
            continue;
          }

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
                
                const userKeys = await loadUserKeys(session!.user.id);
                if (!userKeys) throw new Error('User keys not found');
                
                const decrypted = await decryptSelfEncryptingMessage(
                  parsedBody,
                  userKeys.userId,
                  userKeys.publicKey,
                  userKeys.privateKey
                );
                
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
            } else if (peerUsername) {
            // Messages from peer - try E2EE first, fallback to legacy
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
      await connectToPeer(peerId, peerUsername, conversationId, true);

      // Send via P2P with unified E2EE
      await sendP2PMessage(peerId, peerUsername, conversationId, text);

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

    // Store plaintext for local display
    const plaintextBody = messageBody;
    const attachmentFile = selectedFile;

    // Generate temporary ID for optimistic update
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Get peer info
    const selectedConv = conversations.find(c => c.id === selectedConvId);
    const peerId = selectedConv?.otherParticipant?.id;
    const peerUsername = selectedConv?.otherParticipant?.username;

    // Optimistic add with temp ID (shows immediately)
    const optimisticMessage = {
      id: tempId,
      conversationId: selectedConvId,
      senderId: session.user.id,
      body: attachmentFile ? `📎 ${attachmentFile.name}` : plaintextBody,
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
        // Determine security mode
        let securityMode: SecurityMode = 'none';
        let timeLockEpoch: number | undefined;

        if (burnAfterReading) {
          securityMode = 'burnAfterReading';
        } else if (timeLockEnabled && timeLockDate && timeLockTime) {
          securityMode = 'timeLock';
          const unlockDate = new Date(`${timeLockDate}T${timeLockTime}`);
          timeLockEpoch = unlockDate.getTime();
        }

        // Encrypt attachment
        encryptedAttachment = await encryptAttachment(
          attachmentFile,
          session.user.id,
          peerId || '',
          securityMode,
          timeLockEpoch
        );

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

      let encryptedBody: string;

      // ENCRYPTION: Try e2ee-v2 first, fallback to e2ee-v1
      if (encryptedAttachment) {
        // For attachments, encrypt the attachment envelope
        const attachmentJson = JSON.stringify(encryptedAttachment);
        
        if (useE2EEv2 && peerUsername) {
          // Use e2ee-v2 for attachments
          console.log('🔐 [E2EE-v2] Encrypting attachment with e2ee-v2');
          try {
            const userKeys = await loadUserKeys(session.user.id);
            if (!userKeys) throw new Error('Failed to load user keys');
            
            const participantKeys = await getConversationParticipantKeys(selectedConvId);

            if (participantKeys.length < 2) {
              throw new Error('Not enough participant keys for e2ee-v2');
            }
            
            const encrypted = await encryptSelfEncryptingMessage(
              attachmentJson,
              participantKeys.map(p => ({ userId: p.userId, publicKey: p.publicKey })),
              'attachment',
              {
                filename: attachmentFile!.name,
                mimeType: attachmentFile!.type,
                size: attachmentFile!.size,
              }
            );
            
            encryptedBody = JSON.stringify(encrypted);
            console.log('✅ [E2EE-v2] Attachment encrypted successfully');
          } catch (e2eev2Error) {
            const msg = e2eev2Error instanceof Error ? e2eev2Error.message : String(e2eev2Error);
            if (msg.includes('Missing e2ee-v2 public keys') || msg.includes('Not enough participant keys')) {
              console.info('ℹ️ [E2EE-v2] Not available (participants missing keys), using e2ee-v1');
            } else {
              console.warn('⚠️ [E2EE-v2] Failed, falling back to e2ee-v1:', e2eev2Error);
            }
            // Fallback to e2ee-v1
            encryptedBody = await encryptMessageForSending(
              peerUsername,
              attachmentJson,
              async (text) => await encryptMessage(selectedConvId, text)
            );
          }
        } else if (peerUsername) {
          // e2ee-v1 fallback
          encryptedBody = await encryptMessageForSending(
            peerUsername,
            attachmentJson,
            async (text) => await encryptMessage(selectedConvId, text)
          );
        } else {
          console.warn('⚠️ [E2EE] No peer username for attachment, using legacy encryption');
          const encrypted = await encryptMessage(selectedConvId, attachmentJson);
          encryptedBody = JSON.stringify(encrypted);
        }
      } else if (useE2EEv2 && peerUsername) {
        // TEXT MESSAGE with e2ee-v2
        console.log('🔐 [E2EE-v2] Encrypting text message with e2ee-v2');
        
        try {
          // Load user's own keys
          const userKeys = await loadUserKeys(session.user.id);
          if (!userKeys) {
            throw new Error('User keys not found');
          }
          
          // Fetch participant keys (including sender!)
          const participantKeys = await getConversationParticipantKeys(selectedConvId);
          
          console.log(`📋 [E2EE-v2] Encrypting for ${participantKeys.length} participants`);

          if (participantKeys.length < 2) {
            throw new Error('Not enough participant keys for e2ee-v2');
          }
          
          // Determine message type
          let messageType: 'standard' | 'bar' | 'timelock' = 'standard';
          if (burnAfterReading) {
            messageType = 'bar';
          } else if (timeLockEnabled) {
            messageType = 'timelock';
          }
          
          // Encrypt with e2ee-v2
          const encrypted = await encryptSelfEncryptingMessage(
            plaintextBody,
            participantKeys.map(p => ({
              userId: p.userId,
              publicKey: p.publicKey,
            })),
            messageType
          );
          
          encryptedBody = JSON.stringify(encrypted);
          console.log('✅ [E2EE-v2] Message encrypted successfully');
        } catch (e2eev2Error) {
          const msg = e2eev2Error instanceof Error ? e2eev2Error.message : String(e2eev2Error);
          if (msg.includes('Missing e2ee-v2 public keys') || msg.includes('Not enough participant keys')) {
            console.info('ℹ️ [E2EE-v2] Not available (participants missing keys), using e2ee-v1');
          } else {
            console.warn('⚠️ [E2EE-v2] Encryption failed, falling back to e2ee-v1:', e2eev2Error);
          }
          
          // Fallback to e2ee-v1
          encryptedBody = await encryptMessageForSending(
            peerUsername,
            plaintextBody,
            async (text) => await encryptMessage(selectedConvId, text)
          );
        }
      } else if (peerUsername) {
        // e2ee-v1 fallback (no e2ee-v2 keys)
        console.log('🔐 [E2EE-v1] Using e2ee-v1 encryption');
        encryptedBody = await encryptMessageForSending(
          peerUsername,
          plaintextBody,
          async (text) => await encryptMessage(selectedConvId, text)
        );
      } else {
        // Legacy encryption (no username)
        console.warn('⚠️ [E2EE] No peer username, using legacy encryption');
        const encrypted = await encryptMessage(selectedConvId, plaintextBody);
        encryptedBody = JSON.stringify(encrypted);
      }

      // Calculate options
      const options: { scheduledBurnAt?: number; unlockBlockHeight?: number; burnDelay?: number; senderPlaintext?: string } = {};

      if (burnAfterReading) {
        // IMPORTANT: For Burn-After-Reading, store the delay (in seconds)
        // The actual scheduledBurnAt will be calculated when the recipient reads the message
        options.burnDelay = burnDelay; // Store delay in seconds
      }

      if (timeLockEnabled && timeLockDate && timeLockTime) {
        const unlockDate = new Date(`${timeLockDate}T${timeLockTime}`);
        options.unlockBlockHeight = unlockDate.getTime();
      }

      // MESSAGE_WORKFLOW.md (Problème 1): send a plaintext copy for the sender so they can re-read after reconnect
      const textToCache = attachmentFile ? JSON.stringify(encryptedAttachment) : plaintextBody;
      options.senderPlaintext = textToCache;

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
      await apiv2.acknowledgeMessage(messageId, selectedConvId);

      // Reload messages to see burn effect
      await loadMessages(selectedConvId);
    } catch (err: any) {
      console.error('Failed to acknowledge message:', err);
    }
  };

  // Handle burn message reveal - just start countdown, don't send to server yet
  const handleBurnReveal = useCallback(async (messageId: string) => {
    void messageId;
    // debugLogger.debug('🔓 Message revealed, starting countdown:', messageId);
    // Countdown and animation handled by BurnMessage component
    // Server notification happens in handleBurnComplete after animation
  }, []);

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

  const handleLogout = () => {
    // Clear E2EE decrypted message cache
    clearAllDecryptedCache();
    clearSession();
    window.location.href = '/';
  };

  // ============================================================================
  // HELPERS
  // ============================================================================

  const selectedConv = conversations?.find(c => c.id === selectedConvId);

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
      <div className="dark-matter-bg min-h-screen flex items-center justify-center">
        <p className="text-soft-grey">{t('auth.session_expired_message')}</p>
      </div>
    );
  }

  return (
    <div className="dark-matter-bg min-h-screen flex flex-col">
      {/* Screen-reader live region */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {srAnnouncement}
      </div>

      {/* Header */}
      <header className="glass-card border-b border-quantum-cyan/20 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
            <h1 className="text-xl md:text-2xl font-black glow-text-cyan whitespace-nowrap">
              🔐 <span className="hidden sm:inline">Cipher Pulse</span>
            </h1>
            <span className="text-sm text-soft-grey truncate hidden sm:inline">
              @{session.user.username}
            </span>

            {/* Connection status */}
            <div className={`
              text-xs px-2 py-1 rounded-full whitespace-nowrap
              ${connected ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}
            `}>
              {connected ? '●' : '○'} <span className="hidden sm:inline">{connected ? 'En ligne' : 'Hors ligne'}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/settings')}
              className="btn btn-ghost p-2 md:px-4 flex items-center"
              title={t('settings.title')}
            >
              <span className="text-lg">⚙️</span>
              <span className="hidden md:inline ml-2">{t('settings.title')}</span>
            </button>
            <button
              onClick={handleLogout}
              className="btn btn-ghost p-2 md:px-4 flex items-center text-error-glow"
              title={t('settings.security_settings.logout')}
            >
              <span className="text-lg">🚪</span>
              <span className="hidden md:inline ml-2">{t('settings.security_settings.logout')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        <div className={`${viewMode === 'list' ? 'flex' : 'hidden md:flex'} flex-col w-full md:w-80 border-r border-quantum-cyan/20 bg-dark-matter`}>
          {/* Conversation Requests */}
          <div className="p-4 overflow-y-auto">
            <ConversationRequests onRequestAccepted={loadConversations} />
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-hidden">
            <ConversationList
              loading={loading}
              conversations={conversations}
              selectedConversationId={selectedConvId}
              onlineUsers={onlineUsers}
              onSelectConversation={(id) => setSelectedConvId(id)}
              onOpenNewConversation={() => setShowNewConvModal(true)}
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
                onBackToList={() => setViewMode('list')}
                connectionMode={connectionModes.get(selectedConvId!) || (onlineUsers.has(selectedConv.otherParticipant.id) ? 'connecting' : 'relayed')}
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
            <div className="flex-1 flex items-center justify-center text-center">
              <div>
                <div className="text-6xl mb-4">💬</div>
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
      </AnimatePresence>
    </div>
  );
}
