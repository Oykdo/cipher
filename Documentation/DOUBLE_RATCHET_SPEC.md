# Double Ratchet Protocol - Spécification Technique

## 🎯 Objectif

Implémenter le protocole Double Ratchet pour fournir :
- **Perfect Forward Secrecy** - Les clés passées ne peuvent pas être compromises
- **Future Secrecy** - Les clés futures ne peuvent pas être compromises
- **Rotation automatique** - Nouvelles clés pour chaque message

## 📚 Références

- [Signal Protocol - Double Ratchet](https://signal.org/docs/specifications/doubleratchet/)
- [WhatsApp Security Whitepaper](https://www.whatsapp.com/security/WhatsApp-Security-Whitepaper.pdf)

## 🏗️ Architecture

### Composants principaux

1. **DH Ratchet** (Diffie-Hellman Ratchet)
   - Rotation des clés DH à chaque tour de conversation
   - Génère une nouvelle paire de clés DH pour chaque message envoyé

2. **Symmetric Key Ratchet** (KDF Chain)
   - Dérivation des clés de chiffrement/déchiffrement
   - Utilise HKDF pour dériver les clés

3. **Message Keys**
   - Clés uniques pour chaque message
   - Dérivées de la chaîne de clés

### État du Ratchet

```typescript
interface RatchetState {
  // DH Ratchet
  DHs: Uint8Array;           // Notre paire de clés DH (privée)
  DHr: Uint8Array | null;    // Clé publique DH du peer
  
  // Root Chain
  RK: Uint8Array;            // Root Key
  
  // Sending Chain
  CKs: Uint8Array;           // Chain Key (sending)
  Ns: number;                // Message number (sending)
  
  // Receiving Chain
  CKr: Uint8Array;           // Chain Key (receiving)
  Nr: number;                // Message number (receiving)
  
  // Message Keys (pour messages hors ordre)
  skippedKeys: Map<string, Uint8Array>;
  
  // Metadata
  peerUsername: string;
  lastUpdate: number;
}
```

## 🔄 Algorithmes

### 1. Initialisation (Alice initie)

```typescript
function initializeAlice(
  sharedSecret: Uint8Array,
  bobPublicKey: Uint8Array
): RatchetState {
  // Générer notre paire DH
  const DHs = generateDHKeyPair();
  
  // Calculer le secret partagé initial
  const dh = DH(DHs.privateKey, bobPublicKey);
  
  // Dériver RK et CKs
  const [RK, CKs] = KDF_RK(sharedSecret, dh);
  
  return {
    DHs: DHs.privateKey,
    DHr: bobPublicKey,
    RK,
    CKs,
    Ns: 0,
    CKr: new Uint8Array(32), // Sera initialisé au premier message reçu
    Nr: 0,
    skippedKeys: new Map(),
    peerUsername: 'bob',
    lastUpdate: Date.now()
  };
}
```

### 2. Initialisation (Bob répond)

```typescript
function initializeBob(
  sharedSecret: Uint8Array,
  alicePublicKey: Uint8Array
): RatchetState {
  // Générer notre paire DH
  const DHs = generateDHKeyPair();
  
  return {
    DHs: DHs.privateKey,
    DHr: alicePublicKey,
    RK: sharedSecret,
    CKs: new Uint8Array(32), // Sera initialisé au premier envoi
    Ns: 0,
    CKr: new Uint8Array(32),
    Nr: 0,
    skippedKeys: new Map(),
    peerUsername: 'alice',
    lastUpdate: Date.now()
  };
}
```

### 3. Envoi de message

```typescript
function ratchetEncrypt(
  state: RatchetState,
  plaintext: Uint8Array,
  associatedData: Uint8Array
): { ciphertext: Uint8Array; header: MessageHeader } {
  // Dériver la clé de message
  const [CKs, messageKey] = KDF_CK(state.CKs);
  state.CKs = CKs;
  
  // Créer le header
  const header: MessageHeader = {
    publicKey: getDHPublicKey(state.DHs),
    previousChainLength: state.Ns,
    messageNumber: state.Ns
  };
  
  // Chiffrer
  const ciphertext = ENCRYPT(messageKey, plaintext, CONCAT(associatedData, header));
  
  // Incrémenter le compteur
  state.Ns++;
  
  return { ciphertext, header };
}
```

### 4. Réception de message

```typescript
function ratchetDecrypt(
  state: RatchetState,
  header: MessageHeader,
  ciphertext: Uint8Array,
  associatedData: Uint8Array
): Uint8Array {
  // Vérifier si on a sauté des messages
  const skippedKey = trySkippedMessageKeys(state, header, ciphertext, associatedData);
  if (skippedKey) return skippedKey;
  
  // Vérifier si on doit faire un DH ratchet
  if (header.publicKey !== state.DHr) {
    skipMessageKeys(state, header.previousChainLength);
    dhRatchet(state, header);
  }
  
  // Sauvegarder les clés sautées
  skipMessageKeys(state, header.messageNumber);
  
  // Dériver la clé de message
  const [CKr, messageKey] = KDF_CK(state.CKr);
  state.CKr = CKr;
  state.Nr++;
  
  // Déchiffrer
  return DECRYPT(messageKey, ciphertext, CONCAT(associatedData, header));
}
```

### 5. DH Ratchet

```typescript
function dhRatchet(state: RatchetState, header: MessageHeader) {
  // Sauvegarder l'ancienne clé publique
  state.DHr = header.publicKey;
  
  // Calculer le nouveau secret partagé
  const dh = DH(state.DHs, state.DHr);
  
  // Dériver nouvelle RK et CKr
  const [RK, CKr] = KDF_RK(state.RK, dh);
  state.RK = RK;
  state.CKr = CKr;
  state.Nr = 0;
  
  // Générer nouvelle paire DH
  const DHs = generateDHKeyPair();
  state.DHs = DHs.privateKey;
  
  // Calculer le nouveau secret partagé (pour l'envoi)
  const dh2 = DH(state.DHs, state.DHr);
  
  // Dériver nouvelle CKs
  const [RK2, CKs] = KDF_RK(state.RK, dh2);
  state.RK = RK2;
  state.CKs = CKs;
  state.Ns = 0;
}
```

## 🔑 Fonctions cryptographiques

### KDF_RK (Root Key Derivation)

```typescript
function KDF_RK(rk: Uint8Array, dhOut: Uint8Array): [Uint8Array, Uint8Array] {
  // Utiliser HKDF avec SHA-256
  const output = HKDF(rk, dhOut, "DoubleRatchet-RootKey", 64);
  return [
    output.slice(0, 32),  // Nouvelle RK
    output.slice(32, 64)  // Nouvelle CK
  ];
}
```

### KDF_CK (Chain Key Derivation)

```typescript
function KDF_CK(ck: Uint8Array): [Uint8Array, Uint8Array] {
  // Utiliser HMAC-SHA256
  const messageKey = HMAC(ck, new Uint8Array([0x01]));
  const chainKey = HMAC(ck, new Uint8Array([0x02]));
  return [chainKey, messageKey];
}
```

## 📦 Format de message

```typescript
interface DoubleRatchetMessage {
  version: "double-ratchet-v1";
  header: {
    publicKey: string;        // Base64
    previousChainLength: number;
    messageNumber: number;
  };
  ciphertext: string;         // Base64
}
```

## 🎯 Intégration

Le Double Ratchet sera intégré dans `SessionManager` :

```typescript
class SessionManager {
  private ratchetStates: Map<string, RatchetState>;
  
  async encryptMessage(peer: string, plaintext: string): Promise<string> {
    const state = this.ratchetStates.get(peer);
    if (!state) throw new Error("No ratchet state");
    
    const { ciphertext, header } = ratchetEncrypt(state, ...);
    return JSON.stringify({ version: "double-ratchet-v1", header, ciphertext });
  }
  
  async decryptMessage(peer: string, encrypted: string): Promise<string> {
    const msg = JSON.parse(encrypted);
    const state = this.ratchetStates.get(peer);
    
    const plaintext = ratchetDecrypt(state, msg.header, msg.ciphertext, ...);
    return plaintext;
  }
}
```

---

**Date** : 2025-01-18  
**Version** : 1.0.0  
**Statut** : 📝 SPÉCIFICATION

