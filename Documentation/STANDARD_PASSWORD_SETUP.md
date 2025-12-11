# 🔒 MOT DE PASSE LOCAL POUR STANDARD

## 📅 Date
11 Novembre 2025

## ✅ STATUT : MOT DE PASSE LOCAL IMPLÉMENTÉ

---

## 🎯 NOUVEAU FLUX STANDARD COMPLET

### Avant
```
Username → Longueur → Mnemonic → Vérification → Bienvenue → Settings
❌ Pas de mot de passe local
❌ Doit ressaisir mnemonic à chaque connexion
```

### Après
```
Username → Longueur → Mnemonic → Vérification → Bienvenue → Password → Settings
✅ Mot de passe local pour cet appareil
✅ Login quotidien avec username + password
```

---

## 🔄 FLUX COMPLET DÉTAILLÉ

### Étape 1-6 : Identique (Username → Bienvenue)
```
1. Choix méthode → Standard
2. Saisir username
3. Choisir longueur (12 ou 24 mots)
4. Affichage mnemonic (grille)
5. Vérification 6 mots aléatoires
6. Page bienvenue (responsabilités)
```

### Étape 7 : Création Mot de Passe Local ✨ NOUVEAU
```
┌──────────────────────────────────────┐
│       🔒 Mot de Passe Local          │
│  Créez un mot de passe pour vous     │
│  connecter facilement sur cet        │
│  appareil                            │
│                                      │
│  Nom d'utilisateur                   │
│  @alice                              │
│                                      │
│  Mot de passe (min 8 caractères)    │
│  [••••••••]                          │
│                                      │
│  Confirmer le mot de passe           │
│  [••••••••]                          │
│                                      │
│  💡 Ce mot de passe est local :      │
│     stocké uniquement sur cet        │
│     appareil. Pour autre appareil,   │
│     ressaisir mnemonic.              │
│                                      │
│  [← Retour]  [Définir mot de passe]  │
└──────────────────────────────────────┘
```

**Validation** :
- Minimum 8 caractères
- Confirmation doit correspondre
- Hashé avec PBKDF2 (10k iterations)

### Étape 8 : Stockage Local
```typescript
// Derive masterKey from mnemonic
const mnemonicString = mnemonic.join(' ');
const masterKeyHex = SHA256(mnemonicString);

// Hash password with PBKDF2
const hashedPassword = PBKDF2(password, username, 10k);

// Store locally
localStorage.setItem(`pwd_${username}`, hashedPassword);
localStorage.setItem(`master_${username}`, masterKeyHex);
```

### Étape 9 : Redirection
```
→ /settings ✅
Session active, compte configuré
```

---

## 🔐 SÉCURITÉ

### Dérivation MasterKey (Mnemonic)
```typescript
// BIP-39 mnemonic → masterKey
const mnemonicString = generatedMnemonic.join(' ');
const encoder = new TextEncoder();
const mnemonicData = encoder.encode(mnemonicString);

// SHA-256 hash (simplified, production would use proper BIP-39 derivation)
const masterKeyBuffer = await crypto.subtle.digest('SHA-256', mnemonicData);
const masterKeyHex = Array.from(new Uint8Array(masterKeyBuffer))
  .map(b => b.toString(16).padStart(2, '0'))
  .join('');
```

**Note** : En production, utiliser `bip39.mnemonicToSeed()` pour dérivation complète.

---

### Hashage Password (PBKDF2)
```typescript
const salt = encoder.encode(username);
const passwordKey = await crypto.subtle.importKey(
  'raw',
  encoder.encode(standardPassword),
  'PBKDF2',
  false,
  ['deriveBits']
);

const derivedBits = await crypto.subtle.deriveBits(
  {
    name: 'PBKDF2',
    salt: salt,
    iterations: 10000,
    hash: 'SHA-256',
  },
  passwordKey,
  256
);

const hashedPassword = Array.from(new Uint8Array(derivedBits))
  .map(b => b.toString(16).padStart(2, '0'))
  .join('');
```

**Paramètres** :
- Algo : PBKDF2
- Iterations : 10,000
- Hash : SHA-256
- Salt : Username
- Output : 256 bits (32 bytes)

---

### Stockage Local
```typescript
localStorage.setItem(`pwd_${username}`, hashedPassword);
localStorage.setItem(`master_${username}`, masterKeyHex);
```

**Sécurité** :
- ✅ Password jamais stocké en clair
- ✅ MasterKey dérivé du mnemonic
- ✅ Local à l'appareil (pas synchronisé)
- ✅ Username comme salt

---

## 📊 COMPARAISON STANDARD VS DICEKEY

| Aspect | Standard | DiceKey |
|--------|----------|---------|
| **Input initial** | BIP-39 (12/24 mots) | 300 dés |
| **MasterKey source** | Mnemonic (SHA-256) | Dés (PBKDF2) |
| **Vérification** | 6 mots aléatoires | 6 checksums aléatoires |
| **Password local** | ✅ OUI | ✅ OUI |
| **Login quotidien** | Username + password | Username + password |
| **Nouveau device** | Ressaisir mnemonic | Ressaisir credentials |

**Point commun** : Les deux ont maintenant un mot de passe local ! ✅

---

## 🎨 COMPOSANT CRÉÉ

### StandardPasswordForm (130 lignes)

**Props** :
```typescript
{
  username: string;
  password: string;
  passwordConfirm: string;
  error: string;
  onPasswordChange: (val: string) => void;
  onPasswordConfirmChange: (val: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}
```

**Features** :
- 🔒 Icône cadenas animé
- @username affiché
- 2 inputs (password + confirm)
- Validation en temps réel
- Message d'erreur animé
- Info box "Mot de passe local"
- Buttons retour + soumettre
- Disabled si < 8 chars ou pas match

---

## 🧪 TEST COMPLET

### Signup Standard avec Password
```
1. http://localhost:5178/signup
2. Choisir "Standard"
3. Username "alice"
4. Choisir "12 Mots"
5. → Mnemonic affiché
6. Noter les 12 mots sur papier
7. Cliquer "J'ai noté ma phrase"

8. → VÉRIFICATION 6 MOTS
9. Saisir les 6 mots demandés
10. Cliquer "Vérifier et continuer"

11. → PAGE BIENVENUE
12. Lire les 4 responsabilités
13. Cliquer "Commencer à utiliser Dead Drop"

14. → MOT DE PASSE LOCAL ✨
15. Saisir password : "MonPassword123"
16. Confirmer : "MonPassword123"
17. Cliquer "Définir le mot de passe"

18. → /settings ✅
19. Compte créé, session active
```

**Temps total** : 2-3 minutes

---

### Login Standard avec Password
```
1. http://localhost:5178/login
2. Choisir "Standard"
3. Username : alice
4. Password : MonPassword123
5. Cliquer "Se connecter"
6. → /settings ✅
```

**Temps** : 10 secondes

---

## 📝 FICHIERS MODIFIÉS

### SignupFluid.tsx (+200 lignes)

**Step ajouté** :
- `standard-password` : Création mot de passe local

**States ajoutés** :
```typescript
const [standardPassword, setStandardPassword] = useState('');
const [standardPasswordConfirm, setStandardPasswordConfirm] = useState('');
const [passwordError, setPasswordError] = useState('');
```

**Handler ajouté** :
```typescript
handleStandardPasswordSubmit() {
  // Validate password (8+ chars, match)
  // Derive masterKey from mnemonic (SHA-256)
  // Hash password with PBKDF2 (10k iterations)
  // Store in localStorage
  // Navigate to /settings
}
```

**Composant créé** :
- `<StandardPasswordForm />` : 130 lignes

---

## 🔄 FLUX COMPLET FINAL

### Standard Signup (8 étapes)
```
1. MethodChoice     → Standard
2. Username         → alice
3. LengthChoice     → 12 mots
4. MnemonicDisplay  → Grille 12 mots
5. Verification     → 6 mots aléatoires
6. Welcome          → Bienvenue + responsabilités
7. PasswordSetup    → Créer mot de passe local ✨
8. Settings         → Compte actif
```

### DiceKey Signup (9 étapes)
```
1. MethodChoice     → DiceKey
2. Username         → bob
3. DiceKeyInput     → 300 dés
4. Generating       → Génération clés
5. Display          → userId + checksums
6. Welcome          → Bienvenue + responsabilités
7. Verification     → 6 checksums aléatoires
8. PasswordSetup    → Créer mot de passe local
9. Settings         → Compte actif
```

---

## 📊 STATISTIQUES

| Métrique | Valeur |
|----------|--------|
| **Step ajouté** | 1 (standard-password) |
| **Composant créé** | 1 (StandardPasswordForm) |
| **States ajoutés** | 3 (password, confirm, error) |
| **Handler ajouté** | 1 (handleStandardPasswordSubmit) |
| **Lignes ajoutées** | 200+ |
| **Total SignupFluid** | 1250+ lignes |

---

## 🎉 RÉSUMÉ

### Problème
❌ Standard n'avait pas de mot de passe local  
❌ User devait ressaisir mnemonic à chaque login  

### Solution
✅ Page password après bienvenue  
✅ Validation 8+ chars + confirmation  
✅ PBKDF2 hashage (10k iterations)  
✅ Stockage localStorage  

### Impact
- 🔒 **Sécurité** : Password hashé, jamais en clair
- ⚡ **UX** : Login rapide (username + password)
- 🎯 **Parité** : Standard = DiceKey (même workflow)
- 💾 **Local** : Spécifique à chaque appareil

---

## 🔑 UTILISATION

### Inscription
```
Standard signup → Set password → /settings
```

### Connexion (même appareil)
```
Username + password → /settings
```

### Connexion (autre appareil)
```
Username + mnemonic (12/24 mots) → /settings
```

---

**FIN DU DOCUMENT - PASSWORD LOCAL STANDARD** ✅🔒

**Testez maintenant sur http://localhost:5178/signup !**
