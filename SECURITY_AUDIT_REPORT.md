# 🔐 RAPPORT D'AUDIT DE SÉCURITÉ - MODULE CONVERSATION
## Application: Dead Drop / Cipher Pulse Messenger
### Date: 2025-12-04 | Version: 1.0 | Classification: CONFIDENTIEL

---

## 📊 SYNTHÈSE EXÉCUTIVE

### Note de Risque Global: **ÉLEVÉ** ⚠️

L'analyse approfondie du module de conversation révèle une architecture généralement bien conçue avec plusieurs bonnes pratiques de sécurité, mais plusieurs vulnérabilités critiques et problèmes de conception nécessitent une attention immédiate.

### Points Forts Identifiés ✅
- Chiffrement E2E AES-256-GCM avec dérivation PBKDF2 (100,000 itérations)
- Authentification JWT avec vérification côté serveur
- Rate limiting implémenté sur les routes sensibles
- Validation des entrées avec Zod
- Hashage Argon2id pour les masterKeys
- Authentification Socket.IO lors du handshake

### Vulnérabilités Critiques Identifiées 🚨
1. **Contrôle d'accès insuffisant sur les WebSockets** - Risque d'accès non autorisé aux rooms
2. **Stockage de clés sensibles en sessionStorage** - Extraction possible par XSS
3. **Race conditions potentielles** - Envois de messages simultanés
4. **Validation de conversationId regex trop permissive**

### Top 3 Recommandations Prioritaires
1. **URGENT**: Ajouter validation d'appartenance avant `join_conversation` dans Socket.IO
2. **URGENT**: Migrer le stockage de `_temp_masterKey` de sessionStorage vers IndexedDB avec clés non-extractables
3. **ÉLEVÉ**: Implémenter une validation server-side complète pour tous les événements WebSocket

---

## 📋 INVENTAIRE DES VULNÉRABILITÉS

### VUL-001: Contrôle d'Accès Insuffisant sur WebSocket Room Join
| Attribut | Valeur |
|----------|--------|
| **ID** | VUL-001 |
| **Sévérité** | **CRITIQUE** (CVSS 8.5) |
| **Localisation** | `apps/bridge/src/websocket/socketServer.ts: Lignes 150-168` |
| **OWASP** | A01:2021 - Broken Access Control |

**Description Technique:**
Lors du `join_conversation`, le serveur ne vérifie pas que l'utilisateur authentifié est bien membre de la conversation avant de l'ajouter à la room Socket.IO. Un attaquant authentifié peut rejoindre n'importe quelle room de conversation en connaissant ou devinant l'ID de conversation.

**Scénario d'Attaque:**
```javascript
// Attaquant authentifié avec son propre token
socket.emit('join_conversation', { conversationId: 'uuid-of-victim-conversation' });
// L'attaquant reçoit maintenant tous les messages de cette conversation
```

**Code Vulnérable:**
```typescript
socket.on('join_conversation', (payload: JoinRoomPayload) => {
  const { conversationId } = payload;
  const roomName = `conversation:${conversationId}`;
  socket.join(roomName);  // ❌ PAS DE VÉRIFICATION D'APPARTENANCE
  // ...
});
```

**Recommandation de Remédiation:**
```typescript
socket.on('join_conversation', async (payload: JoinRoomPayload) => {
  const { conversationId } = payload;
  
  // ✅ Vérifier que l'utilisateur est membre de la conversation
  const members = await db.getConversationMembers(conversationId);
  if (!members.includes(socket.userId)) {
    socket.emit('error', { message: 'Access denied to conversation' });
    return;
  }
  
  const roomName = `conversation:${conversationId}`;
  socket.join(roomName);
  // ...
});
```

---

### VUL-002: Stockage de MasterKey en SessionStorage
| Attribut | Valeur |
|----------|--------|
| **ID** | VUL-002 |
| **Sévérité** | **ÉLEVÉ** (CVSS 7.5) |
| **Localisation** | `apps/frontend/src/lib/secureKeyAccess.ts: Lignes 31-37, 56-58` |
| **OWASP** | A02:2021 - Cryptographic Failures |

**Description Technique:**
La clé maître (`masterKeyHex`) est stockée en clair dans `sessionStorage` sous la clé `_temp_masterKey`. Cette pratique expose la clé à toute attaque XSS réussie, permettant le déchiffrement de tous les messages.

**Code Vulnérable:**
```typescript
// Stockage en clair - VULNÉRABLE
sessionStorage.setItem('_temp_masterKey', masterKeyHex);

// Récupération
const legacyKey = sessionStorage.getItem('_temp_masterKey');
```

**Recommandation de Remédiation:**
```typescript
// Utiliser exclusivement IndexedDB avec CryptoKey non-extractable
export async function storeMasterKeySecurely(masterKeyHex: string): Promise<void> {
  const keyBytes = hexToBytes(masterKeyHex);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    false,  // ✅ Non-extractable
    ['encrypt', 'decrypt']
  );
  
  // Stocker dans IndexedDB (pas sessionStorage)
  await storeInIndexedDB('masterKey', cryptoKey);
  
  // Effacer la mémoire
  keyBytes.fill(0);
}
```

---

### VUL-003: Absence de Validation des Événements WebSocket Post-Connexion
| Attribut | Valeur |
|----------|--------|
| **ID** | VUL-003 |
| **Sévérité** | **ÉLEVÉ** (CVSS 7.0) |
| **Localisation** | `apps/bridge/src/websocket/socketServer.ts: Lignes 198-208` |
| **OWASP** | A01:2021 - Broken Access Control |

**Description Technique:**
L'événement `typing` ne vérifie pas que l'utilisateur est membre de la conversation cible. Un attaquant peut envoyer des indicateurs de frappe à n'importe quelle conversation.

**Code Vulnérable:**
```typescript
socket.on('typing', (payload: TypingPayload) => {
  const { conversationId, isTyping } = payload;
  const roomName = `conversation:${conversationId}`;
  // ❌ Pas de vérification d'appartenance
  socket.to(roomName).emit('user_typing', {
    userId: socket.userId,
    username: socket.username,
    isTyping,
  });
});
```

**Recommandation:**
Implémenter une fonction de validation centralisée pour tous les événements WebSocket.

---

### VUL-004: Validation de ConversationId Trop Permissive
| Attribut | Valeur |
|----------|--------|
| **ID** | VUL-004 |
| **Sévérité** | **MOYENNE** (CVSS 5.5) |
| **Localisation** | `apps/bridge/src/routes/messages.ts: Ligne 129` |
| **OWASP** | A03:2021 - Injection |

**Description Technique:**
La regex `/^[a-f0-9-]{36}:[a-f0-9-]{36}$/` est utilisée pour valider les conversationIds, mais le format attendu (UUID:UUID) est documenté. Cette validation n'empêche pas les tentatives de manipulation.

**Code Actuel:**
```typescript
if (!/^[a-f0-9-]{36}:[a-f0-9-]{36}$/.test(conversationId)) {
  reply.code(400);
  return { error: 'Format conversationId invalide' };
}
```

**Recommandation:**
Utiliser une validation UUID stricte avec un schéma Zod:
```typescript
const ConversationIdSchema = z.string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
```

---

### VUL-005: Divulgation d'Informations dans les Logs
| Attribut | Valeur |
|----------|--------|
| **ID** | VUL-005 |
| **Sévérité** | **MOYENNE** (CVSS 5.0) |
| **Localisation** | `apps/bridge/src/routes/messages.ts: Ligne 88` |
| **OWASP** | A09:2021 - Security Logging and Monitoring Failures |

**Description Technique:**
Les logs contiennent des parties du corps des messages (`firstMessageBody: messages[0]?.body?.substring(0, 80)`), ce qui peut exposer des données sensibles dans les systèmes de logging.

**Code Vulnérable:**
```typescript
fastify.log.info({
  conversationId: id,
  messagesReturned: messages.length,
  firstMessageBody: messages[0]?.body?.substring(0, 80),  // ❌ Potentiellement sensible
}, '[MESSAGES] Returning messages to client');
```

**Recommandation:**
Supprimer les contenus de messages des logs en production:
```typescript
fastify.log.info({
  conversationId: id,
  messagesReturned: messages.length,
  // ✅ Ne pas logger le contenu des messages
}, '[MESSAGES] Returning messages to client');
```

---

### VUL-006: Race Condition sur l'Envoi de Messages
| Attribut | Valeur |
|----------|--------|
| **ID** | VUL-006 |
| **Sévérité** | **MOYENNE** (CVSS 4.5) |
| **Localisation** | `apps/frontend/src/screens/Conversations.tsx: Lignes 301-381` |
| **OWASP** | A04:2021 - Insecure Design |

**Description Technique:**
L'envoi de messages n'utilise pas de mécanisme de verrouillage. Des envois simultanés peuvent créer des incohérences d'état, notamment avec les messages ajoutés localement avant confirmation serveur.

**Code Concerné:**
```typescript
const sendMessage = async () => {
  // ...
  setMessages(prev => {
    if (prev.some(msg => msg.id === sentMessage.id)) {
      return prev;  // ⚠️ Vérification côté client uniquement
    }
    return [...prev, { ...sentMessage, body: plaintextBody }];
  });
};
```

**Recommandation:**
Implémenter un système d'ID temporaires et de réconciliation:
```typescript
const tempId = `temp-${Date.now()}-${Math.random()}`;
// Ajouter immédiatement avec ID temporaire
setMessages(prev => [...prev, { ...tempMessage, id: tempId, isPending: true }]);

// Après réponse serveur, remplacer par le vrai message
setMessages(prev => prev.map(msg => 
  msg.id === tempId ? { ...sentMessage, isPending: false } : msg
));
```

---

### VUL-007: Tokens Persistés dans Zustand/LocalStorage
| Attribut | Valeur |
|----------|--------|
| **ID** | VUL-007 |
| **Sévérité** | **MOYENNE** (CVSS 4.0) |
| **Localisation** | `apps/frontend/src/store/auth.ts: Lignes 38-45` |
| **OWASP** | A07:2021 - Identification and Authentication Failures |

**Description Technique:**
Malgré le commentaire de sécurité, la session complète (incluant accessToken et refreshToken) est persistée via Zustand/localStorage.

**Code Concerné:**
```typescript
{
  name: 'cipher-pulse-auth',
  // SECURITY: do not persist access/refresh tokens or masterKey to localStorage
  // ⚠️ Mais la partialize inclut session entière
  partialize: (state) => ({
    session: state.session,  // ❌ Inclut les tokens
  }),
}
```

**Recommandation:**
```typescript
partialize: (state) => ({
  session: state.session ? {
    user: state.session.user,
    // ✅ Exclure les tokens sensibles
  } : null,
}),
```

---

### VUL-008: Absence de Nettoyage des Event Listeners WebSocket
| Attribut | Valeur |
|----------|--------|
| **ID** | VUL-008 |
| **Sévérité** | **FAIBLE** (CVSS 3.0) |
| **Localisation** | `apps/frontend/src/hooks/useSocket.ts` |
| **OWASP** | A04:2021 - Insecure Design |

**Description Technique:**
Le hook `useSocketEvent` nettoie correctement les listeners, mais le hook `useSocket` principal ne nettoie pas tous les handlers lors du démontage, potentiellement causant des fuites de mémoire.

**Code Concerné:**
```typescript
useEffect(() => {
  // Handlers ajoutés mais pas tous nettoyés
  socket.on('connect', () => { ... });
  socket.on('disconnect', () => { ... });
  // ...
  
  return () => {
    disconnect();  // Ferme le socket mais ne retire pas explicitement les handlers
  };
}, [token, autoConnect]);
```

---

### VUL-009: Fallback de Dérivation de Clé Faible
| Attribut | Valeur |
|----------|--------|
| **ID** | VUL-009 |
| **Sévérité** | **MOYENNE** (CVSS 5.5) |
| **Localisation** | `apps/frontend/src/lib/encryption.ts: Lignes 157-162` |
| **OWASP** | A02:2021 - Cryptographic Failures |

**Description Technique:**
Le fallback de dérivation de clé utilise le `conversationId` comme unique source d'entropie, ce qui est prévisible et permet une attaque par force brute.

**Code Vulnérable:**
```typescript
if (!masterKey || masterKey.length < 16) {
  // ❌ Fallback trop faible
  console.warn('[Encryption] Using fallback key derivation (no masterKey)');
  return deriveEncryptionKey(conversationId, conversationId);
}
```

**Recommandation:**
Supprimer ce fallback et exiger toujours une masterKey valide:
```typescript
if (!masterKey || masterKey.length < 16) {
  throw new Error('MasterKey required for encryption');
}
```

---

### VUL-010: Pas de Vérification CSRF sur les Routes d'État
| Attribut | Valeur |
|----------|--------|
| **ID** | VUL-010 |
| **Sévérité** | **FAIBLE** (CVSS 3.5) |
| **Localisation** | Routes POST générales |
| **OWASP** | A05:2021 - Security Misconfiguration |

**Description Technique:**
Bien que les tokens JWT soient utilisés, il n'y a pas de protection CSRF explicite (double-submit cookie ou token CSRF synchronisé).

**Recommandation:**
Implémenter un middleware CSRF ou utiliser l'attribut `SameSite=Strict` sur les cookies de session.

---

## 🔍 ANALYSE DE LA LOGIQUE MÉTIER

### Gestion de l'État des Conversations

#### Points Positifs
- L'état des conversations est géré côté client avec Zustand
- Les messages sont chiffrés E2E avant stockage côté serveur
- La pagination des messages est implémentée correctement

#### Faiblesses Identifiées

**1. Incohérence d'État lors d'Envois Simultanés**

Le système ne gère pas correctement l'ordre des messages lors d'envois simultanés. Deux utilisateurs envoyant des messages en même temps peuvent voir des ordres différents temporairement.

```typescript
// Problème: L'horodatage client est utilisé localement avant confirmation serveur
const newMessages = [...prev, {
  ...sentMessage,
  body: plaintextBody,
  createdAt: Date.now(),  // ⚠️ Timestamp client, pas serveur
}];
```

**2. Logique de Suppression de Messages**

La suppression ("burn") utilise un scheduler côté serveur, mais il n'y a pas de confirmation que le client a bien affiché le message avant sa destruction. Un message peut être détruit avant d'être lu dans certains cas de latence réseau.

**3. Contrôle d'Accès aux Demandes de Conversation**

```typescript
// apps/bridge/src/routes/conversationRequests.ts: Ligne 147
if (req.to_user_id !== userId) {
  reply.code(403);
  return { error: 'Non autorisé' };
}
```
✅ Cette vérification est correcte et empêche l'acceptation de demandes destinées à d'autres utilisateurs.

### Flux de Données Sensibles

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Utilisateur   │────▶│    Frontend     │────▶│    Backend      │
│                 │     │                 │     │                 │
│ - Saisie msg    │     │ - Chiffrement   │     │ - Validation    │
│                 │     │   AES-256-GCM   │     │   JWT + authz   │
│                 │     │ - masterKey     │     │ - Stockage      │
│                 │     │   (sessionStg)  │     │   PostgreSQL    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        ⚠️                    ❌                      ✅
   Aucun problème      Clé en clair dans     Données chiffrées
   identifié           sessionStorage        en base
```

---

## 📈 MÉTRIQUES DE QUALITÉ DU CODE

### Complexité Cyclomatique

| Fichier | Fonction | Complexité | Recommandation |
|---------|----------|------------|----------------|
| `Conversations.tsx` | `sendMessage` | 12 | 🟡 Refactorer en sous-fonctions |
| `database.js` | `getAuditStats` | 8 | 🟢 Acceptable |
| `socketServer.ts` | `setupSocketServer` | 15 | 🔴 Extraire les handlers |
| `auth.ts` | Route signup | 18 | 🔴 Diviser standard/dicekey |
| `useConversationMessages.ts` | `decryptMessages` | 6 | 🟢 Bon |

### Code Smells Détectés

| Type | Count | Fichiers Concernés |
|------|-------|-------------------|
| Fonctions trop longues (>50 lignes) | 5 | auth.ts, Conversations.tsx, database.js |
| Variables non utilisées | 3 | `_error`, `_newConvUsername`, etc. dans Conversations.tsx |
| Any types TypeScript | 12+ | Multiples fichiers |
| Console.log en production | 8 | lib/encryption.ts, hooks/* |
| Magic numbers | 4 | 100000 (PBKDF2), 12 (IV length), etc. |

### Couverture de Tests

⚠️ **Fichier de test trouvé:** `useConversationMessages.test.ts`

Cependant, une couverture de tests complète n'a pas été identifiée pour:
- Routes d'authentification
- Logique WebSocket
- Fonctions de chiffrement
- Gestionnaires d'erreurs

---

## 📝 PLAN D'ACTION PRIORISÉ

### Phase 1: Corrections Critiques (Semaine 1)

| # | Action | Fichier | Effort | Risque Actuel |
|---|--------|---------|--------|---------------|
| 1 | Ajouter vérification d'appartenance dans `join_conversation` | socketServer.ts | 2h | CRITIQUE |
| 2 | Migrer `_temp_masterKey` de sessionStorage vers IndexedDB | secureKeyAccess.ts | 4h | CRITIQUE |
| 3 | Valider appartenance sur tous les événements WebSocket | socketServer.ts | 3h | ÉLEVÉ |

### Phase 2: Corrections Élevées (Semaine 2)

| # | Action | Fichier | Effort | Risque Actuel |
|---|--------|---------|--------|---------------|
| 4 | Supprimer le fallback de dérivation de clé faible | encryption.ts | 1h | ÉLEVÉ |
| 5 | Exclure les tokens de la persistance Zustand | auth.ts | 1h | MOYENNE |
| 6 | Supprimer les logs de contenu de message | messages.ts | 30min | MOYENNE |

### Phase 3: Améliorations (Semaine 3-4)

| # | Action | Fichier | Effort | Risque Actuel |
|---|--------|---------|--------|---------------|
| 7 | Implémenter système d'ID temporaires pour les messages | Conversations.tsx | 4h | MOYENNE |
| 8 | Ajouter validation Zod stricte pour UUID | messages.ts | 1h | MOYENNE |
| 9 | Nettoyer les any types TypeScript | Multiple | 8h | FAIBLE |
| 10 | Ajouter tests unitaires pour le chiffrement | lib/encryption.ts | 6h | FAIBLE |

---

## 🔒 RECOMMANDATIONS ARCHITECTURALES

### 1. Séparer la Validation WebSocket
```typescript
// Créer un middleware de validation centralisé
const validateConversationAccess = async (
  socket: AuthenticatedSocket, 
  conversationId: string
): Promise<boolean> => {
  const members = await db.getConversationMembers(conversationId);
  return members.includes(socket.userId);
};
```

### 2. Implémenter un Key Manager Dédié
```typescript
// Remplacer l'accès direct par un service
class SecureKeyManager {
  private keyStore: IDBDatabase;
  
  async getDecryptionKey(conversationId: string): Promise<CryptoKey>;
  async rotateKey(conversationId: string): Promise<void>;
  async destroyAllKeys(): Promise<void>;
}
```

### 3. Ajouter des Headers de Sécurité Manquants
```typescript
// Dans index.ts
app.addHook('onSend', async (request, reply) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  reply.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
});
```

---

## 📊 TABLEAU DE SYNTHÈSE DES VULNÉRABILITÉS

| ID | Titre | Sévérité | CVSS | Statut |
|----|-------|----------|------|--------|
| VUL-001 | Contrôle d'Accès WebSocket Room | CRITIQUE | 8.5 | 🔴 À corriger |
| VUL-002 | MasterKey en SessionStorage | ÉLEVÉ | 7.5 | 🔴 À corriger |
| VUL-003 | Validation Events WebSocket | ÉLEVÉ | 7.0 | 🔴 À corriger |
| VUL-004 | Regex ConversationId | MOYENNE | 5.5 | 🟡 À améliorer |
| VUL-005 | Logs de Messages | MOYENNE | 5.0 | 🟡 À améliorer |
| VUL-006 | Race Condition Messages | MOYENNE | 4.5 | 🟡 À améliorer |
| VUL-007 | Tokens en LocalStorage | MOYENNE | 4.0 | 🟡 À améliorer |
| VUL-008 | Memory Leak WebSocket | FAIBLE | 3.0 | 🟢 Optionnel |
| VUL-009 | Fallback Clé Faible | MOYENNE | 5.5 | 🟡 À améliorer |
| VUL-010 | Absence CSRF | FAIBLE | 3.5 | 🟢 Optionnel |

---

## ✅ CONCLUSION

L'audit révèle que l'application Dead Drop dispose de fondations de sécurité solides (chiffrement E2E, authentification JWT, validation des entrées), mais présente des vulnérabilités critiques dans la gestion des contrôles d'accès WebSocket et le stockage des clés sensibles côté client.

**Les 3 corrections les plus urgentes sont:**
1. Validation de l'appartenance à une conversation avant tout join/action WebSocket
2. Migration complète vers IndexedDB pour le stockage des clés cryptographiques
3. Suppression des fallbacks de sécurité faibles

L'équipe de développement devrait prioriser ces corrections avant tout déploiement en production.

---

**Rapport rédigé par:** Audit de Sécurité Automatisé
**Date de l'audit:** 2025-12-04
**Prochaine révision recommandée:** 2026-03-04 (trimestrielle)
