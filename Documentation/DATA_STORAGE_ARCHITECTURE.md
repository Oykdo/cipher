# Architecture Stockage des Données - Project Chimera

**Date:** 2025-11-09  
**Questions:**
1. Où sont créés les fichiers liés à la blockchain ?
2. Les messages sont-ils exportés sur le local device de l'utilisateur ?

---

## 🎯 Réponses Directes

### 1. Fichiers Blockchain

**Réponse:** **Aucun fichier lié à la blockchain !**

L'application ne crée **aucun fichier blockchain** car elle utilise Bitcoin en **read-only** (lecture seule via APIs).

**Ce qui existe:**
- ✅ Fichiers messages (SQLite sur serveur)
- ❌ Aucun fichier blockchain
- ❌ Aucune donnée on-chain

### 2. Messages sur Device Utilisateur

**Réponse:** **Oui ET Non** (architecture hybride)

- ✅ **Session/Auth:** Stockés localement (localStorage)
- ❌ **Messages:** Stockés sur serveur uniquement
- ✅ **Cache offline:** Queue temporaire (localStorage)
- ✅ **Backup:** Exportable sur device utilisateur

---

## 🏗️ Architecture Complète

### Vue d'Ensemble

```
┌─────────────────────────────────────────────────────────┐
│                  DEVICE UTILISATEUR                     │
│  ┌───────────────────────────────────────────────────┐  │
│  │          Electron App (Desktop)                   │  │
│  │                                                   │  │
│  │  ┌─────────────────────────────────────────────┐ │  │
│  │  │  Frontend (React + Vite)                    │ │  │
│  │  │                                             │ │  │
│  │  │  localStorage:                              │ │  │
│  │  │  ├── dead-drop-auth (tokens JWT)            │ │  │
│  │  │  ├── dd-lang (langue UI)                    │ │  │
│  │  │  └── offline-queue (messages non envoyés)   │ │  │
│  │  │                                             │ │  │
│  │  │  IndexedDB (optionnel):                     │ │  │
│  │  │  └── crypto-keys (clés non-extractables)    │ │  │
│  │  └─────────────────────────────────────────────┘ │  │
│  │                      ↕ HTTP/WebSocket             │  │
│  │  ┌─────────────────────────────────────────────┐ │  │
│  │  │  Bridge Backend (Fastify + Node.js)        │ │  │
│  │  │                                             │ │  │
│  │  │  SQLite Database:                           │ │  │
│  │  │  C:\Users\{user}\AppData\Roaming\          │ │  │
│  │  │      project-chimera\data\dead-drop.db     │ │  │
│  │  │                                             │ │  │
│  │  │  ├── users (credentials, mnemonics)         │ │  │
│  │  │  ├── conversations                          │ │  │
│  │  │  ├── messages (body + unlock_height)        │ │  │
│  │  │  ├── attachments (metadata + path)          │ │  │
│  │  │  └── audit_logs                             │ │  │
│  │  │                                             │ │  │
│  │  │  Fichiers Attachments:                      │ │  │
│  │  │  C:\Users\{user}\AppData\Roaming\          │ │  │
│  │  │      project-chimera\data\uploads\         │ │  │
│  │  │      └── {uuid}.bin (chiffrés client-side) │ │  │
│  │  └─────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                       ↕ HTTPS (Read-Only)
┌─────────────────────────────────────────────────────────┐
│              Bitcoin Network (Internet)                 │
│  APIs publiques: Blockstream, Blockchain.info, Mempool  │
│  Lecture hauteur de bloc uniquement                     │
└─────────────────────────────────────────────────────────┘
```

---

## 📁 Chemins Exacts des Fichiers

### Sur Windows

```
C:\Users\{username}\AppData\Roaming\project-chimera\
├── config.json                     # Configuration Electron
│   └── JWT_SECRET (généré auto)
│
├── data/
│   ├── dead-drop.db                # ★ DATABASE PRINCIPALE
│   ├── dead-drop.db-shm            # SQLite shared memory
│   ├── dead-drop.db-wal            # Write-Ahead Log
│   │
│   ├── backups/                    # Backups automatiques
│   │   ├── backup-2025-11-09.db
│   │   └── auto-backup-2025-11-09.db.gz
│   │
│   ├── uploads/                    # Fichiers attachés
│   │   ├── {uuid-1}.bin           # Chiffré côté client
│   │   ├── {uuid-2}.bin
│   │   └── tmp/                   # Uploads en cours
│   │       ├── {upload-id}.json   # Manifest chunks
│   │       └── {upload-id}.0.part # Chunks temporaires
│   │
│   └── restore/                    # Backups importés
│       └── restore-{timestamp}.db
│
└── logs/                           # Logs application (si configuré)
    ├── combined.log
    └── error.log
```

### Sur macOS

```
~/Library/Application Support/project-chimera/
└── (même structure que Windows)
```

### Sur Linux

```
~/.config/project-chimera/
└── (même structure que Windows)
```

---

## 💾 Stockage Par Composant

### 1. Messages (Serveur Local)

**Emplacement:** `dead-drop.db` (SQLite)

**Table messages:**
```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  body TEXT NOT NULL,                    -- ★ Message en CLAIR
  created_at INTEGER NOT NULL,
  unlock_block_height INTEGER,           -- ★ Hauteur Bitcoin
  is_burned INTEGER DEFAULT 0,
  burned_at INTEGER,
  scheduled_burn_at INTEGER,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  FOREIGN KEY (sender_id) REFERENCES users(id)
);
```

**Exemple données:**
```json
{
  "id": "msg-123",
  "conversation_id": "conv-abc",
  "sender_id": "user-xyz",
  "body": "Ceci est un secret",          // ← EN CLAIR dans DB
  "unlock_block_height": 870010,         // ← Hauteur Bitcoin
  "created_at": 1762683000000
}
```

**⚠️ IMPORTANT:** Les messages sont stockés **en clair** dans la database locale !

**Sécurité:**
- ✅ Database sur device utilisateur uniquement
- ✅ Pas accessible réseau (localhost uniquement)
- ⚠️ Accessible si accès physique machine
- ⚠️ Pas de chiffrement database at-rest

---

### 2. Session Utilisateur (Frontend localStorage)

**Emplacement:** Browser localStorage (Electron)

**Clé:** `dead-drop-auth`

**Contenu:**
```json
{
  "userId": "user-123",
  "username": "alice",
  "token": "eyJhbGc...",                  // JWT access token
  "refreshToken": "refresh-xyz...",      // Refresh token
  "masterKey": "abc123...",              // ⚠️ Master key (chiffré)
  "mnemonic": ["word1", "word2", ...]    // BIP-39 mnemonic
}
```

**⚠️ Problème de sécurité identifié:**
- Master key stocké dans localStorage
- Accessible via DevTools Console
- Vulnérable XSS (si script malveillant injecté)

**Recommandation:** Migrer vers IndexedDB avec CryptoKey non-extractable

---

### 3. Attachments (Serveur Local)

**Emplacement:** `data/uploads/{uuid}.bin`

**Format:** Binaire chiffré côté client (AES-256-GCM)

**Metadata dans database:**
```sql
CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  uploader_id TEXT NOT NULL,
  filename TEXT NOT NULL,                -- Nom original
  mime TEXT NOT NULL,                    -- Type MIME
  size INTEGER NOT NULL,                 -- Taille en octets
  path TEXT NOT NULL,                    -- ★ Chemin local
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);
```

**Exemple:**
```json
{
  "id": "att-456",
  "filename": "secret.pdf",
  "path": "C:\\Users\\alice\\AppData\\Roaming\\project-chimera\\data\\uploads\\att-456.bin",
  "size": 2048576,
  "mime": "application/pdf"
}
```

**Sécurité:**
- ✅ Fichier chiffré côté client (avant upload)
- ✅ Serveur ne voit que données chiffrées
- ✅ Déchiffrement uniquement par membres conversation

---

### 4. Backups (Exportables)

**Emplacement:** `data/backups/backup-{timestamp}.db`

**Formats:**
- `.db` - SQLite non compressé
- `.db.gz` - SQLite compressé (gzip)

**Contenu:** Copie complète database (users, messages, conversations)

**Exportation:**
```bash
# API endpoint
POST /api/backup/export

# Retourne base64 du fichier .db
{
  "success": true,
  "data": "U1FMaXRlIGZvcm1hdCAz...",  // Base64
  "size": 2048576,
  "filename": "backup-2025-11-09.db"
}
```

**L'utilisateur peut:**
1. Télécharger backup via l'interface
2. Stocker sur clé USB / cloud personnel
3. Restaurer sur autre machine

---

## 🔄 Flux de Données

### Envoi Message

```
1. CLIENT (React)
   ├── Saisie message: "Secret"
   ├── Choix time-lock: "1 heure"
   └── Chiffrement: encryptMessage()
           ↓
2. WEBSOCKET/HTTP
   └── POST /messages
           ↓
3. SERVEUR (Bridge)
   ├── Calcule unlock height
   │   currentHeight = 870,000
   │   unlockHeight = 870,006 (+1h)
   ├── Stocke dans SQLite
   │   INSERT INTO messages VALUES (
   │     id, conv_id, sender_id,
   │     'Secret',              -- ★ EN CLAIR
   │     870006                 -- ★ unlock_block_height
   │   )
   └── Broadcast aux membres
           ↓
4. FICHIER CRÉÉ
   C:\Users\alice\AppData\Roaming\
      project-chimera\data\dead-drop.db
```

### Lecture Message

```
1. CLIENT (React)
   └── GET /conversations/123/messages
           ↓
2. SERVEUR (Bridge)
   ├── Lit Bitcoin height: 870,003
   ├── Vérifie unlock: 870,003 >= 870,006 ? NON
   ├── Retourne: body = "[Message verrouillé]"
   └── isLocked = true
           ↓
3. CLIENT
   └── Affiche: "[Message verrouillé]"
       + Countdown: "Encore 30 minutes"
```

**Plus tard (après 1h):**
```
1. CLIENT: GET /conversations/123/messages
           ↓
2. SERVEUR:
   ├── Height: 870,009
   ├── Safe height: 870,003 (avec 6 confirmations)
   ├── 870,003 >= 870,006 ? NON (presque!)
   └── Retourne: "[Message verrouillé]"

# Encore 30 minutes plus tard...

1. CLIENT: GET /conversations/123/messages
           ↓
2. SERVEUR:
   ├── Height: 870,015
   ├── Safe height: 870,009
   ├── 870,009 >= 870,006 ? OUI ✅
   └── Retourne: body = "Secret"
           ↓
3. CLIENT
   └── Affiche: "Secret" (déverrouillé ✅)
```

---

## 📊 Stockage Détaillé

### Base de Données (Serveur - SQLite)

**Fichier:** `dead-drop.db`

**Tables:**

| Table | Contenu | Taille Typique |
|-------|---------|----------------|
| **users** | Credentials, mnemonics | ~1 KB/user |
| **conversations** | Métadata conversations | ~0.5 KB/conv |
| **messages** | ★ Corps messages + unlock_height | ~1-10 KB/msg |
| **attachments** | Metadata fichiers | ~0.5 KB/file |
| **audit_logs** | Logs actions | ~1 KB/action |
| **refresh_tokens** | JWT refresh tokens | ~0.2 KB/token |

**Exemple taille database:**
- 100 users: ~100 KB
- 1000 messages: ~5 MB
- 100 attachments (metadata): ~50 KB
- **Total: ~5-10 MB** (très léger)

**Localisation exacte:**
```javascript
// main.js ligne 49-50
const userData = app.getPath('userData');
const dataDir = path.join(userData, 'data');

// Résultat Windows:
// C:\Users\{username}\AppData\Roaming\project-chimera\data\dead-drop.db
```

---

### Frontend (Client - Browser Storage)

**localStorage (≈5-10 MB max):**

| Clé | Contenu | Taille | Persistant |
|-----|---------|--------|------------|
| `dead-drop-auth` | Session (tokens, masterKey) | ~2 KB | ✅ Oui |
| `dd-lang` | Langue UI (fr/en) | ~10 B | ✅ Oui |
| `offline-queue` | Messages non envoyés | ~50 KB | ✅ Oui |

**IndexedDB (optionnel, ≈50 MB+):**

| Store | Contenu | Taille | Sécurisé |
|-------|---------|--------|----------|
| `cryptoKeys` | CryptoKey non-extractables | ~1 KB | ✅ Très |

**⚠️ IMPORTANT:** Les **messages** ne sont **PAS** stockés dans le frontend !

**Pourquoi ?**
- Messages stockés sur serveur (SQLite)
- Frontend fait requêtes HTTP pour les lire
- Pas de synchronisation offline complète

---

## 🔐 Sécurité Stockage

### Ce Qui Est Chiffré

| Donnée | Localisation | Chiffrement | Clé |
|--------|--------------|-------------|-----|
| **Messages body** | Serveur SQLite | ❌ Clair | N/A |
| **Mnemonics BIP-39** | Serveur SQLite | ✅ AES-256-GCM | Master Key |
| **Master Key (Dice-Key)** | Serveur SQLite | ✅ Argon2 | N/A (hash) |
| **Attachments** | Serveur fichiers | ✅ Chiffré client-side | Master Key |
| **localStorage auth** | Frontend localStorage | ⚠️ Clair* | N/A |

*Note: Le master key devrait être chiffré avant stockage localStorage

### Protection Données

**Serveur (Bridge):**
```
Fichiers accessibles uniquement par:
├── Processus Electron (Node.js backend)
├── Utilisateur système (owner des fichiers)
└── Administrateur système

Protection:
✅ Pas d'accès réseau externe (localhost only)
✅ Permissions fichiers OS (user-only)
❌ Pas de chiffrement at-rest database
❌ Vulnérable si accès physique machine
```

**Frontend (localStorage):**
```
Données accessibles par:
├── Code JavaScript de l'app
├── DevTools Console (si ouvert)
└── Extensions navigateur (potentiel XSS)

Protection:
✅ Isolé par domaine (Electron)
✅ Pas accessible autres apps
⚠️ Vulnérable XSS (si script malveillant)
```

---

## 📤 Export Messages sur Device

### Méthode 1: Backup Database (Recommandé)

**API:** `POST /api/backup/export`

**Fonctionnement:**
```javascript
// Frontend déclenche export
const response = await fetch('http://localhost:4000/api/backup/export', {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}` 
  }
});

const backup = await response.json();
// {
//   data: "U1FMaXRlIGZvcm1hdCAz...",  // Base64 du .db
//   filename: "backup-2025-11-09.db",
//   size: 5242880
// }

// Frontend sauvegarde le fichier
const blob = new Blob([atob(backup.data)], { type: 'application/x-sqlite3' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = backup.filename;
a.click();
```

**Résultat:** L'utilisateur télécharge `backup-2025-11-09.db` sur son disque dur

**Contenu du backup:**
- ✅ Tous les messages (chiffrés et en clair)
- ✅ Toutes les conversations
- ✅ Tous les utilisateurs
- ✅ Tous les attachments (metadata + paths)
- ✅ Audit logs

**Restauration:**
```bash
# L'utilisateur peut restaurer sur autre machine
POST /api/backup/import
{
  "data": "U1FMaXRlIGZvcm1hdCAz..."  // Base64 du backup
}
```

---

### Méthode 2: Export JSON (À Implémenter)

**Fonctionnalité possible:**

```javascript
// À ajouter dans backend
app.get('/api/export/messages/json', async (request, reply) => {
  const userId = request.user.sub;
  const conversations = db.getUserConversations(userId);
  
  const exportData = {
    exportDate: new Date().toISOString(),
    user: {
      id: userId,
      username: db.getUserById(userId).username
    },
    conversations: conversations.map(conv => ({
      id: conv.id,
      members: db.getConversationMembers(conv.id),
      messages: db.getConversationMessages(conv.id).map(msg => ({
        id: msg.id,
        body: msg.body,
        sender: db.getUserById(msg.sender_id).username,
        createdAt: new Date(msg.created_at).toISOString(),
        unlockHeight: msg.unlock_block_height,
        isLocked: msg.unlock_block_height 
          ? blockchain.getCurrentBlockHeight() < msg.unlock_block_height
          : false
      }))
    }))
  };
  
  return exportData;
});
```

**Usage frontend:**
```javascript
const data = await fetch('/api/export/messages/json');
const json = await data.json();

// Sauvegarder JSON sur disque
const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
saveAs(blob, `messages-${Date.now()}.json`);
```

---

### Méthode 3: Copie Manuelle Fichiers

**L'utilisateur peut copier manuellement:**

```bash
# Windows
xcopy "C:\Users\alice\AppData\Roaming\project-chimera\data" "D:\Backups\chimera\" /E /I

# macOS/Linux
cp -r ~/.config/project-chimera/data ~/Desktop/chimera-backup/
```

**Contenu copié:**
- ✅ `dead-drop.db` - Database complète
- ✅ `uploads/` - Tous les fichiers attachés
- ✅ `backups/` - Backups automatiques

---

## 🌍 Architecture Client-Serveur

### Important: Serveur LOCAL (Pas Cloud!)

```
┌────────────────────────────────────────────┐
│         Machine Utilisateur                │
│                                            │
│  ┌──────────────┐    ┌─────────────────┐  │
│  │   Frontend   │◄──►│  Backend Bridge │  │
│  │   (React)    │    │   (Node.js)     │  │
│  │  Port 5173   │    │   Port 4000     │  │
│  └──────────────┘    └─────────────────┘  │
│         ↓                     ↓            │
│  localStorage          dead-drop.db        │
│  (~5-10 KB)           (~5-10 MB)           │
│                                            │
└────────────────────────────────────────────┘
       ↓ Internet (Read-Only)
┌────────────────────────────────────────────┐
│         Bitcoin APIs (Public)              │
└────────────────────────────────────────────┘
```

**Caractéristiques:**
- ✅ **100% Local** - Aucun serveur cloud
- ✅ **Données privées** - Jamais envoyées sur internet
- ✅ **Offline-first** - Fonctionne sans internet (sauf time-lock)
- ✅ **Propriété utilisateur** - Données sur son device

---

## 📋 Réponses Complètes

### Question 1: Où sont créés les fichiers blockchain ?

**Réponse:** **Il n'y a AUCUN fichier blockchain créé !**

**Explication:**
- Application ne crée pas de blockchain
- Ne stocke pas de blocs Bitcoin
- Lit uniquement hauteur via APIs (HTTP GET)
- Comme consulter l'heure sur internet ⏰

**Fichiers créés:**
- ✅ `dead-drop.db` - Messages et métadata
- ✅ `uploads/{uuid}.bin` - Fichiers attachés
- ✅ `backups/*.db` - Backups
- ❌ **Aucun fichier blockchain**

---

### Question 2: Les messages sont-ils exportés sur device utilisateur ?

**Réponse:** **Oui, automatiquement !**

**Les messages SONT DÉJÀ sur le device utilisateur** (pas dans le cloud) :

```
Location: C:\Users\{user}\AppData\Roaming\project-chimera\data\dead-drop.db

Tous les messages de l'utilisateur sont dans ce fichier SQLite local.
```

**Méthodes d'export:**

1. **Automatique** ✅
   - Fichiers déjà sur device
   - Pas besoin d'export
   - Accessibles directement

2. **Backup Manuel** ✅
   - Interface UI: "Exporter backup"
   - Télécharge .db sur Desktop/Documents
   - Restaurable sur autre machine

3. **Backup Automatique** ✅
   - Configurable (toutes les X heures)
   - Stocké dans `data/backups/`
   - Compression gzip optionnelle

4. **Copie Fichiers** ✅
   - Copier dossier `AppData/Roaming/project-chimera/`
   - Transférer sur clé USB / autre device
   - Coller sur nouvelle machine

---

## ⚠️ Points Importants

### Sécurité Stockage

**🔴 Messages en Clair dans Database**

```sql
-- Ce qui est stocké:
SELECT body FROM messages WHERE id = 'msg-123';
-- Résultat: "Ceci est un secret"  ← EN CLAIR !
```

**Implications:**
- ✅ Performance: Lecture rapide, recherche facile
- ✅ Backup simple: Copie fichier .db
- ⚠️ Risque: Accessible si accès physique machine
- ⚠️ Risque: Pas protégé si laptop volé

**Solutions possibles:**

**Option 1: Chiffrement Database** (Recommandé production)
```bash
# SQLCipher - SQLite chiffré
npm install better-sqlite3-sqlcipher

# Utilisation
const db = new Database('dead-drop.db', {
  key: Buffer.from(userMasterKey, 'hex')
});
```

**Option 2: Chiffrement Sélectif**
```sql
-- Chiffrer uniquement body
INSERT INTO messages (body) VALUES (
  encrypt_aes256(
    'Secret message',
    user_master_key
  )
);
```

**Option 3: Chiffrement Système**
- Windows: BitLocker (chiffre disque entier)
- macOS: FileVault
- Linux: LUKS

---

### Attachments Chiffrés

**✅ Déjà sécurisé:**

```typescript
// Frontend chiffre AVANT upload
const encrypted = await encryptFile(file, masterKey);
// ↓
await upload(encrypted); // Serveur reçoit données chiffrées
// ↓
// Stocké: uploads/att-123.bin (chiffré)
```

**Le serveur ne peut PAS lire les attachments** (chiffrés côté client)

---

## 📝 Checklist Sécurité Données

### Court Terme (1 semaine)

- [ ] **Chiffrer localStorage masterKey**
  ```typescript
  // Avant
  localStorage.setItem('dead-drop-auth', JSON.stringify({ masterKey }));
  
  // Après
  const encrypted = await encryptWithDeviceKey(masterKey);
  localStorage.setItem('dead-drop-auth', JSON.stringify({ 
    masterKey: encrypted 
  }));
  ```

- [ ] **Implémenter export JSON messages**
  - Endpoint `/api/export/messages/json`
  - Bouton UI "Exporter mes messages"
  - Format lisible (JSON)

- [ ] **Documentation utilisateur**
  - Où sont stockées les données
  - Comment faire backup
  - Comment restaurer

### Moyen Terme (1 mois)

- [ ] **SQLCipher - Database chiffrée**
  ```bash
  npm install @journeyapps/sqlcipher
  # Chiffrer dead-drop.db avec master key utilisateur
  ```

- [ ] **Auto-backup cloud optionnel**
  - Google Drive / Dropbox
  - Chiffré avant upload
  - Opt-in utilisateur

- [ ] **Multi-device sync**
  - Synchroniser messages entre devices
  - P2P ou serveur relai optionnel

### Long Terme (3-6 mois)

- [ ] **Chiffrement E2E complet**
  - Chiffrer messages dans database
  - Déchiffrement uniquement avec master key
  - Zero-knowledge architecture

- [ ] **Sharding messages**
  - Séparer messages par conversation
  - Fichiers plus petits
  - Export sélectif

---

## 🎯 Recommandations Immédiates

### 1. Informer Utilisateurs

**Ajouter dans UI:**
```
ℹ️ Vos données sont stockées localement sur votre appareil.
📁 Emplacement: %AppData%\project-chimera\data\
🔒 Pensez à faire des backups réguliers !
💾 Bouton: [Exporter Backup]
```

### 2. Simplifier Export

**Ajouter dans Settings:**
```typescript
<Button onClick={async () => {
  const backup = await api.post('/api/backup/export');
  downloadFile(backup.data, backup.filename);
}}>
  💾 Télécharger Backup Complet
</Button>

<Button onClick={async () => {
  const json = await api.get('/api/export/messages/json');
  downloadJSON(json, 'messages.json');
}}>
  📄 Exporter Messages (JSON)
</Button>
```

### 3. Auto-Backup Activé par Défaut

```typescript
// apps/bridge/src/index.ts
const backupConfig = {
  enabled: true,              // ← Activer par défaut
  intervalHours: 24,          // Backup quotidien
  compress: true,             // Gzip pour économiser espace
  maxBackups: 7               // Garder 1 semaine
};
```

---

## 📚 Documentation Utilisateur à Créer

### Guide "Où sont mes données ?"

```markdown
# Vos Données dans Project Chimera

## Emplacement
Windows: C:\Users\{vous}\AppData\Roaming\project-chimera\data\
macOS: ~/Library/Application Support/project-chimera/data/
Linux: ~/.config/project-chimera/data/

## Fichiers
- dead-drop.db : Tous vos messages et conversations
- uploads/ : Vos fichiers partagés (chiffrés)
- backups/ : Sauvegardes automatiques

## Sécurité
✅ Stockage 100% local (jamais envoyé sur internet)
⚠️ Pensez à sauvegarder régulièrement
🔒 Activez chiffrement disque (BitLocker/FileVault)

## Backup
1. Menu → Paramètres → Exporter Backup
2. Sauvegarder sur clé USB / cloud personnel
3. Restaurer sur autre machine si besoin
```

---

## ✅ Conclusion

### Réponse Finale

**1. Fichiers blockchain ?**
- ❌ **Aucun** - Application lit Bitcoin via APIs (pas de stockage local)

**2. Messages sur device utilisateur ?**
- ✅ **OUI** - Tous les messages sont dans `dead-drop.db` sur le device
- ✅ Exportables via backup (base64)
- ✅ Copiables manuellement (fichier SQLite)

**Architecture:**
- ✅ **100% Local** - Serveur Bridge sur device utilisateur
- ✅ **Pas de cloud** - Données jamais envoyées sur internet
- ✅ **Contrôle total** - Utilisateur propriétaire de ses données
- ✅ **Portable** - Backup/restore entre machines

**Points d'attention:**
- ⚠️ Messages stockés en clair dans database
- ⚠️ Master key dans localStorage (vulnérable XSS)
- ✅ Attachments chiffrés côté client

**Recommandation prioritaire:** Implémenter SQLCipher pour chiffrer `dead-drop.db` avec le master key utilisateur.

---

**Document par:** Droid (Factory AI)  
**Date:** 2025-11-09
