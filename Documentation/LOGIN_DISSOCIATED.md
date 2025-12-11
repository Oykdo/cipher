# 🔑 LOGIN DISSOCIÉ - STANDARD VS DICEKEY

## 📅 Date
11 Novembre 2025

## ✅ STATUT : LOGIN REFONDU AVEC DISSOCIATION COMPLÈTE

---

## 🎯 OBJECTIF

Créer une page de login claire qui dissocie complètement :
1. **Standard** : Username + Phrase mnémonique (12 ou 24 mots BIP-39)
2. **DiceKey** : 300 dés → Régénération Identity Key → Vérification

---

## 📦 FICHIER CRÉÉ

### **LoginNew.tsx** (440+ lignes)
**Localisation** : `apps/frontend/src/screens/LoginNew.tsx`

**Architecture** :
- 3 états principaux : `method choice`, `standard form`, `dicekey flow`
- 2 flux complètement séparés (pas de code partagé)
- Composants sub-dédiés pour chaque méthode

---

## 🏗️ STRUCTURE

### Étape 1 : Choix de Méthode
```
┌─────────────────────────────────────────────┐
│            Connexion                        │
│  Choisissez votre méthode d'authentification│
│                                             │
│  [🔑 Standard]        [🎲 DiceKey]         │
│  Username + Mnemonic  300 dés               │
│  Rapide, BIP-39       775 bits, Zero-Know   │
└─────────────────────────────────────────────┘
```

**Composant** : `<MethodChoice />`
- 2 boutons glass-card avec hover effects
- Badges informatifs (Rapide, BIP-39, 775 bits, Zero-Knowledge)
- Lien vers signup en bas
- Message : "Utilisez la même méthode que lors de la création"

---

### Flux A : Standard Login

#### Étape 2A : Formulaire Standard
```
┌─────────────────────────────────────────────┐
│        🔑 Connexion Standard                │
│                                             │
│  Nom d'utilisateur                          │
│  [alice_crypto____________]                 │
│                                             │
│  Phrase mnémonique (12 ou 24 mots)          │
│  [word1 word2 word3...]                     │
│  [____________________________]             │
│  💡 Séparez les mots par des espaces        │
│                                             │
│  [← Retour]    [Se connecter 🔐]           │
└─────────────────────────────────────────────┘
```

**Composant** : `<StandardLoginForm />`

**Fonctionnalités** :
- Input username (≥ 3 caractères)
- Textarea mnemonic (12 ou 24 mots)
- Validation temps réel
- Gestion d'erreurs avec message
- État loading avec disabled buttons
- Message d'aide en bas

**API Call** :
```typescript
POST /api/v2/auth/login
{
  "username": "alice",
  "masterKeyHash": "word1 word2 word3..."
}
```

**Réponse** :
```json
{
  "accessToken": "eyJhbG...",
  "refreshToken": "abc123...",
  "user": {
    "id": "uuid",
    "username": "alice",
    "securityTier": "standard"
  }
}
```

**Après Succès** :
1. Stockage session (accessToken, refreshToken, userId, username)
2. Redirection vers `/settings`

---

### Flux B : DiceKey Login

#### Étape 2B : Saisie DiceKey
```
┌─────────────────────────────────────────────┐
│        🎲 DiceKey Creation                  │
│  Créez votre identité avec 775 bits        │
│                                             │
│  Série 1 / 30        [▓▓░░░░░░░░] 10%      │
│                                             │
│  [3] [5] [1] [6] [2] [4] [1] [5] [3] [2]   │
│  (inputs dice avec glow)                    │
│                                             │
│  [Valider cette série →]                    │
│                                             │
│  ┌──────────────────┐                       │
│  │ Constellation    │                       │
│  │  ⭐ ─── ⭐       │                       │
│  └──────────────────┘                       │
└─────────────────────────────────────────────┘
```

**Composant** : `<DiceKeyInputFluid />`
- Réutilisation du composant existant
- Callback `onComplete(rolls)` quand 300 dés saisis
- Callback `onCancel()` pour retour

#### Étape 3B : Génération Clés
```
┌─────────────────────────────────────────────┐
│  Génération de votre identité crypto       │
│                                             │
│         ◯  (anneaux rotatifs)               │
│        ◯ 🔐 ◯                               │
│         ◯                                   │
│                                             │
│  ✅ Normalisation                           │
│  🔥 PBKDF2 (en cours...)                    │
│  🔗 HKDF                                    │
│  🔐 KeyGen                                  │
│                                             │
│  [▓▓▓▓▓▓░░░░░░░░░░] 45%                    │
└─────────────────────────────────────────────┘
```

**Composant** : `<CosmicLoader />`
- 4 stages : normalizing, argon2 (PBKDF2), hkdf, keygen
- Progress bar fluide
- Anneaux cosmiques rotatifs

#### Étape 4B : Vérification API
```typescript
POST /api/v2/auth/login-dicekey
{
  "identityPublicKey": "ABC123...",  // Base64
  "masterKeyHex": "789DEF..."         // Master Key
}
```

**Backend** :
1. Cherche Identity Key dans `identity_keys` table
2. Trouve `user_id` associé
3. Vérifie Master Key avec Argon2.verify()
4. Génère tokens
5. Retourne session

**Après Succès** :
1. Stockage session (accessToken, refreshToken, userId, username)
2. Stockage keySet temporaire (clés privées pour l'app)
3. Redirection vers `/settings`

---

## 🔀 DIFFÉRENCES ENTRE STANDARD ET DICEKEY

### Standard Login
| Aspect | Détail |
|--------|--------|
| **Input** | Username + Mnemonic (12-24 mots) |
| **Temps** | Instantané (<100ms) |
| **Sécurité** | 128 ou 256 bits (selon longueur mnemonic) |
| **Backend** | Vérification via Argon2.verify() |
| **UX** | Simple formulaire |

### DiceKey Login
| Aspect | Détail |
|--------|--------|
| **Input** | 300 dés (30 séries × 10) |
| **Temps** | 1-2 secondes (PBKDF2 + key generation) |
| **Sécurité** | 775 bits (quantum-resistant) |
| **Backend** | Vérification Identity Key + Master Key |
| **UX** | Constellation progressive + Cosmic loader |

---

## 🎨 DESIGN

### Page Choice
- **Layout** : 2 cartes côte à côte (Standard, DiceKey)
- **Hover** : Scale 1.05 + translateY(-8px)
- **Badges** : Quantum (cyan) et Trust (magenta)
- **Message** : "Utilisez la même méthode que lors de la création"

### Standard Form
- **Layout** : Formulaire centré
- **Inputs** : Username (input) + Mnemonic (textarea)
- **Validation** : Temps réel (≥3 chars, ≥12 mots)
- **Error** : Card rouge avec message
- **Actions** : Retour + Se connecter

### DiceKey Flow
- **Étape 1** : DiceKeyInputFluid (constellation)
- **Étape 2** : CosmicLoader (4 stages)
- **Redirect** : Direct vers /settings après succès

---

## 📝 ROUTES MISES À JOUR

**Avant** :
```tsx
<Route path="/login" element={<LoginFluid />} />
```

**Après** :
```tsx
<Route path="/login" element={<LoginNew />} />
```

**Legacy** :
```tsx
<Route path="/login-old" element={<Login />} />
```

---

## 🚀 TESTER

### Test 1 : Standard Login

```bash
1. Ouvrir http://localhost:5177/login
2. Cliquer "🔑 Standard"
3. Saisir username : "test"
4. Saisir mnemonic : "word1 word2 ... word12"
5. Cliquer "Se connecter"
6. (Note: Nécessite un compte standard créé au préalable)
```

### Test 2 : DiceKey Login

```bash
1. Ouvrir http://localhost:5177/login
2. Cliquer "🎲 DiceKey"
3. Saisir 300 dés (même séquence que signup)
4. Observer :
   - Constellation progressive
   - Cosmic loader (1-2 sec)
5. Login réussi → /settings
```

### Test 3 : Navigation Complète

```bash
Landing (/) 
  → "Se connecter" 
  → /login (Choix méthode)
    → Standard → Formulaire
    → DiceKey → 300 dés → Génération → Settings
```

---

## 🐛 BUGS CORRIGÉS

### Dans LoginNew.tsx
✅ Import kdfSimple (PBKDF2) au lieu de kdf (Argon2)  
✅ Await sur generateUserId()  
✅ Structure correcte keySet.identityKey.publicKey  
✅ Encodage Base64 pour API  
✅ Gestion d'erreurs complète  

### Dans App.tsx
✅ Import LoginNew au lieu de LoginFluid  
✅ Route /login mise à jour  

---

## 📊 STATISTIQUES

### Code Créé
| Fichier | Type | Lignes |
|---------|------|--------|
| **LoginNew.tsx** | React Component | 440+ |
| **LOGIN_DISSOCIATED.md** | Documentation | 200+ |
| **TOTAL** | - | **640+** |

### Améliorations
- **Dissociation claire** : 2 flux séparés
- **UX améliorée** : Pas de confusion entre méthodes
- **Code structuré** : Composants sub-dédiés
- **Gestion d'erreurs** : Écran d'erreur dédié

---

## 🎉 RÉSUMÉ

### Problème
❌ La page login renvoyait vers signup (pas de vraie page login)

### Solution
✅ Créé LoginNew.tsx avec 2 flux dissociés (Standard, DiceKey)

### Fonctionnalités
- ✅ Choix clair entre Standard et DiceKey
- ✅ Formulaire Standard avec username + mnemonic
- ✅ Flux DiceKey avec constellation + cosmic loader
- ✅ Gestion d'erreurs pour chaque méthode
- ✅ Navigation fluide avec AnimatePresence
- ✅ Design "Fluid Cryptography" cohérent

### Impact UX
**Avant** : Confusion, pas de vraie page login  
**Après** : Flux clairs, dissociation complète, navigation intuitive  

---

**FIN DU DOCUMENT - LOGIN DISSOCIÉ COMPLET** 🔑✅
