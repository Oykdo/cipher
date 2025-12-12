import { useCallback } from 'react';
import { decryptFromConversation, encryptForConversation, type EncryptedMessage } from '../lib/encryption';
import type { MessageV2 } from '../services/api-v2';
import type { AuthSession } from '../store/auth';
import { resolveMasterKeyForSession } from '../lib/masterKeyResolver';

/**
 * Centralise le chiffrement/déchiffrement des messages de conversation.
 *
 * Objectifs :
 * - Eviter de manipuler directement masterKey dans les composants UI
 * - Mutualiser la logique de déchiffrement pour le chargement initial
 *   et pour les évènements temps réel (WebSocket new_message)
 */
export function useConversationMessages(session: AuthSession | null) {
  /**
   * Résout la clé de chiffrement à utiliser pour cette session.
   * Priorité :
   * 1. KeyVault (masterKey:<username>)
   * 2. secureKeyAccess (fallback legacy _temp_masterKey)
   */
  const resolveMasterKey = useCallback(async (): Promise<string | null> => {
    return resolveMasterKeyForSession(session);
  }, [session]);

  /**
   * Déchiffre une liste de messages pour une conversation donnée
   * (chargement initial depuis l'API REST).
   */
  const decryptMessages = useCallback(
    async (conversationId: string, messages: MessageV2[]): Promise<MessageV2[]> => {
      if (!messages || messages.length === 0) return [];

      const masterKey = await resolveMasterKey();

      return Promise.all(
        messages.map(async (msg, index) => {
          try {
            // Messages verrouillés ou déjà brûlés : pas de déchiffrement
            if (msg.isLocked || msg.isBurned) {
              return msg;
            }

            if (typeof msg.body !== 'string') {
              console.error(
                `[useConversationMessages] [DECRYPT ${index}] body n'est pas une string`,
                typeof msg.body
              );
              return { ...msg, body: '[Erreur: body invalide]' };
            }

            let encrypted: EncryptedMessage;
            try {
              encrypted = JSON.parse(msg.body);
            } catch (parseErr) {
              console.error(
                `[useConversationMessages] [DECRYPT ${index}] Impossible de parser le JSON`,
                parseErr
              );
              return { ...msg, body: '[Erreur: JSON invalide]' };
            }

            if (!masterKey) {
              console.error('[useConversationMessages] Aucune clé de chiffrement disponible pour la session');
              return { ...msg, body: '[Erreur: clé de chiffrement manquante]' };
            }

            const decrypted = await decryptFromConversation(
              encrypted,
              masterKey,
              conversationId
            );

            return {
              ...msg,
              body: decrypted,
            };
          } catch (err) {
            console.error(
              `[useConversationMessages] [DECRYPT ${index}] Échec du déchiffrement pour le message ${msg.id}`,
              err
            );
            return {
              ...msg,
              body: '[Erreur de déchiffrement]',
            };
          }
        })
      );
    },
    [resolveMasterKey]
  );

  /**
   * Déchiffre un message reçu en temps réel via WebSocket (new_message).
   * Retourne toujours une string, même en cas d'erreur.
   */
  const decryptIncomingMessage = useCallback(
    async (conversationId: string, message: MessageV2): Promise<string> => {
      try {
        if (message.isLocked || message.isBurned) {
          // On laisse le body tel quel pour les messages verrouillés/brûlés
          return typeof message.body === 'string'
            ? message.body
            : '[Message non disponible]';
        }

        const masterKey = await resolveMasterKey();

        if (typeof message.body !== 'string') {
          console.error('[useConversationMessages] body n\'est pas une string pour message', message.id);
          return '[Erreur: body invalide]';
        }

        let encrypted: EncryptedMessage | any;
        try {
          encrypted = JSON.parse(message.body);
        } catch (parseErr) {
          console.error(
            '[useConversationMessages] Impossible de parser le JSON du message temps réel',
            parseErr
          );
          return '[Erreur: JSON invalide]';
        }

        // ✅ FIX: Check if this is an E2EE message, skip legacy decryption
        if (encrypted.version === 'e2ee-v1') {
          // This is an E2EE encrypted message, it should be handled by Conversations.tsx
          // Not by this legacy hook
          console.warn('[useConversationMessages] E2EE message passed to legacy decryption, returning as-is');
          return message.body; // Return the encrypted envelope, will be decrypted by E2EE system
        }

        if (!masterKey) {
          console.error('[useConversationMessages] Aucune clé de chiffrement disponible pour la session');
          return '[Erreur: clé de chiffrement manquante]';
        }

        const decrypted = await decryptFromConversation(
          encrypted,
          masterKey,
          conversationId
        );

        return decrypted;
      } catch (err) {
        console.error(
          '[useConversationMessages] Échec du déchiffrement pour un message temps réel',
          { messageId: message.id, err }
        );
        return '[Erreur de déchiffrement]';
      }
    },
    [resolveMasterKey]
  );

  /**
   * Chiffre un message sortant avant envoi à l'API / WebSocket.
   */
  const encryptMessage = useCallback(
    async (conversationId: string, plaintext: string): Promise<EncryptedMessage> => {
      const masterKey = await resolveMasterKey();
      if (!masterKey) {
        // More helpful error message
        console.error('[useConversationMessages] No masterKey available. User may need to re-login.');
        throw new Error('Session expirée. Veuillez vous reconnecter pour envoyer des messages.');
      }

      return encryptForConversation(plaintext, masterKey, conversationId);
    },
    [resolveMasterKey]
  );

  return {
    decryptMessages,
    decryptIncomingMessage,
    encryptMessage,
  };
}
