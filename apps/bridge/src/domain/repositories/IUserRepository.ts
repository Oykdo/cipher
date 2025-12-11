/**
 * User Repository Interface - Domain Layer
 * 
 * Définit le contrat pour l'accès aux données User
 * Implémentation dans Infrastructure layer
 */

import type { User } from '../entities/User';

export interface IUserRepository {
  /**
   * Trouver un utilisateur par ID
   */
  findById(id: string): Promise<User | null>;

  /**
   * Trouver un utilisateur par username
   */
  findByUsername(username: string): Promise<User | null>;

  /**
   * Créer un nouvel utilisateur
   */
  create(user: User): Promise<void>;

  /**
   * Mettre à jour un utilisateur
   */
  update(user: User): Promise<void>;

  /**
   * Supprimer un utilisateur
   */
  delete(id: string): Promise<void>;

  /**
   * Vérifier si un username existe
   */
  existsByUsername(username: string): Promise<boolean>;

  /**
   * Rechercher des utilisateurs par username (LIKE query)
   */
  searchByUsername(query: string, limit?: number): Promise<User[]>;

  /**
   * Obtenir les statistiques utilisateurs
   */
  getStats(): Promise<{ total: number; standard: number; diceKey: number }>;
}
