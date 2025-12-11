# 🌐 Architecture P2P DeadDrop - Plan d'Implémentation

## 📋 Vision

Transformer Cipher Pulse en une plateforme de messagerie **100% décentralisée** où :
- ✅ Les messages transitent **directement** entre pairs (WebRTC)
- ✅ Aucun serveur ne stocke ou ne voit les messages
- ✅ La découverte des pairs se fait via DHT (Table de Hachage Distribuée)
- ✅ Le serveur de signalisation est **éphémère** et **anonymisé**
- ✅ L'architecture est résistante à la censure

---

## 🏗️ Architecture Cible

```
┌─────────────────────────────────────────────────────────────┐
│                    ARCHITECTURE P2P                          │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐                              ┌──────────────┐
│   Client A   │◄────── WebRTC Direct ───────►│   Client B   │
│  (Browser)   │        Data Channel          │  (Browser)   │
└──────┬───────┘                              └──────┬───────┘
       │                                              │
       │         ┌─────────────────────┐            │
       └────────►│  Signaling Server   │◄───────────┘
                 │   (Éphémère/Tor)    │
                 └─────────────────────┘
                           │
                           ▼
                 ┌─────────────────────┐
                 │   DHT Network       │
                 │  (Peer Discovery)   │
                 │   libp2p / GUN.js   │
                 └─────────────────────┘
```

---

## 🎯 Composants Principaux

### 1. WebRTC Data Channels (Communication P2P)
**Rôle:** Transport direct des messages chiffrés entre pairs

**Caractéristiques:**
- ✅ Connexion directe peer-to-peer
- ✅ Chiffrement natif (DTLS/SRTP)
- ✅ Faible latence
- ✅ Pas de serveur intermédiaire

**Stack Technique:**
- `simple-peer` ou `peerjs` pour simplifier WebRTC
- `libp2p` pour une solution complète P2P

### 2. DHT (Distributed Hash Table)
**Rôle:** Découverte des pairs sans serveur central

**Caractéristiques:**
- ✅ Réseau décentralisé de nœuds
- ✅ Chaque utilisateur = un nœud
- ✅ Recherche distribuée par hash d'identité

**Stack Technique:**
- **Option A:** `libp2p` (protocole IPFS)
  - DHT Kademlia intégrée
  - Support multi-transport
  - Mature et éprouvé
  
- **Option B:** `GUN.js`
  - Base de données décentralisée
  - Synchronisation temps réel
  - Plus simple à intégrer

- **Option C:** `OrbitDB` (sur IPFS)
  - Base de données P2P
  - CRDTs pour la cohérence

### 3. Serveur de Signalisation (Minimal)
**Rôle:** Faciliter l'établissement initial de la connexion WebRTC

**Caractéristiques:**
- ✅ Échange des SDP (Session Description Protocol)
- ✅ Échange des ICE candidates
- ✅ Connexion fermée après établissement P2P
- ✅ Anonymisé via Tor (optionnel)

**Stack Technique:**
- WebSocket simple (Socket.io)
- Serveur léger (Node.js + Fastify)
- Support Tor Hidden Service

---

## 📦 Stack Technique Recommandée

### Frontend (Client P2P)
```typescript
// Core P2P
- libp2p-js          // Framework P2P complet
- simple-peer        // WebRTC simplifié
- gun               // Base de données décentralisée (alternative)

// Crypto (existant)
- @noble/curves     // Cryptographie courbes elliptiques
- @noble/hashes     // Fonctions de hachage

// Storage local
- IndexedDB         // Stockage messages locaux
- localForage       // Abstraction IndexedDB
```

### Backend (Signaling Server)
```typescript
// Minimal signaling
- fastify           // Serveur HTTP léger
- socket.io         // WebSocket pour signaling
- tor-request       // Support Tor (optionnel)

// Bootstrap DHT
- libp2p-bootstrap  // Nœuds d'entrée DHT
```

---

## 🔄 Migration Progressive

### Phase 1: Hybrid (Actuel → P2P)
**Objectif:** Ajouter P2P sans casser l'existant

```
┌─────────────────────────────────────────┐
│  Mode Hybrid (Transition)              │
├─────────────────────────────────────────┤
│  ✅ WebSocket (existant) pour fallback │
│  ✅ WebRTC P2P pour pairs en ligne     │
│  ✅ API REST pour métadonnées          │
└─────────────────────────────────────────┘
```

**Implémentation:**
1. Garder l'architecture actuelle
2. Ajouter couche P2P optionnelle
3. Détecter si pair est en ligne → WebRTC
4. Sinon → WebSocket classique

### Phase 2: P2P First
**Objectif:** P2P par défaut, serveur en fallback

```
┌─────────────────────────────────────────┐
│  Mode P2P First                        │
├─────────────────────────────────────────┤
│  ✅ WebRTC P2P (prioritaire)           │
│  ⚠️  WebSocket (fallback uniquement)   │
│  ⚠️  API REST (bootstrap DHT)          │
└─────────────────────────────────────────┘
```

### Phase 3: Full P2P (Cible)
**Objectif:** 100% décentralisé

```
┌─────────────────────────────────────────┐
│  Mode Full P2P (DeadDrop)              │
├─────────────────────────────────────────┤
│  ✅ WebRTC P2P uniquement              │
│  ✅ DHT pour découverte                │
│  ✅ Signaling éphémère/Tor             │
│  ❌ Pas de serveur central             │
└─────────────────────────────────────────┘
```

---

## 🛠️ Plan d'Implémentation Détaillé

### Étape 1: Proof of Concept (PoC)
**Durée:** 1-2 semaines

**Objectifs:**
- [ ] Établir connexion WebRTC entre 2 clients
- [ ] Envoyer message chiffré via Data Channel
- [ ] Tester signaling server minimal

**Fichiers à créer:**
```
apps/frontend/src/lib/p2p/
├── webrtc.ts           # Gestion WebRTC
├── signaling.ts        # Client signaling
└── crypto-p2p.ts       # Chiffrement P2P

apps/bridge/src/signaling/
├── server.ts           # Serveur signaling minimal
└── types.ts            # Types signaling
```

### Étape 2: DHT Integration
**Durée:** 2-3 semaines

**Objectifs:**
- [ ] Intégrer libp2p ou GUN.js
- [ ] Implémenter découverte de pairs
- [ ] Gérer identités décentralisées

**Fichiers à créer:**
```
apps/frontend/src/lib/p2p/
├── dht.ts              # Client DHT
├── peer-discovery.ts   # Découverte pairs
└── identity.ts         # Identité décentralisée
```

### Étape 3: Message Routing P2P
**Durée:** 2-3 semaines

**Objectifs:**
- [ ] Router messages via WebRTC
- [ ] Gérer pairs offline (store & forward)
- [ ] Implémenter accusés de réception

**Fichiers à créer:**
```
apps/frontend/src/lib/p2p/
├── router.ts           # Routage messages
├── store-forward.ts    # Messages différés
└── ack.ts              # Accusés réception
```

### Étape 4: Anonymisation & Tor
**Durée:** 1-2 semaines

**Objectifs:**
- [ ] Intégrer Tor pour signaling
- [ ] Masquer IPs des utilisateurs
- [ ] Serveurs signaling communautaires

**Fichiers à créer:**
```
apps/bridge/src/signaling/
├── tor-service.ts      # Hidden service Tor
└── community-nodes.ts  # Nœuds communautaires
```

### Étape 5: Migration & Tests
**Durée:** 2-3 semaines

**Objectifs:**
- [ ] Migrer utilisateurs existants
- [ ] Tests de charge P2P
- [ ] Documentation utilisateur

---

## 🔐 Sécurité P2P

### Chiffrement End-to-End
```typescript
// Chaque message P2P est chiffré avec la clé du destinataire
const encryptedMessage = await encryptForPeer(
  message,
  recipientPublicKey,
  senderPrivateKey
);

// Envoi via WebRTC Data Channel
dataChannel.send(JSON.stringify(encryptedMessage));
```

### Authentification des Pairs
```typescript
// Signature du message avec clé privée
const signature = await signMessage(message, privateKey);

// Vérification par le destinataire
const isValid = await verifySignature(
  message,
  signature,
  senderPublicKey
);
```

### Protection contre les attaques

**1. Man-in-the-Middle (MITM)**
- ✅ WebRTC utilise DTLS (chiffrement natif)
- ✅ Vérification des fingerprints SDP
- ✅ Signatures cryptographiques

**2. Sybil Attack (faux pairs)**
- ✅ Proof-of-Work pour rejoindre DHT
- ✅ Réputation des pairs
- ✅ Web of Trust

**3. Eclipse Attack (isolation)**
- ✅ Connexion à plusieurs nœuds DHT
- ✅ Diversité géographique
- ✅ Nœuds de confiance

---

## 📊 Comparaison Architecture

| Critère | Actuel (Client-Serveur) | P2P (Cible) |
|---------|------------------------|-------------|
| **Latence** | ~50-200ms | ~10-50ms |
| **Scalabilité** | Limitée par serveur | Illimitée |
| **Censure** | Vulnérable | Résistant |
| **Coût serveur** | Élevé | Minimal |
| **Offline** | Messages perdus | Store & Forward |
| **Anonymat** | IP visible serveur | IP masquée (Tor) |
| **Complexité** | Simple | Élevée |

---

## 🚀 Quick Start - PoC

### 1. Installer les dépendances
```bash
cd apps/frontend
npm install simple-peer socket.io-client

cd apps/bridge
npm install socket.io
```

### 2. Créer le serveur de signaling
```typescript
// apps/bridge/src/signaling/server.ts
import { Server } from 'socket.io';

const io = new Server(3001, {
  cors: { origin: '*' }
});

io.on('connection', (socket) => {
  console.log('Peer connected:', socket.id);
  
  // Relay signaling messages
  socket.on('signal', (data) => {
    io.to(data.to).emit('signal', {
      from: socket.id,
      signal: data.signal
    });
  });
  
  socket.on('disconnect', () => {
    console.log('Peer disconnected:', socket.id);
  });
});
```

### 3. Créer le client WebRTC
```typescript
// apps/frontend/src/lib/p2p/webrtc.ts
import SimplePeer from 'simple-peer';
import io from 'socket.io-client';

export class P2PConnection {
  private peer: SimplePeer.Instance;
  private socket: any;
  
  constructor(initiator: boolean) {
    this.socket = io('http://localhost:3001');
    
    this.peer = new SimplePeer({
      initiator,
      trickle: false
    });
    
    this.peer.on('signal', (signal) => {
      this.socket.emit('signal', { signal });
    });
    
    this.peer.on('data', (data) => {
      console.log('Received:', data.toString());
    });
    
    this.socket.on('signal', (data: any) => {
      this.peer.signal(data.signal);
    });
  }
  
  send(message: string) {
    this.peer.send(message);
  }
}
```

### 4. Utiliser dans un composant
```typescript
// apps/frontend/src/screens/P2PChat.tsx
import { P2PConnection } from '../lib/p2p/webrtc';

function P2PChat() {
  const [p2p, setP2p] = useState<P2PConnection | null>(null);
  
  const connect = () => {
    const connection = new P2PConnection(true);
    setP2p(connection);
  };
  
  const sendMessage = () => {
    p2p?.send('Hello P2P!');
  };
  
  return (
    <div>
      <button onClick={connect}>Connect P2P</button>
      <button onClick={sendMessage}>Send Message</button>
    </div>
  );
}
```

---

## 📚 Ressources & Documentation

### Bibliothèques P2P
- **libp2p:** https://libp2p.io/
- **GUN.js:** https://gun.eco/
- **simple-peer:** https://github.com/feross/simple-peer
- **PeerJS:** https://peerjs.com/

### Protocoles
- **WebRTC:** https://webrtc.org/
- **Kademlia DHT:** https://en.wikipedia.org/wiki/Kademlia
- **IPFS:** https://ipfs.io/

### Sécurité
- **Tor Hidden Services:** https://community.torproject.org/onion-services/
- **WebRTC Security:** https://webrtc-security.github.io/

---

## ⚠️ Défis & Limitations

### 1. NAT Traversal
**Problème:** Certains utilisateurs derrière NAT strict ne peuvent pas établir de connexion directe

**Solutions:**
- ✅ STUN servers (découverte IP publique)
- ✅ TURN servers (relay en dernier recours)
- ✅ UPnP/NAT-PMP (ouverture automatique ports)

### 2. Pairs Offline
**Problème:** Impossible d'envoyer message si destinataire offline

**Solutions:**
- ✅ Store & Forward via pairs intermédiaires
- ✅ Mailbox décentralisée (DHT)
- ✅ Serveur de stockage temporaire (optionnel)

### 3. Découverte Initiale
**Problème:** Comment trouver le premier pair ?

**Solutions:**
- ✅ Bootstrap nodes (liste hardcodée)
- ✅ DNS seeds
- ✅ Serveur de découverte minimal

### 4. Performance Mobile
**Problème:** WebRTC consomme batterie et bande passante

**Solutions:**
- ✅ Mode économie d'énergie
- ✅ Compression des données
- ✅ Connexions sélectives

---

## 🎯 Roadmap

### Q1 2025: PoC & Foundations
- [ ] PoC WebRTC fonctionnel
- [ ] Serveur signaling minimal
- [ ] Tests 2 pairs

### Q2 2025: DHT & Multi-Peers
- [ ] Intégration libp2p/GUN
- [ ] Découverte de pairs
- [ ] Tests 10+ pairs

### Q3 2025: Production Ready
- [ ] Store & Forward
- [ ] Tor integration
- [ ] Migration utilisateurs

### Q4 2025: Full P2P
- [ ] Suppression serveur central
- [ ] Nœuds communautaires
- [ ] Audit sécurité

---

## 💡 Recommandations

### Pour Démarrer Rapidement
1. **Commencer par simple-peer** (plus simple que libp2p)
2. **Garder l'architecture actuelle** en parallèle
3. **Tester avec 2-3 utilisateurs** avant de scaler
4. **Documenter chaque étape** pour la communauté

### Pour la Production
1. **Utiliser libp2p** (plus robuste et mature)
2. **Implémenter TURN servers** (fallback NAT)
3. **Ajouter Tor** pour anonymat
4. **Tests de charge** avec 100+ pairs

### Pour la Sécurité
1. **Audit cryptographie** par expert
2. **Pen-testing** du réseau P2P
3. **Bug bounty** pour la communauté
4. **Documentation sécurité** complète

---

## 📞 Support & Communauté

Pour implémenter cette architecture, je recommande :

1. **Créer un canal Discord/Matrix** pour les développeurs P2P
2. **Documenter l'API P2P** pour contributions externes
3. **Organiser des hackathons** pour accélérer le développement
4. **Collaborer avec projets existants** (Briar, Session, Matrix)

---

**Prêt à construire le futur de la messagerie décentralisée !** 🚀

**Prochaine étape:** Voulez-vous que je commence par créer le PoC WebRTC ?
