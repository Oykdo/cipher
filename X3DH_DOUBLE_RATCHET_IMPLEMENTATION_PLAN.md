# Plan d'Implémentation X3DH + Double Ratchet

## Table des Matières

1. [Résumé Exécutif](#1-résumé-exécutif)
2. [Analyse de l'État Actuel](#2-analyse-de-létat-actuel)
3. [Diagnostic des Problèmes](#3-diagnostic-des-problèmes)
4. [Architecture Cible](#4-architecture-cible)
5. [Plan d'Exécution Détaillé](#5-plan-dexécution-détaillé)
6. [Spécifications Techniques](#6-spécifications-techniques)
7. [Stratégie de Test](#7-stratégie-de-test)
8. [Plan de Rollback](#8-plan-de-rollback)
9. [Estimation et Risques](#9-estimation-et-risques)

---

## 1. Résumé Exécutif

### Objectif
Implémenter un système de chiffrement E2EE robuste utilisant le protocole X3DH (Extended Triple Diffie-Hellman) pour l'établissement de sessions, suivi du protocole Double Ratchet pour la communication avec Perfect Forward Secrecy (PFS).

### État Actuel
- ✅ Implémentation X3DH existante (`x3dh.ts`, `x3dhManager.ts`)
- ✅ Implémentation Double Ratchet existante (`doubleRatchet.ts`)
- ❌ **Problème critique**: Les sessions sont créées indépendamment sans handshake synchronisé
- ❌ Résultat: Désynchronisation permanente et échecs de déchiffrement
- 🔄 Solution temporaire: NaCl Box forcé (stateless, fiable)

### Bénéfices de l'Implémentation Correcte
| Fonctionnalité | NaCl Box (actuel) | Double Ratchet (cible) |
|----------------|-------------------|------------------------|
| Perfect Forward Secrecy | ❌ Non | ✅ Oui |
| Future Secrecy | ❌ Non | ✅ Oui |
| Protection si clé compromise | ❌ Tous les messages exposés | ✅ 1 seul message exposé |
| Auto-guérison après attaque | ❌ Non | ✅ Oui |
| Complexité | Simple | Moyenne |

---

## 2. Analyse de l'État Actuel

### 2.1 Fichiers Existants

#### Frontend (`apps/frontend/src/lib/e2ee/`)

| Fichier | Description | État |
|---------|-------------|------|
| `x3dh.ts` | Protocole X3DH complet | ✅ Implémenté |
| `x3dhManager.ts` | Orchestration du handshake | ⚠️ Partiel |
| `doubleRatchet.ts` | Algorithme Double Ratchet | ✅ Implémenté |
| `sessionManager.ts` | Gestion des sessions E2EE | ⚠️ NaCl Box forcé |
| `e2eeService.ts` | API de haut niveau | ⚠️ X3DH non intégré |
| `messagingIntegration.ts` | Intégration avec le chat | ✅ Fonctionnel |
| `keyManagement.ts` | Gestion des clés d'identité | ✅ Fonctionnel |
| `decryptedMessageCache.ts` | Cache des messages déchiffrés | ✅ Fonctionnel |

#### Backend (`apps/bridge/src/`)

| Fichier | Description | État |
|---------|-------------|------|
| `routes/e2ee.ts` | Endpoints API E2EE | ✅ Implémenté |
| `websocket/socketServer.ts` | Handler WebSocket x3dh_handshake | ✅ Implémenté |
| `db/database.js` | Requêtes e2ee_key_bundles | ✅ Implémenté |

### 2.2 Analyse du Code Existant

#### x3dh.ts - Points Clés

```typescript
// Génération des clés X25519 (correcte)
export function generateX25519KeyPair(): { publicKey: Uint8Array; privateKey: Uint8Array }

// Génération Signed Pre-Key avec signature HMAC
export async function generateSignedPreKey(identityPrivateKey: Uint8Array, id: number): Promise<SignedPreKey>

// Génération batch de One-Time Pre-Keys
export function generateOneTimePreKeys(startId: number, count: number): OneTimePreKey[]

// Calcul du secret partagé (Initiateur - Alice)
export async function x3dhInitiator(
  myIdentityPrivateKey: Uint8Array,      // IK_A
  myEphemeralPrivateKey: Uint8Array,     // EK_A
  peerIdentityKey: Uint8Array,           // IK_B
  peerSignedPreKey: Uint8Array,          // SPK_B
  peerOneTimePreKey?: Uint8Array         // OPK_B (optionnel)
): Promise<Uint8Array>
// Formule: DH1=DH(IK_A, SPK_B) || DH2=DH(EK_A, IK_B) || DH3=DH(EK_A, SPK_B) || DH4=DH(EK_A, OPK_B)

// Calcul du secret partagé (Répondeur - Bob)
export async function x3dhResponder(
  myIdentityPrivateKey: Uint8Array,      // IK_B
  mySignedPreKeyPrivate: Uint8Array,     // SPK_B private
  myOneTimePreKeyPrivate: Uint8Array | undefined, // OPK_B private
  peerIdentityKey: Uint8Array,           // IK_A
  peerEphemeralKey: Uint8Array           // EK_A
): Promise<Uint8Array>
```

**Observations:**
- ✅ Implémentation mathématique correcte du X3DH
- ✅ Support des One-Time Pre-Keys
- ❌ **CORRECTION REQUISE**: Signature avec HMAC au lieu de Ed25519 (non-conforme au standard Signal)
- ⚠️ Pas de validation du timestamp des messages

> **CORRECTION CRITIQUE - Utiliser Ed25519 pour les signatures SPK:**
> ```typescript
> // Dans x3dh.ts - Remplacer la fonction de signature
> export async function generateSignedPreKey(
>   identityPrivateKey: Uint8Array, 
>   id: number
> ): Promise<SignedPreKey> {
>   const keyPair = generateX25519KeyPair();
>   
>   // CORRECTION: Utiliser Ed25519 au lieu de HMAC pour la signature
>   const signature = sodium.crypto_sign_detached(
>     keyPair.publicKey,
>     identityPrivateKey
>   );
>   
>   return {
>     id,
>     publicKey: keyPair.publicKey,
>     privateKey: keyPair.privateKey,
>     signature: signature,
>     timestamp: Date.now(),
>   };
> }
> 
> // Et la fonction de vérification correspondante
> export function verifySignedPreKey(
>   signedPreKey: { id: number; publicKey: Uint8Array; signature: Uint8Array },
>   identityKey: Uint8Array
> ): boolean {
>   return sodium.crypto_sign_verify_detached(
>     signedPreKey.signature,
>     signedPreKey.publicKey,
>     identityKey
>   );
> }
> ```
> 
> **Note**: Cela nécessite que les identity keys soient des paires Ed25519 (pour signature) ET X25519 (pour DH). Signal utilise des clés Ed25519 converties en X25519 pour le DH.

#### doubleRatchet.ts - Points Clés

```typescript
export interface RatchetState {
  DHs: Uint8Array;           // Clé privée DH actuelle
  DHs_pub: Uint8Array;       // Clé publique DH (STOCKÉE, pas recalculée)
  DHr: Uint8Array | null;    // Clé publique DH du peer
  RK: Uint8Array;            // Root Key
  CKs: Uint8Array;           // Chain Key d'envoi
  Ns: number;                // Compteur de messages envoyés
  CKr: Uint8Array;           // Chain Key de réception
  Nr: number;                // Compteur de messages reçus
  skippedKeys: Map<string, Uint8Array>; // Clés pour messages hors-ordre
  peerUsername: string;
  lastUpdate: number;
}

// Initialisation côté Alice (initiateur)
export function initializeAlice(
  sharedSecret: Uint8Array,
  bobPublicKey: Uint8Array,
  peerUsername: string
): RatchetState

// Initialisation côté Bob (répondeur)
export function initializeBob(
  sharedSecret: Uint8Array,
  myPrivateKey: Uint8Array,
  peerUsername: string
): RatchetState
```

**Observations:**
- ✅ Implémentation Double Ratchet conforme à la spécification Signal
- ✅ Support des messages hors-ordre (skipped keys)
- ✅ Fix du stockage de DHs_pub (correction récente)
- ⚠️ MAX_SKIP = 1000 (peut être élevé pour certains cas)

#### sessionManager.ts - Problème Critique

```typescript
// PROBLÈME: Les sessions sont créées INDÉPENDAMMENT
export async function getOrCreateSession(
  myUsername: string,
  peerUsername: string,
  myPrivateKey: Uint8Array,
  peerPublicKey: Uint8Array
): Promise<E2EESession> {
  // ...
  // Si useDoubleRatchet est true:
  // Alice et Bob créent chacun leur session avec initializeAlice/initializeBob
  // MAIS ils n'ont PAS le même sharedSecret !
  // -> DÉSYNCHRONISATION GARANTIE
}
```

**Cause Racine de la Désynchronisation:**

```
PROBLÈME ACTUEL:
                    
  Alice                         Bob
    |                            |
    |-- Crée session localement ---|
    |   sharedSecret = DH(A, B)  |
    |                            |
    |                            |-- Crée session localement
    |                            |   sharedSecret = DH(B, A)
    |                            |
    |                            |   ❌ MAIS sans X3DH handshake,
    |                            |   les clés éphémères sont différentes!
    |                            |
    |-- Message chiffré -------->|
    |                            |   ❌ Bob ne peut pas déchiffrer
    |                            |   car il n'a pas la même clé!
```

---

## 3. Diagnostic des Problèmes

### 3.1 Problème Principal: Absence de Handshake Synchronisé

**Symptôme:** `ciphertext cannot be decrypted using that key`

**Cause:** Les deux parties créent leurs sessions indépendamment:
1. Alice génère une clé éphémère `EK_A`
2. Bob ne connaît JAMAIS `EK_A` car il n'y a pas de message HANDSHAKE_INIT
3. Bob crée sa propre session avec ses propres clés
4. Les `sharedSecret` calculés sont différents → échec de déchiffrement

### 3.2 Problèmes Secondaires

| Problème | Impact | Priorité |
|----------|--------|----------|
| X3DH non déclenché automatiquement | DR inutilisable | Critique |
| Pas de retry offline | Handshake échoue si peer offline | Haute |
| Pas de persistence du handshake state | Perte de session au reload | Haute |
| OPKs non replenished automatiquement | Épuisement des OPKs | Moyenne |
| Pas de UI pour statut handshake | UX confuse | Basse |

### 3.3 Flux Actuel vs Flux Cible

**Flux Actuel (Cassé):**
```
1. Alice veut envoyer un message à Bob
2. Alice regarde si session existe → NON
3. Alice crée session localement avec initializeAlice()
4. Alice envoie message chiffré
5. Bob reçoit message
6. Bob crée session localement avec initializeBob()
7. Bob essaie de déchiffrer → ÉCHEC (clés différentes)
```

**Flux Cible (Correct):**
```
1. Alice veut envoyer un message à Bob
2. Alice regarde si session DR existe → NON
3. Alice initie handshake X3DH:
   a. Alice récupère KeyBundle de Bob (identityKey, SPK, OPK)
   b. Alice génère ephemeralKey
   c. Alice calcule sharedSecret avec x3dhInitiator()
   d. Alice envoie HANDSHAKE_INIT via WebSocket
4. Bob reçoit HANDSHAKE_INIT
   a. Bob extrait identityKey_A et ephemeralKey_A
   b. Bob retrouve sa SPK et OPK privées
   c. Bob calcule sharedSecret avec x3dhResponder()
   d. Bob envoie HANDSHAKE_ACK
5. Alice reçoit HANDSHAKE_ACK
   a. Alice marque session comme ACTIVE
6. Alice et Bob ont maintenant le MÊME sharedSecret
7. Alice envoie message avec Double Ratchet → Bob peut déchiffrer ✅
```

---

## 4. Architecture Cible

### 4.1 Diagramme de Séquence X3DH Complet

```
┌───────┐                    ┌──────────┐                    ┌───────┐
│ Alice │                    │  Server  │                    │  Bob  │
└───┬───┘                    └────┬─────┘                    └───┬───┘
    │                             │                              │
    │  [PRÉ-REQUIS: Bob a publié son KeyBundle]                  │
    │                             │                              │
    │  1. GET /e2ee/consume-opk/bob                              │
    │  ─────────────────────────>│                              │
    │                             │                              │
    │  2. KeyBundle + OPK consommée                              │
    │  <─────────────────────────│                              │
    │                             │                              │
    │  3. Calcul sharedSecret     │                              │
    │     (x3dhInitiator)         │                              │
    │                             │                              │
    │  4. WebSocket: x3dh_handshake(INIT)                        │
    │  ─────────────────────────>│                              │
    │                             │  5. Forward INIT             │
    │                             │  ───────────────────────────>│
    │                             │                              │
    │                             │     6. Calcul sharedSecret   │
    │                             │        (x3dhResponder)       │
    │                             │                              │
    │                             │  7. WebSocket: x3dh_handshake(ACK)
    │                             │  <───────────────────────────│
    │  8. Forward ACK             │                              │
    │  <─────────────────────────│                              │
    │                             │                              │
    │  9. Session DR ACTIVE       │     9. Session DR ACTIVE     │
    │     (initializeAlice)       │        (initializeBob)       │
    │                             │                              │
    │  ═══════════ DOUBLE RATCHET COMMUNICATION ════════════════ │
    │                             │                              │
    │  10. ratchetEncrypt(msg)    │                              │
    │  ─────────────────────────>│  ───────────────────────────>│
    │                             │     11. ratchetDecrypt(msg)  │
    │                             │                              │
```

### 4.2 Architecture des Composants

```
┌─────────────────────────────────────────────────────────────────────┐
│                           FRONTEND                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────┐     ┌───────────────────┐                     │
│  │ Conversations.tsx │────>│ e2eeService.ts    │                     │
│  │ (UI Layer)        │     │ (API Layer)       │                     │
│  └──────────────────┘     └─────────┬─────────┘                     │
│                                      │                               │
│           ┌──────────────────────────┼──────────────────────────┐   │
│           │                          │                          │   │
│           v                          v                          v   │
│  ┌─────────────────┐     ┌───────────────────┐     ┌────────────┐   │
│  │ sessionManager  │     │ x3dhManager.ts    │     │ keyMgmt.ts │   │
│  │ (Session CRUD)  │     │ (Handshake Flow)  │     │ (Identity) │   │
│  └────────┬────────┘     └─────────┬─────────┘     └────────────┘   │
│           │                        │                                │
│           v                        v                                │
│  ┌─────────────────┐     ┌───────────────────┐                     │
│  │ doubleRatchet   │     │ x3dh.ts           │                     │
│  │ (DR Algorithm)  │     │ (X3DH Algorithm)  │                     │
│  └─────────────────┘     └───────────────────┘                     │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                        keyVault.ts                            │   │
│  │   (Secure Storage: Identity Keys, Session State, OPKs)        │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                         TRANSPORT LAYER                              │
│  ┌────────────────────┐              ┌────────────────────┐         │
│  │ useX3DHHandshake   │              │ useSocket          │         │
│  │ (Handshake Events) │              │ (Message Events)   │         │
│  └─────────┬──────────┘              └─────────┬──────────┘         │
│            │                                   │                     │
│            └─────────────┬─────────────────────┘                    │
│                          v                                           │
│                  ┌──────────────┐                                   │
│                  │ Socket.IO    │                                   │
│                  └──────────────┘                                   │
│                          │                                           │
└──────────────────────────│───────────────────────────────────────────┘
                           │
                           v
┌─────────────────────────────────────────────────────────────────────┐
│                           BACKEND                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────┐              ┌────────────────────┐         │
│  │ socketServer.ts    │              │ e2ee.ts (routes)   │         │
│  │ - x3dh_handshake   │              │ - publish-keys     │         │
│  │ - forward to peer  │              │ - consume-opk      │         │
│  └────────────────────┘              │ - replenish-opks   │         │
│                                      └──────────┬─────────┘         │
│                                                 │                    │
│                          ┌──────────────────────┘                   │
│                          v                                           │
│                  ┌──────────────────┐                               │
│                  │ database.js      │                               │
│                  │ e2ee_key_bundles │                               │
│                  └──────────────────┘                               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.3 États du Handshake

```
                    ┌────────────┐
                    │    IDLE    │
                    └──────┬─────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
            v              │              v
    ┌───────────────┐      │      ┌───────────────┐
    │  INIT_SENT    │      │      │ INIT_RECEIVED │
    │  (Alice)      │      │      │ (Bob)         │
    └───────┬───────┘      │      └───────┬───────┘
            │              │              │
            │    RECEIVE   │    SEND      │
            │    ACK       │    ACK       │
            │              │              │
            v              v              v
    ┌─────────────────────────────────────────┐
    │                 ACTIVE                   │
    │    (Double Ratchet communication OK)    │
    └─────────────────────────────────────────┘
                           │
                           │ ERROR / TIMEOUT
                           v
                    ┌────────────┐
                    │   FAILED   │
                    └────────────┘
```

---

## 5. Plan d'Exécution Détaillé

### Phase 1: Préparation et Nettoyage (1 jour)

#### 1.1 Nettoyage du Code Existant

**Fichier: `sessionManager.ts`**
```typescript
// SUPPRIMER: Logique de création de session DR sans handshake
// MODIFIER: getOrCreateSession() pour NE PAS créer de session DR automatiquement
// AJOUTER: Fonction pour créer session DR UNIQUEMENT après handshake X3DH réussi

export async function createDRSessionFromHandshake(
  myUsername: string,
  peerUsername: string,
  sharedSecret: Uint8Array,
  ratchetState: RatchetState
): Promise<E2EESession>
```

**Fichier: `e2eeService.ts`**
```typescript
// MODIFIER: encryptMessageForPeer() pour:
// 1. Vérifier si session DR existe ET est ACTIVE
// 2. Si non, vérifier préférence utilisateur
// 3. Si DR souhaité mais pas de session → initier handshake X3DH
// 4. Attendre completion du handshake AVANT d'envoyer le message
```

#### 1.2 Ajout de la Table de Sessions X3DH (Backend)

> **⚠️ PRINCIPE DE SÉCURITÉ**: Le serveur ne doit stocker que les informations minimales nécessaires au suivi de l'état du handshake. Toutes les données sensibles (clés privées, états du ratchet) doivent être stockées UNIQUEMENT côté client dans le KeyVault.

**Nouveau fichier: `migrations/004_x3dh_sessions.sql`**
```sql
-- Table côté SERVEUR: stockage MINIMAL pour le suivi d'état uniquement
-- Les données sensibles sont stockées côté client dans KeyVault
CREATE TABLE IF NOT EXISTS x3dh_sessions (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    peer_username VARCHAR(255) NOT NULL,
    state VARCHAR(20) NOT NULL DEFAULT 'IDLE',
    -- IDLE, INIT_SENT, INIT_RECEIVED, ACTIVE, FAILED
    
    -- Seulement les timestamps et compteurs de retry
    -- PAS de clés privées, PAS d'états de session !
    initiated_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    last_retry_at TIMESTAMP WITH TIME ZONE,
    retry_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, peer_username),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_x3dh_sessions_user ON x3dh_sessions(user_id);
CREATE INDEX idx_x3dh_sessions_state ON x3dh_sessions(state);
```

**Stockage côté CLIENT (KeyVault) - Données sensibles:**
```typescript
// Dans x3dhSessionStore.ts
export interface ClientSideX3DHSession {
  peerUsername: string;
  state: HandshakeState;
  
  // Clés éphémères (JAMAIS envoyées au serveur)
  ephemeralKeyPair?: {
    publicKey: string; // base64
    privateKey: string; // base64, chiffré par master key
  };
  
  // Données du peer (reçues via handshake, pas le serveur)
  peerIdentityKey?: string;
  peerEphemeralKey?: string;
  usedOPKId?: number;
  
  // Nonces pour replay protection
  initNonce?: string;
  
  // Secret partagé dérivé (JAMAIS envoyé au serveur)
  sharedSecret?: string; // base64, chiffré
  
  // État Double Ratchet complet (JAMAIS envoyé au serveur)
  ratchetState?: string; // JSON, chiffré
  
  // Timestamps
  initiatedAt?: number;
  completedAt?: number;
}
```

### Phase 2: Refactoring du X3DH Manager (2 jours)

#### 2.1 Nouveau Flow d'Initiation

**Fichier: `x3dhManager.ts`**

```typescript
/**
 * NOUVELLE INTERFACE: Résultat du handshake
 */
export interface X3DHHandshakeResult {
  success: boolean;
  sharedSecret?: Uint8Array;
  ratchetState?: RatchetState;
  error?: string;
}

/**
 * NOUVELLE FONCTION: Initiation complète du handshake X3DH
 * Cette fonction est BLOQUANTE jusqu'à completion ou timeout
 */
export async function performX3DHHandshake(
  peerUsername: string,
  options?: {
    timeout?: number; // default 30s
    retries?: number; // default 3
  }
): Promise<X3DHHandshakeResult> {
  const timeout = options?.timeout ?? 30000;
  const maxRetries = options?.retries ?? 3;
  
  // 1. Vérifier si handshake déjà en cours
  const existing = pendingHandshakes.get(peerUsername);
  if (existing?.session.state === 'INIT_SENT') {
    // Attendre le handshake existant
    return existing.promise;
  }
  
  // 2. Récupérer le KeyBundle du peer
  const peerBundle = await fetchPeerKeyBundle(peerUsername);
  if (!peerBundle) {
    return { success: false, error: 'Peer has no key bundle' };
  }
  
  // 3. Vérifier la signature du SPK
  if (!verifySignedPreKey(peerBundle.signedPreKey, peerBundle.identityKey)) {
    return { success: false, error: 'Invalid SPK signature' };
  }
  
  // 4. Créer le handshake
  return new Promise((resolve) => {
    initiateHandshakeInternal(peerUsername, peerBundle, {
      onSuccess: (sharedSecret, ratchetState) => {
        resolve({ success: true, sharedSecret, ratchetState });
      },
      onFailure: (error) => {
        resolve({ success: false, error: error.message });
      },
      timeout,
      maxRetries,
    });
  });
}

/**
 * NOUVELLE FONCTION: Gestion des messages offline
 * Stocke le handshake pour retry quand le peer revient en ligne
 */
export async function queueOfflineHandshake(
  peerUsername: string,
  initMessage: HandshakeInitMessage
): Promise<void> {
  // Stocker dans IndexedDB pour persistence
  const vault = getExistingKeyVault();
  if (vault) {
    await vault.storeData(`pending_handshake_${peerUsername}`, JSON.stringify({
      initMessage,
      createdAt: Date.now(),
    }));
  }
}
```

#### 2.2 Gestion de l'État Persistant

**Fichier: `x3dhSessionStore.ts` (NOUVEAU)**

```typescript
/**
 * Store pour la persistence des sessions X3DH
 * Utilise KeyVault pour le stockage sécurisé
 */

import { getExistingKeyVault } from '../keyVault';

export interface StoredX3DHSession {
  peerUsername: string;
  state: HandshakeState;
  ephemeralKeyPair?: {
    publicKey: string; // base64
    privateKey: string; // base64 encrypted
  };
  peerIdentityKey?: string;
  peerEphemeralKey?: string;
  usedOPKId?: number;
  initNonce?: string;
  sharedSecret?: string; // base64 encrypted
  ratchetState?: string; // JSON encrypted
  initiatedAt?: number;
  completedAt?: number;
}

export async function saveX3DHSession(session: StoredX3DHSession): Promise<void> {
  const vault = getExistingKeyVault();
  if (!vault) throw new Error('KeyVault not initialized');
  
  await vault.storeData(
    `x3dh_session_${session.peerUsername}`,
    JSON.stringify(session)
  );
}

export async function loadX3DHSession(peerUsername: string): Promise<StoredX3DHSession | null> {
  const vault = getExistingKeyVault();
  if (!vault) return null;
  
  const data = await vault.getData(`x3dh_session_${peerUsername}`);
  if (!data) return null;
  
  return JSON.parse(data);
}

export async function deleteX3DHSession(peerUsername: string): Promise<void> {
  const vault = getExistingKeyVault();
  if (!vault) return;
  
  await vault.deleteData(`x3dh_session_${peerUsername}`);
}
```

#### 2.3 Gestion Automatique des OPKs

> **AMÉLIORATION**: Mécanisme de replenishment automatique des One-Time Pre-Keys pour éviter leur épuisement.

**Fichier: `x3dhManager.ts`**
```typescript
/**
 * Vérifie et replenish les OPKs si nécessaire
 * @param targetCount Nombre cible d'OPKs (default: 100)
 * @param threshold Seuil déclenchant le replenishment (default: 50%)
 */
export async function replenishOPKsIfNeeded(
  targetCount: number = 100,
  threshold: number = 0.5
): Promise<void> {
  if (!localKeyBundle) {
    console.warn('⚠️ [X3DH] Cannot replenish OPKs - manager not initialized');
    return;
  }
  
  const currentCount = localKeyBundle.oneTimePreKeys.length;
  const thresholdCount = Math.floor(targetCount * threshold);
  
  if (currentCount >= thresholdCount) {
    return; // Assez d'OPKs disponibles
  }
  
  const toGenerate = targetCount - currentCount;
  console.log(`🔄 [X3DH] Replenishing ${toGenerate} OPKs (current: ${currentCount}/${targetCount})`);
  
  // Générer de nouvelles OPKs
  const newOPKs = generateOneTimePreKeys(localKeyBundle.nextOPKId, toGenerate);
  
  // Ajouter au bundle local
  localKeyBundle.oneTimePreKeys.push(...newOPKs);
  localKeyBundle.nextOPKId += toGenerate;
  
  // Persister localement
  const vault = getExistingKeyVault();
  if (vault) {
    await vault.storeData('x3dh_local_bundle', serializeLocalKeyBundle(localKeyBundle));
  }
  
  // Publier au serveur
  const { apiv2 } = await import('../../services/api-v2');
  await apiv2.replenishOPKs(newOPKs.map(opk => ({
    id: opk.id,
    publicKey: bytesToBase64(opk.publicKey),
  })));
  
  console.log(`✅ [X3DH] Replenished ${toGenerate} OPKs (new total: ${localKeyBundle.oneTimePreKeys.length})`);
}

/**
 * Appelé après chaque handshake pour maintenir le pool d'OPKs
 */
export async function onOPKConsumed(): Promise<void> {
  await replenishOPKsIfNeeded();
}

/**
 * Vérification périodique des OPKs (appelée par un timer)
 */
export function startOPKReplenishmentTimer(intervalMs: number = 60000): () => void {
  const timerId = setInterval(() => {
    replenishOPKsIfNeeded().catch(err => {
      console.error('❌ [X3DH] OPK replenishment failed:', err);
    });
  }, intervalMs);
  
  return () => clearInterval(timerId);
}
```

#### 2.4 Support des Sessions Multiples

> **AMÉLIORATION**: Permettre plusieurs sessions entre les mêmes utilisateurs (ex: différents appareils).

**Fichier: `sessionManager.ts`**
```typescript
/**
 * Génère un ID de session unique
 * Format: peerUsername ou peerUsername:deviceId pour sessions multiples
 */
function generateSessionKey(peerUsername: string, sessionId?: string): string {
  return sessionId ? `${peerUsername}:${sessionId}` : peerUsername;
}

/**
 * Récupère ou crée une session avec support multi-device
 */
export async function getOrCreateSession(
  myUsername: string,
  peerUsername: string,
  myPrivateKey: Uint8Array,
  peerPublicKey: Uint8Array,
  sessionId?: string // Optionnel, pour les sessions multiples
): Promise<E2EESession> {
  const sessionKey = generateSessionKey(peerUsername, sessionId);
  
  // Chercher session existante avec cette clé
  const existingSession = activeSessions.get(sessionKey);
  if (existingSession) {
    return existingSession;
  }
  
  // Charger depuis le stockage persistant
  const storedSession = await loadSessionFromStorage(myUsername, sessionKey);
  if (storedSession) {
    activeSessions.set(sessionKey, storedSession);
    return storedSession;
  }
  
  // Créer nouvelle session (NaCl Box uniquement sans handshake)
  // Pour DR, utiliser createDRSessionFromHandshake() après X3DH
  return createNaClBoxSession(myUsername, peerUsername, myPrivateKey, peerPublicKey, sessionKey);
}

/**
 * Liste toutes les sessions actives avec un peer
 */
export async function getSessionsWithPeer(peerUsername: string): Promise<E2EESession[]> {
  const sessions: E2EESession[] = [];
  
  for (const [key, session] of activeSessions) {
    if (key === peerUsername || key.startsWith(`${peerUsername}:`)) {
      sessions.push(session);
    }
  }
  
  return sessions;
}
```

### Phase 3: Intégration avec le Chat (2 jours)

#### 3.1 Modification du Flow d'Envoi de Message

**Fichier: `e2eeService.ts`**

```typescript
/**
 * REFACTORED: Encryption avec handshake X3DH automatique
 */
export async function encryptMessageForPeer(
  peerUsername: string,
  message: string
): Promise<EncryptedData> {
  if (!currentUsername || !currentIdentityKeys) {
    throw new Error('E2EE not initialized');
  }

  // 1. Vérifier préférence d'encryption
  const preferDR = getEncryptionModePreference(peerUsername) === 'double-ratchet';
  
  if (!preferDR) {
    // NaCl Box: stateless, toujours disponible
    return encryptWithNaClBox(message, peerUsername);
  }
  
  // 2. Vérifier si session DR existe et est ACTIVE
  const existingSession = await loadX3DHSession(peerUsername);
  
  if (existingSession?.state === 'ACTIVE' && existingSession.ratchetState) {
    // Session DR active, utiliser Double Ratchet
    return encryptWithDoubleRatchet(message, peerUsername, existingSession);
  }
  
  // 3. Pas de session active → initier handshake X3DH
  console.log(`🤝 [E2EE] No active DR session with ${peerUsername}, initiating X3DH...`);
  
  const result = await performX3DHHandshake(peerUsername);
  
  if (!result.success) {
    // Handshake échoué → fallback NaCl Box avec warning
    console.warn(`⚠️ [E2EE] X3DH failed: ${result.error}, falling back to NaCl Box`);
    return encryptWithNaClBox(message, peerUsername);
  }
  
  // 4. Handshake réussi → utiliser Double Ratchet
  return encryptWithDoubleRatchet(message, peerUsername, {
    state: 'ACTIVE',
    peerUsername,
    sharedSecret: bytesToBase64(result.sharedSecret!),
    ratchetState: JSON.stringify(result.ratchetState!),
  });
}
```

#### 3.2 Gestion des Utilisateurs Offline

**Fichier: `offlineHandshakeQueue.ts` (NOUVEAU)**

```typescript
/**
 * Queue pour les handshakes vers utilisateurs offline
 * Retry automatique quand le peer revient en ligne
 */

interface QueuedHandshake {
  peerUsername: string;
  initMessage: HandshakeInitMessage;
  createdAt: number;
  retryCount: number;
}

const offlineQueue = new Map<string, QueuedHandshake>();

// Appelé quand un utilisateur se connecte
export function onUserOnline(username: string): void {
  const queued = offlineQueue.get(username);
  if (queued) {
    console.log(`📤 [X3DH] Retrying queued handshake for ${username}`);
    retryHandshake(queued);
  }
}

// Appelé quand le handshake initial échoue car peer offline
export function queueForRetry(handshake: QueuedHandshake): void {
  offlineQueue.set(handshake.peerUsername, handshake);
  
  // Persister pour survie au reload
  persistQueue();
}

async function retryHandshake(queued: QueuedHandshake): Promise<void> {
  // Re-tenter l'envoi du HANDSHAKE_INIT
  if (sendHandshakeMessageFn) {
    await sendHandshakeMessageFn(
      queued.peerUsername,
      JSON.stringify(queued.initMessage)
    );
  }
}
```

### Phase 4: UI et Feedback Utilisateur (1 jour)

#### 4.1 Indicateur de Statut Handshake

**Fichier: `components/conversations/HandshakeStatus.tsx` (NOUVEAU)**

```tsx
import { useState, useEffect } from 'react';
import { getX3DHStatus } from '../../lib/e2ee/e2eeService';

interface HandshakeStatusProps {
  peerUsername: string;
}

export function HandshakeStatus({ peerUsername }: HandshakeStatusProps) {
  const [status, setStatus] = useState<'idle' | 'handshaking' | 'active' | 'failed'>('idle');
  
  useEffect(() => {
    const interval = setInterval(() => {
      const x3dhStatus = getX3DHStatus(peerUsername);
      if (x3dhStatus) {
        switch (x3dhStatus.state) {
          case 'INIT_SENT':
          case 'INIT_RECEIVED':
            setStatus('handshaking');
            break;
          case 'ACTIVE':
            setStatus('active');
            break;
          case 'FAILED':
            setStatus('failed');
            break;
          default:
            setStatus('idle');
        }
      }
    }, 500);
    
    return () => clearInterval(interval);
  }, [peerUsername]);
  
  if (status === 'idle') return null;
  
  return (
    <div className="flex items-center gap-2 text-xs">
      {status === 'handshaking' && (
        <>
          <span className="animate-pulse">🔄</span>
          <span className="text-yellow-400">Establishing secure session...</span>
        </>
      )}
      {status === 'active' && (
        <>
          <span>🔐</span>
          <span className="text-green-400">Double Ratchet active</span>
        </>
      )}
      {status === 'failed' && (
        <>
          <span>⚠️</span>
          <span className="text-red-400">Handshake failed - using fallback</span>
        </>
      )}
    </div>
  );
}
```

#### 4.2 Toggle Mode avec Warning

**Fichier: `components/conversations/EncryptionModeToggle.tsx` (NOUVEAU)**

```tsx
export function EncryptionModeToggle({ peerUsername, onModeChange }) {
  const [mode, setMode] = useState<'nacl-box' | 'double-ratchet'>('nacl-box');
  const [showWarning, setShowWarning] = useState(false);
  
  const handleToggle = (newMode: typeof mode) => {
    if (newMode === 'double-ratchet') {
      // Afficher warning avant d'activer DR
      setShowWarning(true);
    } else {
      setMode(newMode);
      onModeChange(newMode);
    }
  };
  
  const confirmDR = () => {
    setMode('double-ratchet');
    onModeChange('double-ratchet');
    setShowWarning(false);
  };
  
  return (
    <>
      {/* Toggle UI */}
      
      {showWarning && (
        <Modal onClose={() => setShowWarning(false)}>
          <h3>Enable Double Ratchet?</h3>
          <p>
            Double Ratchet provides Perfect Forward Secrecy but requires
            both users to be online for initial key exchange.
          </p>
          <p className="text-yellow-400">
            ⚠️ If the handshake fails, messages will fall back to NaCl Box.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setShowWarning(false)}>Cancel</button>
            <button onClick={confirmDR}>Enable</button>
          </div>
        </Modal>
      )}
    </>
  );
}
```

### Phase 5: Tests et Validation (2 jours)

#### 5.1 Tests Unitaires

**Fichier: `__tests__/x3dhHandshake.test.ts`**

```typescript
describe('X3DH Handshake', () => {
  describe('Key Agreement', () => {
    it('should compute same shared secret on both sides', async () => {
      // Alice's keys
      const aliceIdentity = generateX25519KeyPair();
      const aliceEphemeral = generateX25519KeyPair();
      
      // Bob's keys
      const bobIdentity = generateX25519KeyPair();
      const bobSPK = await generateSignedPreKey(bobIdentity.privateKey, 1);
      const bobOPKs = generateOneTimePreKeys(1, 1);
      
      // Alice computes shared secret
      const aliceSecret = await x3dhInitiator(
        aliceIdentity.privateKey,
        aliceEphemeral.privateKey,
        bobIdentity.publicKey,
        bobSPK.publicKey,
        bobOPKs[0].publicKey
      );
      
      // Bob computes shared secret
      const bobSecret = await x3dhResponder(
        bobIdentity.privateKey,
        bobSPK.privateKey,
        bobOPKs[0].privateKey,
        aliceIdentity.publicKey,
        aliceEphemeral.publicKey
      );
      
      // Should be identical
      expect(bytesToBase64(aliceSecret)).toBe(bytesToBase64(bobSecret));
    });
    
    it('should work without OPK', async () => {
      // ... test sans One-Time Pre-Key
    });
  });
  
  describe('Handshake Flow', () => {
    it('should complete handshake between two online users', async () => {
      // Mock WebSocket
      // Simulate INIT → ACK flow
      // Verify both have ACTIVE session
    });
    
    it('should queue handshake for offline user', async () => {
      // User B is offline
      // Verify INIT is queued
      // Simulate B coming online
      // Verify handshake completes
    });
    
    it('should timeout after max retries', async () => {
      // User B never comes online
      // Verify failure after 3 retries
      // Verify fallback to NaCl Box
    });
  });
});
```

#### 5.2 Tests d'Intégration

**Fichier: `__tests__/e2eEncryption.integration.test.ts`**

```typescript
describe('E2E Encryption Integration', () => {
  let aliceClient: TestClient;
  let bobClient: TestClient;
  
  beforeAll(async () => {
    aliceClient = await createTestClient('alice');
    bobClient = await createTestClient('bob');
  });
  
  it('should exchange messages with Double Ratchet after X3DH', async () => {
    // 1. Enable DR mode for both
    await aliceClient.setEncryptionMode('double-ratchet');
    await bobClient.setEncryptionMode('double-ratchet');
    
    // 2. Alice sends message (triggers handshake)
    const sentPromise = aliceClient.sendMessage(bobClient.username, 'Hello Bob!');
    
    // 3. Bob receives handshake init
    await bobClient.waitForEvent('x3dh_handshake');
    
    // 4. Bob processes and sends ACK
    await bobClient.processHandshake();
    
    // 5. Alice receives ACK, message is sent
    const sent = await sentPromise;
    expect(sent.encryptionType).toBe('double-ratchet-v1');
    
    // 6. Bob receives and decrypts message
    const received = await bobClient.waitForMessage();
    expect(received.body).toBe('Hello Bob!');
    expect(received.encryptionType).toBe('double-ratchet-v1');
    
    // 7. Multiple messages maintain session
    await aliceClient.sendMessage(bobClient.username, 'Message 2');
    await aliceClient.sendMessage(bobClient.username, 'Message 3');
    
    const msg2 = await bobClient.waitForMessage();
    const msg3 = await bobClient.waitForMessage();
    
    expect(msg2.body).toBe('Message 2');
    expect(msg3.body).toBe('Message 3');
  });
  
  it('should handle page reload and restore session', async () => {
    // 1. Establish DR session
    // 2. Simulate page reload (clear in-memory state)
    // 3. Reload session from KeyVault
    // 4. Continue messaging
  });
  
  it('should queue messages sent during handshake', async () => {
    // 1. Activer DR mode pour les deux utilisateurs
    await aliceClient.setEncryptionMode('double-ratchet');
    await bobClient.setEncryptionMode('double-ratchet');
    
    // 2. Alice envoie un message (déclenche le handshake)
    const messagePromise = aliceClient.sendMessage(bobClient.username, 'First message');
    
    // 3. Avant la fin du handshake, Alice envoie un autre message
    const secondMessagePromise = aliceClient.sendMessage(bobClient.username, 'Second message');
    
    // 4. Simuler un handshake lent
    await delay(1000);
    
    // 5. Compléter le handshake
    await bobClient.processHandshake();
    
    // 6. Vérifier que les deux messages sont envoyés après le handshake
    const firstMessage = await messagePromise;
    const secondMessage = await secondMessagePromise;
    
    expect(firstMessage.encryptionType).toBe('double-ratchet-v1');
    expect(secondMessage.encryptionType).toBe('double-ratchet-v1');
    
    // 7. Bob reçoit et déchiffre les deux messages
    const received1 = await bobClient.waitForMessage();
    const received2 = await bobClient.waitForMessage();
    
    expect(received1.body).toBe('First message');
    expect(received2.body).toBe('Second message');
  });
});
```

---

## 6. Spécifications Techniques

### 6.1 Format des Messages

> **AMÉLIORATION**: Ajout d'un `sessionId` pour éviter les ambiguïtés lors de handshakes concurrents ou de retry.

#### HANDSHAKE_INIT
```json
{
  "type": "HANDSHAKE_INIT",
  "version": 1,
  "sessionId": "uuid-v4-généré-par-alice",
  "senderIdentityKey": "base64...",
  "senderEphemeralKey": "base64...",
  "usedOneTimePreKeyId": 42,
  "timestamp": 1702300000000,
  "nonce": "random-16-bytes-base64"
}
```

#### HANDSHAKE_ACK
```json
{
  "type": "HANDSHAKE_ACK",
  "version": 1,
  "sessionId": "uuid-v4-généré-par-alice",
  "senderEphemeralKey": "base64...",
  "timestamp": 1702300001000,
  "nonce": "echo-init-nonce"
}
```

> **Note**: Le `sessionId` est généré par l'initiateur (Alice) et doit être renvoyé dans l'ACK pour associer correctement la réponse à la demande initiale.

#### Double Ratchet Message
```json
{
  "version": "double-ratchet-v1",
  "header": {
    "publicKey": "base64-DH-public-key",
    "previousChainLength": 0,
    "messageNumber": 0
  },
  "ciphertext": "base64...",
  "nonce": "base64..."
}
```

### 6.2 Algorithmes Cryptographiques

| Usage | Algorithme | Taille Clé |
|-------|------------|------------|
| Key Exchange | X25519 (ECDH) | 32 bytes |
| Symmetric Encryption | XChaCha20-Poly1305 | 32 bytes |
| KDF | HKDF avec BLAKE2b | 32 bytes output |
| Signature SPK | HMAC-SHA256 | 32 bytes |
| Random | libsodium randombytes | Variable |

### 6.3 Constantes de Configuration

```typescript
// x3dh.ts
const X3DH_VERSION = 1;
const HANDSHAKE_TIMEOUT_MS = 30000;      // 30 secondes
const MAX_RETRY_COUNT = 3;
const RETRY_INTERVAL_BASE_MS = 2000;     // 2s, 4s, 8s (exponential)
const ONE_TIME_PREKEY_COUNT = 100;
const SIGNED_PREKEY_ROTATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

// doubleRatchet.ts
const MAX_SKIP = 1000;                   // Max skipped message keys
```

### 6.4 Stockage des Données

| Donnée | Emplacement | Encryption |
|--------|-------------|------------|
| Identity Keys | KeyVault (IndexedDB) | Master Key |
| SPK + OPKs (local) | KeyVault | Master Key |
| Session State DR | KeyVault | Master Key |
| Key Bundle (server) | PostgreSQL | En clair (public) |
| Handshake State | KeyVault + Memory | Master Key |
| Decrypted Messages | SessionStorage | Non (temporaire) |

---

## 7. Stratégie de Test

### 7.1 Matrice de Tests

| Scénario | Priorité | Type |
|----------|----------|------|
| X3DH key agreement math | Critique | Unit |
| Ed25519 SPK signature | Critique | Unit |
| Handshake INIT → ACK flow | Critique | Unit |
| DR encrypt/decrypt | Critique | Unit |
| Session persistence | Haute | Integration |
| Offline user handling | Haute | Integration |
| Page reload recovery | Haute | Integration |
| Multiple message exchange | Haute | Integration |
| **Messages concurrents pendant handshake** | **Haute** | **Integration** |
| OPK exhaustion + auto-replenish | Moyenne | Integration |
| SPK rotation | Moyenne | Integration |
| Concurrent handshakes | Moyenne | Stress |
| Network failure recovery | Moyenne | Integration |
| Sessions multiples (multi-device) | Moyenne | Integration |

### 7.2 Cas de Test Détaillés

#### Test 1: Handshake Complet
```
Given: Alice et Bob sont connectés
When: Alice envoie un message à Bob (mode DR)
Then:
  - Alice récupère le KeyBundle de Bob
  - Alice envoie HANDSHAKE_INIT
  - Bob reçoit et traite INIT
  - Bob envoie HANDSHAKE_ACK
  - Alice reçoit ACK
  - Les deux ont une session ACTIVE
  - Le message est envoyé en DR
  - Bob déchiffre avec succès
```

#### Test 2: Utilisateur Offline
```
Given: Alice connectée, Bob déconnecté
When: Alice envoie un message à Bob (mode DR)
Then:
  - Alice récupère KeyBundle de Bob
  - Alice calcule sharedSecret
  - Alice envoie HANDSHAKE_INIT
  - Serveur retourne "user offline"
  - Handshake est mis en queue
  - Message envoyé en NaCl Box (fallback)
  
When: Bob se connecte
Then:
  - Queue retry le HANDSHAKE_INIT
  - Bob reçoit et traite INIT
  - Bob envoie ACK
  - Session DR établie
  - Prochains messages en DR
```

#### Test 3: Reprise après Crash
```
Given: Session DR active entre Alice et Bob
When: Alice recharge la page (F5)
Then:
  - Session en mémoire perdue
  - Session restaurée depuis KeyVault
  - Prochains messages fonctionnent
  - Pas de nouveau handshake nécessaire
```

---

## 8. Plan de Rollback

### 8.1 Feature Flag

```typescript
// config.ts
export const FEATURE_FLAGS = {
  ENABLE_DOUBLE_RATCHET: false, // Toggle pour activer/désactiver DR
  FORCE_NACL_BOX: true,         // Force NaCl Box même si DR préféré
};
```

### 8.2 Procédure de Rollback

1. **Détection du problème**
   - Taux d'échec de déchiffrement > 5%
   - Erreurs X3DH dans les logs > 100/heure
   - Feedback utilisateur négatif

2. **Actions immédiates**
   ```typescript
   // Désactiver DR côté serveur
   FEATURE_FLAGS.FORCE_NACL_BOX = true;
   ```

3. **Nettoyage**
   - Les sessions DR existantes continuent de fonctionner
   - Nouvelles conversations utilisent NaCl Box
   - Pas de perte de messages

4. **Investigation**
   - Analyser les logs d'erreur
   - Identifier le pattern d'échec
   - Corriger et re-déployer

### 8.3 Compatibilité Descendante

```typescript
// messagingIntegration.ts
export async function decryptReceivedMessage(
  senderUsername: string,
  encryptedBody: string
): Promise<DecryptionResult> {
  const parsed = JSON.parse(encryptedBody);
  
  // Supporter les deux formats
  if (parsed.encrypted?.version === 'double-ratchet-v1') {
    return decryptDoubleRatchet(senderUsername, parsed.encrypted);
  }
  
  if (parsed.encrypted?.version === 'nacl-box-v1') {
    return decryptNaClBox(senderUsername, parsed.encrypted);
  }
  
  // Legacy format
  return { text: '[Unknown encryption format]', encryptionType: 'unknown' };
}
```

---

## 9. Estimation et Risques

### 9.1 Estimation de Temps

| Phase | Durée | Dépendances |
|-------|-------|-------------|
| Phase 1: Préparation | 1 jour | Aucune |
| Phase 2: X3DH Manager | 2 jours | Phase 1 |
| Phase 3: Intégration Chat | 2 jours | Phase 2 |
| Phase 4: UI | 1 jour | Phase 3 |
| Phase 5: Tests | 2 jours | Phase 4 |
| **Total** | **8 jours** | |

### 9.2 Risques Identifiés

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Désynchronisation persistante | Moyenne | Haute | Fallback NaCl Box automatique |
| Performance handshake | Basse | Moyenne | Async + queue |
| Complexité maintenance | Moyenne | Moyenne | Documentation + tests |
| OPK exhaustion (spam) | Basse | Basse | Rate limiting + auto-replenish |
| Incompatibilité anciens clients | Basse | Haute | Version negotiation |

### 9.3 Critères de Succès

- [ ] Taux de déchiffrement > 99.5%
- [ ] Temps moyen handshake < 2 secondes
- [ ] Aucun message perdu après reload
- [ ] Tests unitaires: couverture > 80%
- [ ] Tests d'intégration: tous passent
- [ ] Feedback utilisateur positif

---

## Annexes

### A. Références

1. [Signal X3DH Specification](https://signal.org/docs/specifications/x3dh/)
2. [Signal Double Ratchet Specification](https://signal.org/docs/specifications/doubleratchet/)
3. [libsodium Documentation](https://doc.libsodium.org/)

### B. Glossaire

| Terme | Définition |
|-------|------------|
| X3DH | Extended Triple Diffie-Hellman - protocole d'établissement de clés |
| DR | Double Ratchet - protocole de mise à jour des clés |
| PFS | Perfect Forward Secrecy - compromission d'une clé n'expose pas l'historique |
| SPK | Signed Pre-Key - clé publique signée, durée de vie moyenne |
| OPK | One-Time Pre-Key - clé à usage unique |
| IK | Identity Key - clé d'identité long-terme |
| EK | Ephemeral Key - clé éphémère générée pour chaque handshake |
| RK | Root Key - clé racine du Double Ratchet |
| CK | Chain Key - clé de chaîne pour dérivation des clés de message |

### C. Checklist Pre-Déploiement

- [ ] Tous les tests passent
- [ ] Code review complète
- [ ] Documentation à jour
- [ ] Feature flag configuré
- [ ] Monitoring en place
- [ ] Plan de rollback testé
- [ ] Communication utilisateurs préparée
