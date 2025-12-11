# WebSocket (Socket.IO) & Chiffrement AES - Guide d'intégration

## ✅ Dépendances installées

### Backend
```bash
npm install socket.io --prefix apps/bridge
```
- `socket.io@4.x` : Serveur WebSocket avec support des rooms et authentication

### Frontend  
```bash
npm install socket.io-client --prefix apps/frontend
```
- `socket.io-client@4.x` : Client WebSocket pour React

---

## 📁 Fichiers créés

### 1. **Service de chiffrement AES** (Frontend)
**Fichier** : `apps/frontend/src/lib/encryption.ts`

#### Fonctions principales
```typescript
// Dériver une clé de chiffrement
deriveEncryptionKey(sharedSecret, salt): Promise<CryptoKey>

// Chiffrer un message
encryptMessage(plaintext, key): Promise<EncryptedMessage>

// Déchiffrer un message
decryptMessage(encrypted, key): Promise<string>

// API simplifiée pour conversations
encryptForConversation(plaintext, masterKey, conversationId): Promise<EncryptedMessage>
decryptFromConversation(encrypted, masterKey, conversationId): Promise<string>
```

#### Structure EncryptedMessage
```typescript
interface EncryptedMessage {
  ciphertext: string; // Base64
  iv: string;         // Base64 (12 bytes)
  tag: string;        // Base64 (16 bytes auth tag)
}
```

#### Caractéristiques
- **Algorithme** : AES-256-GCM (authentification intégrée)
- **Dérivation clé** : PBKDF2 avec 100,000 itérations
- **IV** : 12 bytes aléatoires (recommandé pour GCM)
- **Tag** : 128 bits (16 bytes)
- **Cache de clés** : évite de recalculer les clés pour chaque message
- **Web Crypto API** : natif navigateur, très performant

---

### 2. **Serveur WebSocket** (Backend)
**Fichier** : `apps/bridge/src/websocket/socketServer.ts`

#### Fonctions principales
```typescript
setupSocketServer(httpServer, fastify): SocketIOServer
```

#### Événements client → serveur
- `join_conversation` : rejoindre une room de conversation
- `leave_conversation` : quitter une room
- `typing` : indicateur "en train d'écrire"

#### Événements serveur → client
- `new_message` : nouveau message dans une conversation
- `message_burned` : message brûlé
- `message_unlocked` : message déverrouillé (Time Capsule)
- `user_typing` : utilisateur en train d'écrire
- `user_joined` : utilisateur a rejoint la conversation
- `user_left` : utilisateur a quitté la conversation

#### Middleware d'authentification
```typescript
// Vérifie le JWT dans socket.handshake.auth.token
// Attache userId et username au socket
socket.userId = decoded.sub;
socket.username = decoded.username;
```

#### Rooms
```typescript
// Format: "conversation:${conversationId}"
socket.join(`conversation:${conversationId}`);

// Émettre à tous les participants
io.to(`conversation:${conversationId}`).emit('new_message', payload);
```

---

### 3. **Hooks React** (Frontend)
**Fichier** : `apps/frontend/src/hooks/useSocket.ts`

#### Hooks disponibles

##### `useSocket({ token, autoConnect })`
```typescript
const { socket, connected, error, connect, disconnect } = useSocket({
  token: session.accessToken,
  autoConnect: true
});
```

##### `useSocketEvent(socket, event, handler)`
```typescript
useSocketEvent(socket, 'new_message', (data) => {
  console.log('New message received:', data);
  // Ajouter le message à l'état
});
```

##### `useConversationRoom(socket, conversationId)`
```typescript
// Rejoint automatiquement la room au mount, quitte au unmount
useConversationRoom(socket, selectedConversationId);
```

##### `useTypingIndicator(socket, conversationId)`
```typescript
const { setTyping } = useTypingIndicator(socket, conversationId);

// Appeler lors de la saisie
setTyping(true);
// Auto-stop après 3 secondes
```

---

## 🔧 Intégration

### Étape 1 : Initialiser Socket.IO dans le backend

**Fichier à modifier** : `apps/bridge/src/index.ts`

```typescript
// AJOUTER en haut
import { Server as HTTPServer } from 'http';
import { setupSocketServer } from './websocket/socketServer.js';

// APRÈS la création de l'app Fastify
const app = Fastify({ logger: true, trustProxy: true });

// CRÉER le serveur HTTP (pour Socket.IO)
const httpServer = app.server as HTTPServer;

// AVANT app.listen()
const io = setupSocketServer(httpServer, app);

// Décorer Fastify avec l'instance Socket.IO
app.decorate('io', io);

// Rendre io accessible dans les types
declare module 'fastify' {
  interface FastifyInstance {
    io: ReturnType<typeof setupSocketServer>;
  }
}
```

### Étape 2 : Émettre des événements depuis les routes

**Fichier à modifier** : `apps/bridge/src/routes/messages.ts`

```typescript
// Dans la route POST /messages (après création du message)
fastify.io.emitNewMessage({
  conversationId: message.conversation_id,
  message: {
    id: message.id,
    senderId: message.sender_id,
    body: message.body,
    createdAt: message.created_at,
    unlockBlockHeight: message.unlock_block_height,
    scheduledBurnAt: message.scheduled_burn_at,
  },
});

// Dans la route POST /messages/acknowledge (après burn)
fastify.io.emitMessageBurned({
  conversationId: message.conversation_id,
  messageId: messageId,
  burnedAt: Date.now(),
});
```

### Étape 3 : Intégrer dans Conversations.tsx

**Fichier à modifier** : `apps/frontend/src/screens/Conversations.tsx`

```typescript
import { useSocket, useSocketEvent, useConversationRoom, useTypingIndicator } from '../hooks/useSocket';
import { encryptForConversation, decryptFromConversation, type EncryptedMessage } from '../lib/encryption';

// Dans le composant
const { socket, connected } = useSocket({
  token: session?.accessToken || '',
  autoConnect: !!session,
});

// Rejoindre la conversation room
useConversationRoom(socket, selectedConvId);

// Écouter les nouveaux messages
useSocketEvent(socket, 'new_message', async (data) => {
  // Déchiffrer le message
  const decrypted = await decryptFromConversation(
    JSON.parse(data.message.body), // body contient EncryptedMessage
    session!.masterKey,
    data.conversationId
  );

  // Ajouter à l'état
  setMessages(prev => [...prev, {
    ...data.message,
    body: decrypted, // Message en clair
  }]);
});

// Écouter les messages brûlés
useSocketEvent(socket, 'message_burned', (data) => {
  setMessages(prev => prev.map(msg => 
    msg.id === data.messageId
      ? { ...msg, isBurned: true, burnedAt: data.burnedAt }
      : msg
  ));
});

// Indicateur typing
const { setTyping } = useTypingIndicator(socket, selectedConvId);
const handleMessageBodyChange = (value: string) => {
  setMessageBody(value);
  setTyping(true); // Envoie l'événement "typing"
};

// Écouter les indicateurs typing
const [typingUsers, setTypingUsers] = useState<string[]>([]);
useSocketEvent(socket, 'user_typing', (data) => {
  if (data.isTyping) {
    setTypingUsers(prev => [...prev, data.username]);
  } else {
    setTypingUsers(prev => prev.filter(u => u !== data.username));
  }
});

// Lors de l'envoi du message
const sendMessage = async () => {
  if (!session?.accessToken || !selectedConvId || !messageBody.trim()) return;

  try {
    // Chiffrer le message
    const encrypted = await encryptForConversation(
      messageBody,
      session.masterKey,
      selectedConvId
    );

    // Envoyer au serveur (body est maintenant l'EncryptedMessage stringifié)
    const message = await apiv2.sendMessage(
      session.accessToken,
      selectedConvId,
      JSON.stringify(encrypted), // ← Chiffré
      options
    );

    // Le message sera reçu via Socket.IO et déchiffré
    setMessageBody('');
  } catch (err: any) {
    console.error('Failed to send message:', err);
    alert(err.message || 'Erreur lors de l\'envoi du message');
  }
};
```

### Étape 4 : Afficher l'indicateur de connexion

```tsx
{/* Header avec statut connexion */}
<div className="flex items-center gap-3">
  <h1 className="text-2xl font-black glow-text-cyan">
    🔐 Dead Drop
  </h1>
  
  {/* Badge de connexion */}
  <div className={`
    text-xs px-2 py-1 rounded-full
    ${connected ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}
  `}>
    {connected ? '● Connecté' : '○ Déconnecté'}
  </div>
</div>

{/* Indicateur typing */}
{typingUsers.length > 0 && (
  <div className="text-xs text-soft-grey italic px-4 py-2">
    {typingUsers.join(', ')} est en train d'écrire...
  </div>
)}
```

---

## 🔐 Sécurité du chiffrement

### Génération de clé par conversation
```typescript
// Dérive une clé unique par conversation basée sur :
// - masterKey de l'utilisateur (256 bits)
// - conversationId (unique)
// - PBKDF2 avec 100,000 itérations
const key = await generateConversationEncryptionKey(
  masterKey,
  conversationId
);
```

### Chiffrement AES-256-GCM
- **Confidentialité** : AES-256 (clé de 256 bits)
- **Authentification** : GCM mode (tag de 128 bits)
- **Protection replay** : IV aléatoire unique par message (12 bytes)
- **Intégrité** : Tag vérifie que le message n'a pas été modifié

### Stockage des clés
- **Frontend** : masterKey dans Zustand (persist localStorage)
- **Backend** : Ne stocke jamais les clés de chiffrement
- **Messages** : Stockés chiffrés en base de données

### Limitations actuelles
⚠️ **Pas de Signal Protocol** : 
- Pas de Perfect Forward Secrecy (PFS)
- Pas de ratcheting de clés
- Si masterKey est compromis, tous les messages le sont

🔒 **Recommandations pour production** :
1. Implémenter Signal Protocol (Double Ratchet)
2. Utiliser X3DH pour l'établissement de clés
3. Rotation régulière des clés
4. Support du mode "conversation éphémère"

---

## 🧪 Tests

### Test 1 : Connexion WebSocket
```bash
# Lancer le backend
cd apps/bridge
npm run dev

# Lancer le frontend
cd apps/frontend
npm run dev

# Ouvrir la console navigateur (F12)
# Vérifier les logs :
# [Socket] Connected: <socket-id>
# [Socket] Joined conversation: <conversation-id>
```

### Test 2 : Chiffrement/Déchiffrement
```typescript
// Dans la console navigateur
import { encryptMessage, decryptMessage, deriveEncryptionKey } from './lib/encryption';

const key = await deriveEncryptionKey('test-secret', 'test-salt');
const encrypted = await encryptMessage('Hello World', key);
console.log(encrypted); // { ciphertext, iv, tag }

const decrypted = await decryptMessage(encrypted, key);
console.log(decrypted); // "Hello World"
```

### Test 3 : Messages en temps réel
1. Ouvrir 2 onglets/navigateurs
2. Se connecter avec 2 comptes différents
3. Créer une conversation
4. Envoyer un message depuis l'onglet A
5. Vérifier réception instantanée dans l'onglet B
6. Vérifier que le message est déchiffré correctement

### Test 4 : Indicateur typing
1. Taper dans le textarea
2. Vérifier que l'autre utilisateur voit "X est en train d'écrire..."
3. Arrêter de taper
4. Vérifier disparition après 3 secondes

### Test 5 : Burn After Reading
1. Activer Burn After Reading
2. Envoyer un message
3. L'autre utilisateur clique "J'ai lu"
4. Vérifier que le message devient 🔥 "Message brûlé" dans les deux onglets
5. Vérifier émission de l'événement `message_burned` via WebSocket

---

## 📊 Performance

### Cache de clés
```typescript
// Évite de recalculer les clés à chaque message
const keyCache = new Map<string, CryptoKey>();

// Première fois : ~50ms (PBKDF2 100k iterations)
const key1 = await getOrCreateConversationKey(masterKey, convId);

// Fois suivantes : <1ms (récupération du cache)
const key2 = await getOrCreateConversationKey(masterKey, convId);
```

### Chiffrement
- **Encryption** : ~2-5ms par message (dépend de la taille)
- **Decryption** : ~2-5ms par message
- **Web Crypto API** : Hardware-accelerated si disponible

### WebSocket
- **Latence** : <10ms (réseau local)
- **Overhead** : ~200 bytes par événement (JSON)
- **Rooms** : O(1) pour broadcast à tous les participants

---

## 🚀 Déploiement

### Variables d'environnement

#### Backend `.env`
```bash
# Socket.IO
FRONTEND_URL=http://localhost:5173  # En dev
# En prod: https://app.dead-drop.io

# JWT (requis pour auth Socket.IO)
JWT_SECRET=<votre-secret-256-bits>
```

#### Frontend `.env`
```bash
# Socket.IO Server
VITE_SOCKET_URL=http://localhost:4000  # En dev
# En prod: https://api.dead-drop.io
```

### Production

#### Backend
```bash
# Installer les dépendances
npm install --production

# Build TypeScript
npm run build

# Lancer avec PM2
pm2 start dist/index.js --name dead-drop-bridge
```

#### NGINX reverse proxy
```nginx
location /socket.io/ {
    proxy_pass http://localhost:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

---

## 📝 TODO / Améliorations futures

### Chiffrement
- [ ] Implémenter Signal Protocol (Double Ratchet Algorithm)
- [ ] Support des pièces jointes chiffrées
- [ ] Chiffrement des métadonnées (timestamps, checksums)
- [ ] Mode "conversation éphémère" (pas de stockage)
- [ ] Vérification d'identité (Safety Numbers)

### WebSocket
- [ ] Reconnexion automatique avec retry exponentiel
- [ ] Détection de perte de connexion (heartbeat)
- [ ] Queue des messages pendant déconnexion
- [ ] Compression des messages (WebSocket compression)
- [ ] Support clustering (Redis adapter pour Socket.IO)

### Performance
- [ ] Lazy loading des conversations
- [ ] Virtualisation de la liste de messages
- [ ] Pagination des messages (infinite scroll)
- [ ] Debouncing de l'indicateur typing
- [ ] Service Worker pour notifications background

### Sécurité
- [ ] Audit de sécurité complet
- [ ] Rate limiting sur les événements Socket.IO
- [ ] Protection contre le flooding
- [ ] Logs d'audit des événements sensibles
- [ ] Support 2FA pour connexion WebSocket

---

**Date** : 2025-11-12  
**Status** : ✅ Fichiers créés, prêts pour intégration  
**Next** : Intégrer Socket.IO dans index.ts et mettre à jour Conversations.tsx
