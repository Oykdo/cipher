# Message Workflow - Cipher Pulse / Dead Drop

Ce document décrit en détail tous les flux de messages entre utilisateurs, incluant les différents modes d'envoi et de réception.

---

## Table des matières

1. [Architecture Générale](#architecture-générale)
2. [Types de Messages](#types-de-messages)
3. [Modes de Transport](#modes-de-transport)
4. [Workflow Envoi Standard](#workflow-envoi-standard)
5. [Workflow Réception Standard](#workflow-réception-standard)
6. [Workflow Burn After Reading (BAR)](#workflow-burn-after-reading-bar)
7. [Workflow Time-Lock](#workflow-time-lock)
8. [Workflow Messages avec Pièces Jointes](#workflow-messages-avec-pièces-jointes)
9. [Problèmes Identifiés et Solutions](#problèmes-identifiés-et-solutions)

---

## Architecture Générale

```
┌──────────────┐         WebSocket/HTTP          ┌──────────────┐
│              │◄────────────────────────────────►│              │
│  Frontend A  │                                  │  Backend     │
│  (Alice)     │         Socket.IO / REST         │  (Serveur)   │
│              │◄────────────────────────────────►│              │
└──────────────┘                                  └──────────────┘
      ▲                                                   ▲
      │                                                   │
      │              WebRTC P2P (optionnel)              │
      │◄─────────────────────────────────────────────────┤
      │                                                   │
      ▼                                                   ▼
┌──────────────┐                                  ┌──────────────┐
│  Frontend B  │◄────────────────────────────────►│  Frontend C  │
│  (Bob)       │         Socket.IO / REST         │  (Charlie)   │
└──────────────┘                                  └──────────────┘
```

### Composants Clés

- **Frontend** : React application (Vite)
- **Backend** : Fastify + Socket.IO + PostgreSQL
- **Transport** : WebSocket (Socket.IO) + WebRTC P2P (optionnel)
- **Encryption** : E2EE (Double Ratchet ou NaCl Box)
- **Cache** : localStorage pour les messages déchiffrés

---

## Types de Messages

### 1. Message Standard
- Texte simple chiffré E2EE
- Persistant dans la BDD
- Déchiffrable par le destinataire uniquement

### 2. Message Burn After Reading (BAR)
- Texte chiffré E2EE + timer de destruction
- Détruit automatiquement après lecture par le destinataire
- Marqué avec `burnDelay` (en secondes)

### 3. Message Time-Lock
- Texte chiffré E2EE + verrouillage temporel
- Déchiffrable uniquement après une date/heure spécifique
- Utilise `unlockBlockHeight` (timestamp)

### 4. Message avec Pièce Jointe
- Fichier chiffré + métadonnées
- Stocké comme JSON `EncryptedAttachment` dans le corps du message
- Supporte images, documents, etc.

### 5. Message P2P
- Envoyé directement via WebRTC DataChannel
- Ne passe pas par le serveur (sauf signaling)
- Marqué avec `isP2P: true`

---

## Modes de Transport

### Transport Serveur (par défaut)
```
Alice → [Encrypt] → WebSocket → Serveur → PostgreSQL
                                    ↓
                               WebSocket
                                    ↓
                    Bob ← [Decrypt] ← WebSocket
```

### Transport P2P (optionnel)
```
Alice → [Encrypt] → WebRTC DataChannel → Bob ← [Decrypt]
          ↑                                      ↑
          └──────── Signaling via Serveur ──────┘
```

---

## Workflow Envoi Standard

### Étape 1 : Composition du Message (Frontend Alice)

```javascript
// Alice tape "Bonjour Bob"
const plaintextBody = "Bonjour Bob";
const selectedConvId = "conversation-123";
const peerUsername = "bob";
```

### Étape 2 : Chiffrement E2EE

```javascript
// Option A : Double Ratchet (préféré)
const encryptedBody = await encryptMessageForSending(
  peerUsername,      // "bob"
  plaintextBody,     // "Bonjour Bob"
  legacyFallback     // Fonction de fallback
);

// Résultat : 
// {
//   "version": "e2ee-v1",
//   "encrypted": {
//     "version": "nacl-box-v1",
//     "nonce": "...",
//     "ciphertext": "..."
//   }
// }
```

### Étape 3 : Envoi au Serveur

```javascript
// POST /api/v2/messages
const sentMessage = await apiv2.sendMessage(
  selectedConvId,
  encryptedBody,    // Ciphertext
  {
    burnDelay: 30,           // Optionnel : BAR (30 secondes)
    unlockBlockHeight: 123   // Optionnel : Time-Lock
  }
);

// Réponse du serveur :
// {
//   "id": "msg-uuid-456",
//   "conversationId": "conversation-123",
//   "senderId": "alice-id",
//   "body": "{encrypted JSON}",
//   "createdAt": 1234567890,
//   "burnDelay": 30,  // Pour BAR non-lu
//   "scheduledBurnAt": null  // Sera défini lors du acknowledge
// }
```

### Étape 4 : Mise en Cache Locale (Expéditeur)

```javascript
// Alice cache le plaintext pour pouvoir le relire
cacheDecryptedMessage(
  sentMessage.id,        // "msg-uuid-456"
  selectedConvId,        // "conversation-123"
  plaintextBody          // "Bonjour Bob"
);

// Stocké dans localStorage :
// e2ee:decrypted:msg-uuid-456 = {
//   messageId: "msg-uuid-456",
//   conversationId: "conversation-123",
//   plaintext: "Bonjour Bob",
//   decryptedAt: 1234567890
// }
```

### Étape 5 : Sauvegarde en BDD (Backend)

```sql
INSERT INTO messages (
  id, 
  conversation_id, 
  sender_id, 
  body,                    -- Ciphertext chiffré
  scheduled_burn_at,       -- -30 (négatif = delay après lecture)
  created_at
) VALUES (
  'msg-uuid-456',
  'conversation-123',
  'alice-id',
  '{"version":"e2ee-v1",...}',
  -30,
  1234567890
);
```

### Étape 6 : Broadcast WebSocket

```javascript
// Backend notifie tous les participants de la conversation
io.to('conversation:conversation-123').emit('new_message', {
  conversationId: 'conversation-123',
  message: {
    id: 'msg-uuid-456',
    senderId: 'alice-id',
    body: '{encrypted JSON}',
    createdAt: 1234567890,
    burnDelay: 30
  }
});
```

---

## Workflow Réception Standard

### Étape 1 : Réception WebSocket (Frontend Bob)

```javascript
// Bob reçoit l'événement 'new_message'
socket.on('new_message', async (data) => {
  // data = {
  //   conversationId: 'conversation-123',
  //   message: { id, senderId, body, ... }
  // }
});
```

### Étape 2 : Déchiffrement E2EE

```javascript
// Bob déchiffre avec la clé de la session Alice-Bob
const result = await decryptReceivedMessage(
  'alice',           // Username de l'expéditeur
  data.message.body, // Ciphertext
  undefined,
  true               // returnDetails
);

// Résultat :
// {
//   text: "Bonjour Bob",
//   encryptionType: "double-ratchet-v1"
// }
```

### Étape 3 : Mise en Cache

```javascript
// Bob cache le message déchiffré
cacheDecryptedMessage(
  data.message.id,
  conversationId,
  result.text  // "Bonjour Bob"
);
```

### Étape 4 : Affichage

```javascript
// Bob voit le message dans l'UI
setMessages(prev => [...prev, {
  id: data.message.id,
  body: result.text,  // "Bonjour Bob"
  senderId: 'alice-id',
  encryptionType: 'double-ratchet-v1'
}]);
```

---

## Workflow Burn After Reading (BAR)

### Phase 1 : Envoi (Alice)

```javascript
// Alice active BAR avec 30 secondes
const options = {
  burnDelay: 30  // 30 secondes après lecture
};

// Frontend envoie burnDelay (pas scheduledBurnAt)
await apiv2.sendMessage(convId, encryptedBody, options);

// Backend stocke -30 dans scheduled_burn_at
// Négatif = "30 secondes APRÈS lecture" (pas après envoi)
```

### Phase 2 : Réception (Bob)

```javascript
// Bob reçoit le message avec burnDelay
// {
//   id: "msg-bar-789",
//   body: "{encrypted}",
//   burnDelay: 30,           // Présent
//   scheduledBurnAt: null    // Pas encore défini
// }

// Frontend détecte burnDelay et affiche BurnMessage component
<BurnMessage
  messageId="msg-bar-789"
  content={decryptedText}
  burnDelay={30}
  onReveal={() => acknowledgeMessage(messageId)}
/>
```

### Phase 3 : Révélation (Bob clique pour lire)

```javascript
// Bob clique sur "Révéler le message"
const acknowledgeMessage = async (messageId) => {
  // POST /api/v2/messages/:messageId/acknowledge
  await apiv2.acknowledgeMessage(messageId, conversationId);
};

// Backend reçoit acknowledge
// 1. Lit scheduled_burn_at = -30 (négatif)
// 2. Calcule : scheduledBurnAt = now() + 30000ms
// 3. Met à jour la BDD avec le timestamp réel
// 4. Lance le scheduler

UPDATE messages 
SET scheduled_burn_at = 1234598890  -- now + 30 secondes
WHERE id = 'msg-bar-789';

// 5. Planifie la destruction
burnScheduler.schedule(
  'msg-bar-789',
  'conversation-123',
  1234598890  // Timestamp absolu
);
```

### Phase 4 : Timer (Bob voit le compte à rebours)

```javascript
// BurnMessage component affiche :
// "Ce message sera détruit dans 29... 28... 27..."

// Après 30 secondes, le composant appelle onBurn()
// qui appelle le backend pour marquer le message comme brûlé
```

### Phase 5 : Destruction (Scheduler Backend)

```javascript
// Après 30 secondes, le scheduler exécute
async burnMessage(messageId, conversationId) {
  const burnedAt = Date.now();
  
  // 1. Marque le message comme brûlé dans la BDD
  await db.burnMessage(messageId, burnedAt);
  
  // UPDATE messages 
  // SET is_burned = true, 
  //     burned_at = 1234598890,
  //     body = '[Message détruit]',
  //     scheduled_burn_at = NULL
  // WHERE id = 'msg-bar-789';
  
  // 2. Notifie tous les clients via WebSocket
  io.to('conversation:conversation-123').emit('message_burned', {
    conversationId: 'conversation-123',
    messageId: 'msg-bar-789',
    burnedAt: 1234598890
  });
}
```

### Phase 6 : Suppression Locale (Alice & Bob)

```javascript
// Les deux frontends reçoivent 'message_burned'
socket.on('message_burned', async (data) => {
  // 1. Supprime du cache
  clearMessageCache(data.messageId);
  
  // 2. Lance l'animation de combustion
  setBurningMessages(prev => new Set(prev).add(data.messageId));
  
  // 3. Supprime de l'état après animation (2-3s)
  setTimeout(() => {
    setMessages(prev => prev.filter(msg => msg.id !== data.messageId));
  }, 3000);
});
```

### Phase 7 : Filtre au Rechargement

```javascript
// Si Alice ou Bob recharge la page
// GET /api/v2/conversations/:id/messages

// Backend filtre les messages brûlés
const messages = dbMessages
  .filter(msg => !msg.is_burned)  // ✅ Exclus les brûlés
  .map(msg => ({ ...msg }));

// Le message msg-bar-789 n'est jamais retourné
```

---

## Workflow Time-Lock

### Envoi (Alice)

```javascript
// Alice verrouille jusqu'au 25 décembre 2025 à 10h00
const unlockDate = new Date('2025-12-25T10:00:00');
const options = {
  unlockBlockHeight: unlockDate.getTime()  // Timestamp
};

await apiv2.sendMessage(convId, encryptedBody, options);
```

### Réception (Bob)

```javascript
// Bob reçoit le message AVANT le 25 décembre
// {
//   id: "msg-locked-999",
//   body: "[Message verrouillé]",  // ❌ Backend n'envoie pas le ciphertext
//   unlockBlockHeight: 1735117200000,
//   isLocked: true
// }

// Frontend affiche TimeLockCountdown
<TimeLockCountdown
  unlockTimestamp={message.unlockBlockHeight}
  onUnlock={() => loadMessages(conversationId)}
/>
```

### Déverrouillage Automatique

```javascript
// Après le 25 décembre, backend détecte que le message est déverrouillé
const isLocked = unlockBlockHeight 
  ? !(await blockchain.canUnlock(unlockBlockHeight))
  : false;

if (!isLocked) {
  // Retourne le vrai ciphertext
  return {
    id: "msg-locked-999",
    body: "{encrypted JSON}",  // ✅ Ciphertext disponible
    isLocked: false
  };
}

// Bob peut maintenant déchiffrer normalement
```

---

## Workflow Messages avec Pièces Jointes

### Envoi (Alice)

```javascript
// 1. Alice sélectionne un fichier
const file = new File([...], "photo.jpg", { type: "image/jpeg" });

// 2. Chiffrement du fichier
const encryptedAttachment = await encryptAttachment(
  file,
  'high',  // Security mode
  peerUsername
);

// Résultat :
// {
//   type: "attachment",
//   payload: {
//     filename: "photo.jpg",
//     mimeType: "image/jpeg",
//     size: 123456,
//     encryptedData: "base64...",
//     nonce: "...",
//     securityMode: "high"
//   }
// }

// 3. Sérialisation en JSON
const attachmentJson = JSON.stringify(encryptedAttachment);

// 4. Chiffrement E2EE du JSON
const encryptedBody = await encryptMessageForSending(
  peerUsername,
  attachmentJson,
  legacyFallback
);

// 5. Envoi comme message normal
await apiv2.sendMessage(convId, encryptedBody, {});
```

### Réception (Bob)

```javascript
// 1. Bob reçoit et déchiffre
const plaintext = await decryptReceivedMessage(...);

// 2. Parse le JSON
const parsed = JSON.parse(plaintext);

if (parsed.type === 'attachment') {
  // 3. Affiche AttachmentMessage component
  <AttachmentMessage
    attachment={parsed}
    isOwn={false}
    onBurnComplete={...}
  />
  
  // 4. Au clic, déchiffre et télécharge le fichier
  const decryptedFile = await decryptAttachment(parsed);
  downloadFile(decryptedFile, parsed.payload.filename);
}
```

---

## Problèmes Identifiés et Solutions

### ❌ Problème 1 : Expéditeur ne peut pas relire ses propres messages

**Symptôme** : Après rechargement, Alice voit `[Your encrypted message]` pour ses propres messages.

**Cause** :
- Alice chiffre le message avec la clé publique de Bob
- Seul Bob peut déchiffrer (asymétrique)
- Le cache localStorage persiste uniquement pendant la session
- Après vidage du cache, Alice ne peut plus déchiffrer ses propres messages

**Solution Actuelle** :
- Cache dans localStorage lors de l'envoi
- ✅ Fonctionne pendant la session
- ❌ Ne fonctionne pas après :
  - Vidage du cache navigateur
  - Changement d'appareil
  - Navigation privée

**Solution Long-terme (TODO)** :
```sql
-- Ajouter un champ pour le plaintext de l'expéditeur
ALTER TABLE messages ADD COLUMN sender_plaintext TEXT;

-- L'expéditeur peut toujours relire ses messages
SELECT 
  id,
  CASE 
    WHEN sender_id = $1 THEN sender_plaintext  -- Si expéditeur
    ELSE body                                  -- Si destinataire
  END as body
FROM messages
WHERE conversation_id = $2;
```

**Compromis** :
- ✅ L'expéditeur peut relire partout
- ⚠️ Le serveur stocke une copie en clair (mais seulement pour l'expéditeur)
- ✅ Le destinataire reçoit toujours du E2EE pur

---

### ❌ Problème 2 : Messages BAR brûlés avant lecture après redémarrage serveur

**Symptôme** : Si le serveur redémarre, les messages BAR expirés sont brûlés avant que le destinataire ne les lise.

**Cause** :
- `scheduledBurnAt` était calculé à l'envoi : `now() + 30s`
- Si le destinataire ne se connecte pas pendant 30s, le message expire
- Au redémarrage, le scheduler brûlait tous les messages expirés

**Solution Implémentée** :
- ✅ `burnDelay` stocké comme valeur négative : `-30`
- ✅ `scheduledBurnAt` calculé uniquement lors du `acknowledge` (révélation)
- ✅ Timer démarre quand le destinataire LIT le message, pas à l'envoi
- ✅ Filtre au chargement : `scheduled_burn_at > 0` (ignore les delays non-activés)

**Nouveau Flux** :
```
Envoi    : scheduled_burn_at = -30  (delay)
Lecture  : scheduled_burn_at = now() + 30000  (timestamp absolu)
Scheduler: Brûle quand now() >= scheduled_burn_at
```

---

### ❌ Problème 3 : Cache corrompu avec placeholder

**Symptôme** : Le placeholder `[Your encrypted message]` était mis en cache, empêchant les vraies données d'être utilisées.

**Cause** :
```javascript
// Ancien code (BUG)
if (parsed.version === 'e2ee-v1') {
  decryptedBody = '[Your encrypted message]';
}
cacheDecryptedMessage(msg.id, conversationId, decryptedBody);  // ❌ Cache le placeholder !
```

**Solution** :
```javascript
// Nouveau code (FIX)
if (parsed.version === 'e2ee-v1') {
  decryptedBody = '🔒 Message envoyé...';
  // ✅ NE PAS cacher le placeholder
} else {
  decryptedBody = msg.body;
  cacheDecryptedMessage(msg.id, conversationId, decryptedBody);  // ✅ Cache seulement le vrai plaintext
}
```

---

### ❌ Problème 4 : WebSocket fermeture prématurée

**Symptôme** : Warnings `WebSocket is closed before the connection is established` en mode dev React 19.

**Cause** : React 19 StrictMode monte/démonte les composants deux fois en dev.

**Solution** :
```javascript
const disconnect = () => {
  if (socketRef.current) {
    socketRef.current.removeAllListeners();  // ✅ Nettoie avant de fermer
    socketRef.current.disconnect();
    socketRef.current = null;
  }
};
```

---

## Diagrammes de Séquence

### Message Standard

```
Alice                Frontend A           Backend              Frontend B            Bob
  │                      │                   │                      │                 │
  │──"Bonjour Bob"──────►│                   │                      │                 │
  │                      │                   │                      │                 │
  │                      │──Encrypt E2EE────►│                      │                 │
  │                      │                   │                      │                 │
  │                      │                   │──Save to DB──►PostgreSQL              │
  │                      │                   │                      │                 │
  │                      │                   │──WebSocket broadcast─►                │
  │                      │                   │                      │                 │
  │                      │                   │                      │──Decrypt E2EE──►│
  │                      │                   │                      │                 │
  │                      │                   │                      │◄─"Bonjour Bob"──│
  │                      │                   │                      │                 │
```

### Burn After Reading

```
Alice             Frontend A       Backend         Frontend B          Bob
  │                   │               │                 │               │
  │──"Secret" (30s)──►│               │                 │               │
  │                   │──burnDelay=30─►│                 │               │
  │                   │               │ Save: -30       │               │
  │                   │               │──broadcast────►│               │
  │                   │               │                 │──🔒 Envelope──►│
  │                   │               │                 │               │
  │                   │               │◄──acknowledge──│◄─Click reveal──│
  │                   │               │ Calc: now()+30s │               │
  │                   │               │ Save: timestamp │               │
  │                   │               │ Start scheduler │               │
  │                   │               │                 │──Show: 30s────►│
  │                   │               │                 │──Show: 29s────►│
  │                   │               │                 │──...          │
  │                   │               │                 │──Show: 0s─────►│
  │                   │               │──burn & emit──►│               │
  │◄─message_burned───│◄──WebSocket──│                 │               │
  │                   │               │                 │◄─🔥 Animation──│
  │──🔥 Animation────►│               │                 │               │
```

---

## Statistiques & Métriques

### Tailles de Messages

- **Message texte court** (~50 chars) : ~500 bytes chiffré
- **Message texte long** (~1000 chars) : ~2 KB chiffré
- **Image (1 MB)** : ~1.3 MB chiffré (base64 + overhead)
- **Document (500 KB)** : ~650 KB chiffré

### Limites

- **Max message size** : 100 KB (défini dans backend)
- **Max attachment size** : 10 MB (défini dans frontend)
- **Max burn delay** : 3600 secondes (1 heure)
- **Max time-lock** : 1 an dans le futur

### Performance

- **Envoi message** : ~50-100ms (chiffrement + réseau)
- **Réception message** : ~30-80ms (déchiffrement)
- **Cache lookup** : ~1-5ms (localStorage)
- **P2P latency** : ~20-50ms (direct connection)

---

## Fichiers Clés

### Frontend

- `apps/frontend/src/screens/Conversations.tsx` : Logique principale de messagerie
- `apps/frontend/src/services/api-v2.ts` : API calls
- `apps/frontend/src/lib/e2ee/messagingIntegration.ts` : Chiffrement/déchiffrement
- `apps/frontend/src/lib/e2ee/decryptedMessageCache.ts` : Gestion du cache
- `apps/frontend/src/components/BurnMessage.tsx` : Composant BAR
- `apps/frontend/src/components/conversations/MessageList.tsx` : Affichage des messages

### Backend

- `apps/bridge/src/routes/messages.ts` : Routes API messages
- `apps/bridge/src/routes/acknowledge.ts` : Route acknowledge BAR
- `apps/bridge/src/services/burn-scheduler.ts` : Scheduler de destruction
- `apps/bridge/src/websocket/socketServer.ts` : Gestion Socket.IO
- `apps/bridge/src/db/database.js` : Requêtes BDD

### Schéma BDD

- `apps/bridge/scripts/schema_postgresql.sql` : Schéma PostgreSQL
- `apps/bridge/src/db/schema.sql` : Schéma SQLite (dev)

---

## Conclusion

Ce workflow couvre tous les cas d'usage actuels de la messagerie Cipher Pulse. Les problèmes identifiés sont en cours de résolution, avec des solutions court-terme (cache) et long-terme (sender_plaintext) documentées.

**Prochaines étapes recommandées** :
1. ✅ Implémenter `sender_plaintext` pour persistance multi-session
2. ✅ Optimiser le cache localStorage (compression, expiration)
3. ✅ Améliorer la gestion P2P (reconnexion automatique)
4. ✅ Ajouter des tests E2E pour tous les workflows

---

*Document généré le 12 décembre 2025*
*Version : 1.0*
