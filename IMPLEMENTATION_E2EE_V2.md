# Implémentation Cipher Pulse 2.0 - Architecture Zéro-Connaissance

## Vue d'ensemble

Ce document détaille l'implémentation du nouveau format de message **e2ee-v2** ("Self-Encrypting Message") qui résout les faiblesses de l'architecture actuelle tout en maintenant une posture zéro-connaissance stricte.

---

## Problèmes Résolus

### ❌ Avant (e2ee-v1)
- ✗ L'expéditeur ne peut pas relire ses messages après vidage du cache
- ✗ Option 1 : Cache localStorage → perdu au changement d'appareil
- ✗ Option 2 : `sender_plaintext` en BDD → violation du zéro-connaissance
- ✗ Chiffrement asymétrique pur → seul le destinataire peut déchiffrer

### ✅ Après (e2ee-v2)
- ✓ L'expéditeur peut TOUJOURS relire ses messages
- ✓ Multi-appareil natif (la clé wrappée est stockée dans le message)
- ✓ Zéro-connaissance absolu (serveur ne voit QUE des données opaques)
- ✓ Chiffrement hybride : symétrique (AES-256-GCM) + asymétrique (Curve25519)

---

## Architecture

### Principe : "Self-Encrypting Message"

1. **Une clé symétrique unique** chiffre le message (AES-256-GCM)
2. **Cette clé est wrappée** pour CHAQUE participant (y compris l'expéditeur)
3. **Le serveur stocke** l'objet complet sans pouvoir le déchiffrer
4. **Chaque participant** peut déchiffrer avec sa propre clé privée

```
Message Plaintext
       ↓
   [Generate messageKey]
       ↓
   AES-256-GCM Encrypt → Ciphertext
       ↓
   Wrap messageKey for:
   - Alice (sender)    → Encrypted Key A
   - Bob (recipient)   → Encrypted Key B
   - Charlie (group)   → Encrypted Key C
       ↓
   Package {
     ciphertext,
     keys: { alice: KeyA, bob: KeyB, charlie: KeyC }
   }
       ↓
   Send to Server (opaque blob)
```

---

## Format e2ee-v2

### Structure JSON

```typescript
{
  "version": "e2ee-v2",
  "type": "standard" | "bar" | "timelock" | "attachment",
  "iv": "base64...",           // 12 bytes (96 bits) for AES-GCM
  "ciphertext": "base64...",   // Encrypted message body
  "authTag": "base64...",      // 16 bytes (128 bits) GCM authentication tag
  "keys": {
    "alice-user-id": "base64...",  // Wrapped key for Alice
    "bob-user-id": "base64..."     // Wrapped key for Bob
  },
  "metadata": {               // OPTIONAL - NOT encrypted
    "filename": "photo.jpg",
    "mimeType": "image/jpeg",
    "size": 123456
  }
}
```

### Sécurité

- **Ciphertext** : Protégé par AES-256-GCM (authenticated encryption)
- **Keys** : Protégées par Curve25519 sealed boxes (crypto_box_seal)
- **IV** : Unique et aléatoire pour chaque message (jamais réutilisé)
- **AuthTag** : Garantit l'intégrité et l'authenticité
- **Metadata** : Optionnel, NON chiffré (uniquement données non-sensibles)

---

## Implémentation Frontend

### Étape 1 : Créer le service de gestion des clés

**Fichier** : `apps/frontend/src/lib/e2ee/keyManager.ts`

```typescript
/**
 * Gestionnaire de clés utilisateur
 * Stocke les clés de manière sécurisée dans localStorage/IndexedDB
 */

import _sodium from 'libsodium-wrappers';

interface UserKeyPair {
  publicKey: Uint8Array;   // Curve25519
  privateKey: Uint8Array;  // Curve25519
  userId: string;
}

export async function generateUserKeys(userId: string): Promise<UserKeyPair> {
  await _sodium.ready;
  
  const keyPair = _sodium.crypto_box_keypair();
  
  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    userId,
  };
}

export async function storeUserKeys(keys: UserKeyPair): Promise<void> {
  // CRITICAL: Store private key securely
  // Production: Use Web Crypto API + IndexedDB
  // Dev: Use localStorage with encryption
  
  const encryptedPrivateKey = await encryptPrivateKey(keys.privateKey);
  
  localStorage.setItem('user_public_key', _sodium.to_base64(keys.publicKey));
  localStorage.setItem('user_private_key_encrypted', encryptedPrivateKey);
  localStorage.setItem('user_id', keys.userId);
}

export async function loadUserKeys(): Promise<UserKeyPair | null> {
  const publicKeyB64 = localStorage.getItem('user_public_key');
  const privateKeyEnc = localStorage.getItem('user_private_key_encrypted');
  const userId = localStorage.getItem('user_id');
  
  if (!publicKeyB64 || !privateKeyEnc || !userId) {
    return null;
  }
  
  const privateKey = await decryptPrivateKey(privateKeyEnc);
  
  return {
    publicKey: _sodium.from_base64(publicKeyB64),
    privateKey,
    userId,
  };
}
```

### Étape 2 : Service de récupération des clés publiques

**Fichier** : `apps/frontend/src/lib/e2ee/publicKeyService.ts`

```typescript
/**
 * Service pour récupérer les clés publiques des participants
 */

import { apiv2 } from '../../services/api-v2';

interface PublicKeyInfo {
  userId: string;
  publicKey: Uint8Array;
  username: string;
}

// Cache en mémoire des clés publiques
const publicKeyCache = new Map<string, PublicKeyInfo>();

export async function getPublicKeys(userIds: string[]): Promise<PublicKeyInfo[]> {
  const results: PublicKeyInfo[] = [];
  const toFetch: string[] = [];
  
  // Check cache first
  for (const userId of userIds) {
    const cached = publicKeyCache.get(userId);
    if (cached) {
      results.push(cached);
    } else {
      toFetch.push(userId);
    }
  }
  
  // Fetch missing keys from server
  if (toFetch.length > 0) {
    const fetched = await apiv2.getPublicKeys(toFetch);
    
    for (const keyInfo of fetched) {
      publicKeyCache.set(keyInfo.userId, keyInfo);
      results.push(keyInfo);
    }
  }
  
  return results;
}

export async function getConversationParticipantKeys(
  conversationId: string
): Promise<PublicKeyInfo[]> {
  // Get all participants for this conversation
  const participants = await apiv2.getConversationMembers(conversationId);
  return getPublicKeys(participants.map(p => p.userId));
}
```

### Étape 3 : Intégration dans le workflow d'envoi

**Fichier** : `apps/frontend/src/screens/Conversations.tsx`

```typescript
import { encryptSelfEncryptingMessage } from '../lib/e2ee/selfEncryptingMessage';
import { loadUserKeys } from '../lib/e2ee/keyManager';
import { getConversationParticipantKeys } from '../lib/e2ee/publicKeyService';

const sendMessage = async () => {
  try {
    // 1. Get current user's keys
    const userKeys = await loadUserKeys();
    if (!userKeys) {
      throw new Error('User keys not found - please re-login');
    }
    
    // 2. Get all participant public keys (including self!)
    const participantKeys = await getConversationParticipantKeys(selectedConvId);
    
    // Ensure sender is included
    if (!participantKeys.some(p => p.userId === userKeys.userId)) {
      participantKeys.push({
        userId: userKeys.userId,
        publicKey: userKeys.publicKey,
        username: session.user.username,
      });
    }
    
    // 3. Encrypt with e2ee-v2
    const encryptedMessage = await encryptSelfEncryptingMessage(
      plaintextBody,
      participantKeys.map(p => ({
        userId: p.userId,
        publicKey: p.publicKey,
      })),
      'standard',  // or 'bar', 'timelock', 'attachment'
      undefined    // metadata
    );
    
    // 4. Serialize to JSON
    const encryptedBody = JSON.stringify(encryptedMessage);
    
    // 5. Send to server (opaque blob)
    const sentMessage = await apiv2.sendMessage(
      selectedConvId,
      encryptedBody,
      options
    );
    
    // 6. NO NEED TO CACHE - message contains wrapped key for sender!
    // The sender can decrypt it like any other participant
    
    console.log('✅ Message sent with e2ee-v2 format');
  } catch (error) {
    console.error('❌ Failed to send message:', error);
  }
};
```

### Étape 4 : Intégration dans le workflow de réception

```typescript
import { decryptSelfEncryptingMessage, isSelfEncryptingMessage } from '../lib/e2ee/selfEncryptingMessage';

const loadMessages = async (conversationId: string) => {
  // ... load messages from API ...
  
  for (const msg of sortedMessages) {
    try {
      // Get user keys
      const userKeys = await loadUserKeys();
      if (!userKeys) {
        throw new Error('User keys not found');
      }
      
      // Parse message body
      const parsed = JSON.parse(msg.body);
      
      let decryptedBody: string;
      
      if (isSelfEncryptingMessage(parsed)) {
        // ✅ New e2ee-v2 format
        decryptedBody = await decryptSelfEncryptingMessage(
          parsed,
          userKeys.userId,
          userKeys.publicKey,
          userKeys.privateKey
        );
        
        console.log('✅ Decrypted e2ee-v2 message');
      } else if (parsed.version === 'e2ee-v1') {
        // ⚠️ Legacy format - fallback to old decryption
        decryptedBody = await decryptLegacyMessage(parsed);
        
        console.warn('⚠️ Using legacy e2ee-v1 decryption');
      } else {
        throw new Error(`Unknown message version: ${parsed.version}`);
      }
      
      decryptedMessages.push({
        ...msg,
        body: decryptedBody,
      });
    } catch (error) {
      console.error('❌ Failed to decrypt message:', error);
      decryptedMessages.push({
        ...msg,
        body: '[Decryption failed]',
      });
    }
  }
};
```

---

## Implémentation Backend

### Principe : Backend Agnostique (Opaque Blob)

Le backend ne doit **JAMAIS** :
- ❌ Parser le contenu de `body`
- ❌ Valider la structure interne
- ❌ Logger le contenu des messages
- ❌ Tenter de déchiffrer quoi que ce soit

Le backend doit **SEULEMENT** :
- ✅ Stocker `body` tel quel (JSONB ou TEXT)
- ✅ Router les messages aux participants
- ✅ Gérer les métadonnées non-sensibles (timestamps, IDs)

### Modifications Backend

**Fichier** : `apps/bridge/src/routes/messages.ts`

```typescript
// ✅ AUCUNE modification nécessaire !
// Le backend traite déjà body comme une string opaque

fastify.post('/api/v2/messages', async (request, reply) => {
  const { conversationId, body, ...options } = request.body;
  
  // Validation: body must be a string (no parsing!)
  if (typeof body !== 'string') {
    reply.code(400);
    return { error: 'body must be a string' };
  }
  
  // Validation: max size (prevent abuse)
  if (body.length > 100000) {  // 100 KB
    reply.code(413);
    return { error: 'Message too large' };
  }
  
  // Store as-is
  const dbMessage = await db.createMessage({
    id: messageId,
    conversation_id: conversationId,
    sender_id: userId,
    body,  // ← Opaque blob (e2ee-v2 JSON)
    ...options,
  });
  
  // Return as-is
  return {
    id: dbMessage.id,
    conversationId: dbMessage.conversation_id,
    senderId: dbMessage.sender_id,
    body: dbMessage.body,  // ← Client will decrypt
    createdAt: dbMessage.created_at,
  };
});
```

**Base de données** : Aucun changement nécessaire ! La colonne `body TEXT` stocke déjà le JSON tel quel.

---

## Migration des Messages Existants

### Option 1 : Coexistence (Recommandé)

- Les anciens messages (e2ee-v1) restent déchiffrables avec le système legacy
- Les nouveaux messages (e2ee-v2) utilisent le nouveau système
- Détecter la version lors du déchiffrement

```typescript
const parsed = JSON.parse(msg.body);

if (parsed.version === 'e2ee-v2') {
  // New format
  return decryptSelfEncryptingMessage(...);
} else if (parsed.version === 'e2ee-v1') {
  // Legacy format
  return decryptLegacyMessage(...);
} else {
  throw new Error('Unknown version');
}
```

### Option 2 : Migration Active (Optionnel)

```typescript
// Script de migration
async function migrateMessageToV2(messageId: string) {
  const msg = await db.getMessageById(messageId);
  
  // 1. Decrypt with legacy method (needs cache or sender action)
  const plaintext = getCachedDecryptedMessage(messageId);
  if (!plaintext) {
    console.warn(`Cannot migrate ${messageId}: plaintext not available`);
    return;
  }
  
  // 2. Re-encrypt with e2ee-v2
  const participants = await getConversationParticipants(msg.conversation_id);
  const encryptedV2 = await encryptSelfEncryptingMessage(plaintext, participants);
  
  // 3. Update database
  await db.updateMessage(messageId, {
    body: JSON.stringify(encryptedV2),
  });
  
  console.log(`✅ Migrated message ${messageId} to e2ee-v2`);
}
```

---

## Nouvelle API Backend Requise

### Endpoint : Get Public Keys

**Route** : `GET /api/v2/users/public-keys`

```typescript
fastify.post('/api/v2/users/public-keys', {
  preHandler: fastify.authenticate,
}, async (request, reply) => {
  const { userIds } = request.body as { userIds: string[] };
  
  if (!Array.isArray(userIds) || userIds.length === 0) {
    reply.code(400);
    return { error: 'userIds must be a non-empty array' };
  }
  
  const publicKeys = await db.getPublicKeys(userIds);
  
  return {
    keys: publicKeys.map(k => ({
      userId: k.user_id,
      publicKey: k.public_key,  // Base64 encoded
      username: k.username,
    })),
  };
});
```

**Base de données** : Ajouter colonne `public_key` à la table `users`

```sql
ALTER TABLE users ADD COLUMN public_key TEXT;
CREATE INDEX idx_users_public_key ON users(public_key) WHERE public_key IS NOT NULL;
```

### Endpoint : Get Conversation Members

**Route** : `GET /api/v2/conversations/:id/members`

```typescript
fastify.get('/api/v2/conversations/:id/members', {
  preHandler: fastify.authenticate,
}, async (request, reply) => {
  const conversationId = (request.params as { id: string }).id;
  const userId = (request.user as any).sub;
  
  // Verify user is member
  const members = await db.getConversationMembers(conversationId);
  if (!members.includes(userId)) {
    reply.code(403);
    return { error: 'Not a member of this conversation' };
  }
  
  // Get member details with public keys
  const memberDetails = await db.getUsersById(members);
  
  return {
    members: memberDetails.map(m => ({
      userId: m.id,
      username: m.username,
      publicKey: m.public_key,
    })),
  };
});
```

---

## Sauvegarde et Restauration des Clés

### Export Secure Backup

```typescript
import argon2 from 'argon2-browser';

async function exportSecureBackup(password: string): Promise<string> {
  // 1. Get user keys
  const userKeys = await loadUserKeys();
  if (!userKeys) {
    throw new Error('No keys to export');
  }
  
  // 2. Serialize keys
  const keyBundle = {
    version: 'key-backup-v1',
    userId: userKeys.userId,
    publicKey: _sodium.to_base64(userKeys.publicKey),
    privateKey: _sodium.to_base64(userKeys.privateKey),
    exportedAt: Date.now(),
  };
  
  const bundleJson = JSON.stringify(keyBundle);
  
  // 3. Derive encryption key from password
  const salt = _sodium.randombytes_buf(16);
  const key = await argon2.hash({
    pass: password,
    salt: salt,
    type: argon2.ArgonType.Argon2id,
    hashLen: 32,
    time: 3,      // iterations
    mem: 65536,   // 64 MB
    parallelism: 4,
  });
  
  // 4. Encrypt key bundle
  const iv = _sodium.randombytes_buf(12);
  const encrypted = _sodium.crypto_aead_chacha20poly1305_ietf_encrypt(
    bundleJson,
    null,
    null,
    iv,
    key.hash
  );
  
  // 5. Package backup
  const backup = {
    version: 'cipher-pulse-backup-v1',
    salt: _sodium.to_base64(salt),
    iv: _sodium.to_base64(iv),
    encrypted: _sodium.to_base64(encrypted),
  };
  
  return JSON.stringify(backup);
}

async function importSecureBackup(backupJson: string, password: string): Promise<void> {
  // 1. Parse backup
  const backup = JSON.parse(backupJson);
  
  if (backup.version !== 'cipher-pulse-backup-v1') {
    throw new Error('Unsupported backup version');
  }
  
  // 2. Derive key from password
  const salt = _sodium.from_base64(backup.salt);
  const key = await argon2.hash({
    pass: password,
    salt: salt,
    type: argon2.ArgonType.Argon2id,
    hashLen: 32,
    time: 3,
    mem: 65536,
    parallelism: 4,
  });
  
  // 3. Decrypt key bundle
  const iv = _sodium.from_base64(backup.iv);
  const encrypted = _sodium.from_base64(backup.encrypted);
  
  const decrypted = _sodium.crypto_aead_chacha20poly1305_ietf_decrypt(
    null,
    encrypted,
    null,
    iv,
    key.hash
  );
  
  // 4. Parse and restore keys
  const keyBundle = JSON.parse(new TextDecoder().decode(decrypted));
  
  await storeUserKeys({
    userId: keyBundle.userId,
    publicKey: _sodium.from_base64(keyBundle.publicKey),
    privateKey: _sodium.from_base64(keyBundle.privateKey),
  });
  
  console.log('✅ Keys restored successfully');
}
```

---

## Plan d'Implémentation

### Phase 1 : Infrastructure (1-2 semaines)
- [x] Créer `selfEncryptingMessage.ts`
- [ ] Créer `keyManager.ts`
- [ ] Créer `publicKeyService.ts`
- [ ] Ajouter colonne `public_key` à table `users`
- [ ] Créer endpoints `/users/public-keys` et `/conversations/:id/members`

### Phase 2 : Intégration Frontend (2-3 semaines)
- [ ] Générer clés utilisateur au premier login
- [ ] Intégrer e2ee-v2 dans workflow d'envoi
- [ ] Intégrer e2ee-v2 dans workflow de réception
- [ ] Supporter coexistence e2ee-v1 / e2ee-v2
- [ ] Tests unitaires et d'intégration

### Phase 3 : Sauvegarde/Restauration (1 semaine)
- [ ] UI pour export/import des clés
- [ ] Validation et tests du système de backup
- [ ] Documentation utilisateur

### Phase 4 : Migration et Déploiement (1 semaine)
- [ ] Migration progressive (nouveaux messages uniquement)
- [ ] Monitoring et logs (sans contenu sensible)
- [ ] Rollout progressif (feature flag)

---

## Tests et Validation

### Tests Unitaires

```typescript
describe('SelfEncryptingMessage', () => {
  it('should encrypt and decrypt for single participant', async () => {
    const plaintext = 'Secret message';
    const alice = await generateUserKeys('alice');
    
    const encrypted = await encryptSelfEncryptingMessage(
      plaintext,
      [{ userId: 'alice', publicKey: alice.publicKey }],
      'standard'
    );
    
    const decrypted = await decryptSelfEncryptingMessage(
      encrypted,
      'alice',
      alice.publicKey,
      alice.privateKey
    );
    
    expect(decrypted).toBe(plaintext);
  });
  
  it('should encrypt for multiple participants', async () => {
    const plaintext = 'Group message';
    const alice = await generateUserKeys('alice');
    const bob = await generateUserKeys('bob');
    
    const encrypted = await encryptSelfEncryptingMessage(
      plaintext,
      [
        { userId: 'alice', publicKey: alice.publicKey },
        { userId: 'bob', publicKey: bob.publicKey },
      ],
      'standard'
    );
    
    // Both can decrypt
    const decryptedAlice = await decryptSelfEncryptingMessage(
      encrypted,
      'alice',
      alice.publicKey,
      alice.privateKey
    );
    
    const decryptedBob = await decryptSelfEncryptingMessage(
      encrypted,
      'bob',
      bob.publicKey,
      bob.privateKey
    );
    
    expect(decryptedAlice).toBe(plaintext);
    expect(decryptedBob).toBe(plaintext);
  });
});
```

---

## Sécurité et Conformité

### Audit Points

- ✅ **Zéro-Connaissance** : Le serveur ne voit QUE des blobs opaques
- ✅ **Perfect Forward Secrecy** : Chaque message a une clé unique
- ✅ **Authenticated Encryption** : GCM protège contre les modifications
- ✅ **Key Wrapping** : Sealed boxes garantissent que seul le destinataire peut déchiffrer
- ✅ **Memory Safety** : Utilisation de `memzero()` pour effacer les clés sensibles

### GDPR / Privacy

- ✅ Le serveur ne peut pas lire les messages (zéro-connaissance)
- ✅ L'utilisateur contrôle ses clés (export/import)
- ✅ Droit à l'oubli : Suppression des clés = messages illisibles
- ✅ Portabilité : Backup chiffré exportable

---

## Conclusion

L'implémentation de **e2ee-v2** transforme Cipher Pulse en un système véritablement zéro-connaissance, résolvant tous les problèmes architecturaux identifiés tout en maintenant une UX fluide. L'expéditeur peut relire ses messages, le système est multi-appareil, et le serveur reste complètement aveugle au contenu.

---

**Prochaine étape** : Commencer par Phase 1 - Infrastructure (keyManager + publicKeyService + endpoints backend).
