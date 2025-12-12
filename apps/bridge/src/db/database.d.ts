/**
 * Type definitions for database.js
 */

export interface DbInstance {
  // Users
  createUser(user: any): Promise<any>;
  getUserById(id: string): Promise<any | null>;
  getUserByUsername(username: string): Promise<any | null>;
  searchUsers(query: string, currentUserId?: string | null, limit?: number): Promise<Array<{ id: string; username: string }>>;
  verifyMasterKey(userId: string, masterKeyHex: string): Promise<boolean>;
  getUserDiscoverable(userId: string): Promise<boolean>;
  updateUserDiscoverable(userId: string, discoverable: boolean): Promise<void>;
  createSettingsTable(): Promise<void>;
  getUserSettings(userId: string): Promise<any>;
  getUserSettings(userId: string): Promise<any>;
  updateUserSettings(userId: string, settings: any): Promise<any>;
  updateUserAvatarHash(userId: string, hash: string): Promise<void>;
  getUserByAvatarHash(hash: string): Promise<any | null>;

  // Conversations
  createConversation(id: string, members: string[]): Promise<any>;
  getConversationById(id: string): Promise<any | null>;
  getConversationMembers(conversationId: string): Promise<string[]>;
  getUserConversations(userId: string): Promise<any[]>;
  conversationExists(id: string): Promise<boolean>;

  // Conversation Requests
  createConversationRequest(data: { id: string; from_user_id: string; to_user_id: string; message?: string }): Promise<any>;
  getConversationRequestById(id: string): Promise<any | null>;
  getPendingRequestsForUser(userId: string): Promise<any[]>;
  getSentRequestsForUser(userId: string): Promise<any[]>;
  updateRequestStatus(requestId: string, status: string, conversationId?: string | null): Promise<void>;
  checkExistingRequest(fromUserId: string, toUserId: string): Promise<any | null>;

  // Messages
  createMessage(message: any): Promise<any>;
  getMessageById(id: string): Promise<any | null>;
  getConversationMessages(conversationId: string, limit?: number): Promise<any[]>;
  getConversationMessagesPaged(conversationId: string, before: number, limit: number): Promise<any[]>;
  getLastMessage(conversationId: string): Promise<any | null>;
  burnMessage(messageId: string, burnedAt: number): Promise<void>;
  deleteMessage(messageId: string): Promise<void>;
  scheduleBurn(messageId: string, when: number): Promise<void>;
  getScheduledBurnsDue(now?: number): Promise<Array<{ id: string; conversation_id: string }>>;
  getPendingBurns(): Promise<Array<{ messageId: string; conversationId: string; scheduledBurnAt: number }>>;

  // Metadata
  getMetadata(key: string): Promise<string | null>;
  setMetadata(key: string, value: string): Promise<void>;

  // Refresh tokens
  createRefreshToken(data: any): Promise<any>;
  getRefreshTokenById(id: string): Promise<any | null>;
  getRefreshTokenByHash(hash: string): Promise<any | null>;
  updateRefreshTokenLastUsed(id: string): Promise<void>;
  revokeRefreshToken(id: string): Promise<void>;
  revokeAllUserRefreshTokens(userId: string): Promise<void>;
  cleanupExpiredRefreshTokens(): Promise<number>;

  // Attachments
  createAttachment(data: any): Promise<any>;
  getAttachmentById(id: string): Promise<any | null>;
  deleteAttachment(attachmentId: string): Promise<any>;

  // SRP
  updateUserSRP(userId: string, salt: string, verifier: string): Promise<void>;

  // Identity Keys
  saveIdentityKey(userId: string, publicKey: string, fingerprint: string): Promise<void>;
  getIdentityKeyByPublicKey(publicKey: string): Promise<any | null>;

  // Signature Keys
  saveSignatureKey(userId: string, publicKey: string, fingerprint: string): Promise<void>;

  // Signed Pre-Keys
  saveSignedPreKey(userId: string, keyId: number, publicKey: string, signature: string, timestamp: number): Promise<void>;

  // One-Time Pre-Keys
  saveOneTimePreKeys(userId: string, keys: Array<{ keyId: number; publicKey: string; privateKey?: string }>): Promise<number>;

  // Audit logs
  createAuditLog(data: any): Promise<void>;
  getAuditLogs(options?: any): Promise<any[]>;
  getAuditStats(): Promise<any>;

  // Utils
  getStats(): Promise<{ users: number; conversations: number; messages: number; auditLogs: number; schemaVersion: string | null; last24h: number; bySeverity: Record<string, number>; topActions: any[]; criticalLast24h: number }>;
  clearAll(): Promise<void>;
  backupDatabase(backupPath: string): Promise<boolean>;
  exportUserData(userId: string): Promise<any>;
  getDatabasePath(): string;
  close(): void;
  exec(sql: string): Promise<any>;

  // Public keys (e2ee-v2)
  getPublicKeysByUserIds(userIds: string[]): Promise<any[]>;
  updateUserPublicKeys(userId: string, publicKey: string, signPublicKey: string): Promise<void>;
  isConversationMember(conversationId: string, userId: string): Promise<boolean>;
  getConversationMembersWithKeys(conversationId: string): Promise<any[]>;

  // E2EE Key Bundles
  getE2eeKeyBundle(userId: string): Promise<any | null>;
  upsertE2eeKeyBundle(userId: string, keyBundle: {
    identityKey: string;
    signingKey?: string;
    fingerprint: string;
    signedPreKey: { keyId: number; publicKey: string; signature: string };
    oneTimePreKeys: string[] | Array<{ id: number; publicKey: string }>;
  }): Promise<void>;
  getE2eeKeyBundleByUsername(username: string): Promise<any | null>;
  getE2eeKeyBundleByUserId(userId: string): Promise<any | null>;
  updateOneTimePreKeys(userId: string, oneTimePreKeysJson: string): Promise<void>;
}

export type DatabaseService = DbInstance;

export function getDatabase(dbPath?: string): DbInstance;
export function closeDatabase(): void;
export function decryptMnemonic(encryptedMnemonic: string, password: string): string;

