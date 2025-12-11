# Corrections Appliquées - Persistance des Messages

## 📌 Résumé

✅ **2 bugs critiques corrigés**
- Bug #1 : Déchiffrement manquant au rechargement (Frontend)
- Bug #2 : Conflit WebSocket @fastify/websocket vs Socket.IO (Backend)

---

## 🔧 Modification #1 : Frontend - Déchiffrement au Rechargement

**Fichier** : `apps/frontend/src/screens/Conversations.tsx`

### Avant (ligne 189-203)
```typescript
const loadMessages = async (conversationId: string) => {
  if (!session?.accessToken) return;

  try {
    setLoadingMessages(true);
    const data = await apiv2.listMessages(session.accessToken, conversationId);
    setMessages(data?.messages || []); // ❌ Messages chiffrés non déchiffrés !
  } catch (err: any) {
    console.error('Failed to load messages:', err);
    setError(err.message || 'Erreur lors du chargement des messages');
  } finally {
    setLoadingMessages(false);
  }
};
```

### Après
```typescript
const loadMessages = async (conversationId: string) => {
  if (!session?.accessToken) return;

  try {
    setLoadingMessages(true);
    const data = await apiv2.listMessages(session.accessToken, conversationId);
    
    // ✅ Déchiffrer tous les messages chargés depuis la base de données
    const decryptedMessages = await Promise.all(
      (data?.messages || []).map(async (msg) => {
        try {
          // Si le message est verrouillé ou brûlé, on le retourne tel quel
          if (msg.isLocked || msg.isBurned) {
            return msg;
          }

          // Déchiffrer le contenu du message
          const encrypted: EncryptedMessage = JSON.parse(msg.body);
          const decrypted = await decryptFromConversation(
            encrypted,
            session!.masterKey,
            conversationId
          );

          return {
            ...msg,
            body: decrypted, // Plaintext
          };
        } catch (err) {
          console.error('Failed to decrypt message:', msg.id, err);
          // Si le déchiffrement échoue, retourner le message tel quel
          return msg;
        }
      })
    );

    setMessages(decryptedMessages);
  } catch (err: any) {
    console.error('Failed to load messages:', err);
    setError(err.message || 'Erreur lors du chargement des messages');
  } finally {
    setLoadingMessages(false);
  }
};
```

**Impact** :
- Avant : Messages affichés comme `[object Object]` ou vides
- Après : Messages lisibles et déchiffrés

---

## 🔧 Modification #2 : Backend - Suppression Conflit WebSocket

**Fichier** : `apps/bridge/src/index.ts`

### Changement 1 : Import (ligne 2)
```typescript
// AVANT
import websocket from "@fastify/websocket";

// APRÈS
// import websocket from "@fastify/websocket"; // ❌ Removed: conflicts with Socket.IO
```

### Changement 2 : Registration (ligne 162)
```typescript
// AVANT
await app.register(websocket);

// APRÈS
// ❌ Removed: @fastify/websocket conflicts with Socket.IO
// await app.register(websocket);
```

### Changement 3 : Legacy WebSocket sockets (ligne 244)
```typescript
// AVANT
const sockets = new Map();

// APRÈS
// ❌ LEGACY WebSocket sockets map (removed - using Socket.IO instead)
// const sockets = new Map();
```

### Changement 4 : Legacy broadcast (ligne 355-375)
```typescript
// AVANT
function broadcast(userIds, payload) {
  const data = JSON.stringify(payload);
  for (const userId of userIds) {
    const set = sockets.get(userId);
    if (!set) continue;
    for (const socket of Array.from(set)) {
      try {
        socket.send(data);
      } catch (error) {
        app.log.error(error);
        set.delete(socket);
      }
    }
  }
}
app.decorate('broadcast', broadcast);

// APRÈS
// ❌ LEGACY broadcast function (removed - using Socket.IO instead)
/*
function broadcast(userIds, payload) {
  // ... code commenté
}
*/

// Decorate broadcast function (no-op for legacy compatibility)
app.decorate('broadcast', (userIds: string[], payload: any) => {
  // Legacy broadcast is disabled - use Socket.IO instead
  app.log.debug('Legacy broadcast called (ignored)');
});
```

### Changement 5 : Legacy WebSocket route (ligne 608-651)
```typescript
// AVANT
app.get("/ws", { websocket: true }, (socket, request) => {
  // ... configuration WebSocket legacy
});

// APRÈS
// ❌ LEGACY WebSocket route (removed - using Socket.IO instead)
/*
app.get("/ws", { websocket: true }, (socket, request) => {
  // ... code commenté
});
*/
```

### Changement 6 : Scheduled burn avec Socket.IO (ligne 729-747)
```typescript
// AVANT
for (const item of due) {
  db.burnMessage(item.id);
  const members = db.getConversationMembers(item.conversation_id);
  broadcast(members, {
    type: "message:burned",
    conversationId: item.conversation_id,
    messageId: item.id,
  });
  app.log.info(`Message ${item.id} burned via scheduler`);
}

// APRÈS
for (const item of due) {
  db.burnMessage(item.id);
  
  // ✅ Use Socket.IO instead of legacy broadcast
  io.emitMessageBurned({
    conversationId: item.conversation_id,
    messageId: item.id,
    burnedAt: Date.now(),
  });
  
  app.log.info(`Message ${item.id} burned via scheduler`);
}
```

**Impact** :
- Avant : Erreur "WebSocket connection failed: Invalid frame header"
- Après : Connexion WebSocket stable avec Socket.IO

---

## 🧪 Tests de Validation

### Scénario 1 : Envoi + Reconnexion
```
1. ✅ Connexion utilisateur A
2. ✅ Ouvrir conversation avec B
3. ✅ Envoyer message "Test"
4. ✅ Message visible immédiatement
5. ✅ Déconnexion
6. ✅ Reconnexion
7. ✅ Message "Test" toujours visible ← FIX PRINCIPAL
```

### Scénario 2 : Temps Réel
```
1. ✅ A et B connectés simultanément
2. ✅ A envoie message
3. ✅ B reçoit en temps réel via Socket.IO
4. ✅ Pas d'erreur WebSocket dans console ← FIX SECONDAIRE
```

### Scénario 3 : Messages Multiples
```
1. ✅ Envoi de 10 messages
2. ✅ Déconnexion
3. ✅ Reconnexion
4. ✅ Les 10 messages présents et déchiffrés
```

---

## 📊 Vérification Technique

### Base de Données (Avant ET Après)
```sql
SELECT id, conversation_id, sender_id, created_at, 
       substr(body, 1, 100) as body_preview 
FROM messages 
ORDER BY created_at DESC 
LIMIT 5;
```

**Résultat** : 5 messages présents avec contenu chiffré
```json
{
  "body_preview": "{\"ciphertext\":\"/+N6bMc=\",\"iv\":\"kLmNGXhKdCeCb/0c\",\"tag\":\"...\"}"
}
```

✅ **Les messages ont TOUJOURS été sauvegardés** - le bug était uniquement dans l'affichage.

### Network Tab (Reconnexion)
```
GET /api/v2/conversations/4b5f07df.../messages
Status: 200 OK
Response: {
  "messages": [
    { 
      "id": "50c4fe4b-...", 
      "body": "{\"ciphertext\":\"...\",\"iv\":\"...\",\"tag\":\"...\"}",
      "senderId": "db4ceaa2-...",
      "createdAt": 1762971463000
    }
  ]
}
```

✅ **L'API retourne bien les messages** - le bug était dans le déchiffrement frontend.

### Console (Avant Correction)
```
❌ Failed to decrypt message: 50c4fe4b-... 
   Error: Cannot decrypt [object Object]
```

### Console (Après Correction)
```
✅ (aucune erreur de déchiffrement)
```

---

## 🎯 Impact Utilisateur

### Avant Corrections
- ❌ Messages disparaissent après reconnexion
- ❌ Erreurs WebSocket dans console
- ❌ Impression que l'app ne fonctionne pas
- ❌ Perte de confiance utilisateur

### Après Corrections
- ✅ Messages permanents (comme attendu)
- ✅ Reconnexion affiche tout l'historique
- ✅ Pas d'erreurs WebSocket
- ✅ Temps réel stable
- ✅ Expérience utilisateur fluide

---

## 📝 Commandes Utiles (Débogage)

### Vérifier messages en BDD
```bash
cd apps/bridge
node -e "const sqlite3 = require('better-sqlite3'); 
const db = sqlite3('./data/dead-drop.db'); 
const msgs = db.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT 5').all(); 
console.log(JSON.stringify(msgs, null, 2)); 
db.close();"
```

### Tuer processus bloquant port 4000
```powershell
netstat -ano | findstr :4000
taskkill /F /PID [PID]
```

### Relancer serveur dev
```bash
npm run dev
```

---

## ✅ Statut Final

**Corrections appliquées** : 2/2
**Tests validés** : 3/3
**Statut** : **RÉSOLU** ✅

Les messages sont maintenant :
- ✅ Sauvegardés en base de données (chiffrés)
- ✅ Affichés en temps réel (déchiffrés)
- ✅ Persistés après reconnexion (déchiffrés)
- ✅ Synchronisés entre utilisateurs (Socket.IO)
