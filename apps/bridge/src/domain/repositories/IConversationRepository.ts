/**
 * Conversation Repository Interface - Domain Layer
 */

import type { Conversation } from '../entities/Conversation';

export interface IConversationRepository {
  /**
   * Trouver une conversation par ID
   */
  findById(id: string): Promise<Conversation | null>;

  /**
   * Trouver une conversation entre deux participants
   */
  findByParticipants(userIds: [string, string]): Promise<Conversation | null>;

  /**
   * Créer une nouvelle conversation
   */
  create(conversation: Conversation): Promise<void>;

  /**
   * Mettre à jour une conversation
   */
  update(conversation: Conversation): Promise<void>;

  /**
   * Supprimer une conversation
   */
  delete(id: string): Promise<void>;

  /**
   * Lister toutes les conversations d'un utilisateur
   */
  findByUserId(userId: string): Promise<Conversation[]>;

  /**
   * Vérifier si une conversation existe
   */
  exists(id: string): Promise<boolean>;
}
