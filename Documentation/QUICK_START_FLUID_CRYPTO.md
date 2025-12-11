# ⚡ QUICK START - FLUID CRYPTOGRAPHY

## 🎯 EN 3 MINUTES : Activer le Nouveau Design

### Étape 1 : Vérifier l'Installation (30 sec)

```bash
cd apps/frontend
npm list framer-motion
```

✅ Si installé : passer à l'étape 2  
❌ Si manquant : `npm install framer-motion`

---

### Étape 2 : Activer le Design System (1 min)

Le CSS est déjà importé dans `main.tsx` :
```tsx
import './styles/fluidCrypto.css';  // ✅ Déjà fait
```

---

### Étape 3 : Activer le Nouveau Signup (1 min)

**Méthode Rapide (recommandée pour tests)** :
```bash
cd apps/frontend/src/screens
mv Signup.tsx SignupOld.tsx.bak
mv SignupFluid.tsx Signup.tsx
```

**Méthode Alternative (sans casser l'ancien)** :
Éditer `App.tsx` ou votre fichier de routes :
```tsx
import SignupFluid from './screens/SignupFluid';

// Remplacer
<Route path="/signup" element={<Signup />} />
// Par
<Route path="/signup" element={<SignupFluid />} />
```

---

### Étape 4 : Tester (30 sec)

```bash
npm run dev
```

Ouvrir : `http://localhost:5173/signup`

**Vous devriez voir** :
- ✨ Fond Dark Matter avec texture
- 🎲 Choix "DiceKey (300 lancers)" avec badge recommandé
- 🌌 Constellation progressive si vous choisissez DiceKey

---

## 🎨 APERÇU VISUEL

### Écran "Choose Method"
```
┌────────────────────────────────────────────┐
│         Créer Votre Compte                 │
│   (Titre cyan avec glow pulsant)           │
│                                            │
│  [🔑 Standard]      [🎲 DiceKey]          │
│  Rapide             RECOMMANDÉ             │
│  256 bits           775 bits               │
│  (carte glass)      (carte glass magenta)  │
└────────────────────────────────────────────┘
```

### Écran "DiceKey Input"
```
┌────────────────────────────────────────────┐
│  🎲 DiceKey Creation                       │
│  Série 1 / 30           [▓▓▓░░░░░░░] 30%  │
│                                            │
│  Dé 1  Dé 2  Dé 3  Dé 4  Dé 5             │
│  [ 3 ] [ 5 ] [ 1 ] [ 6 ] [ 2 ]            │
│  (inputs stylisés cyan avec glow)          │
│                                            │
│  Dé 6  Dé 7  Dé 8  Dé 9  Dé 10            │
│  [   ] [   ] [   ] [   ] [   ]            │
│                                            │
│  [Valider cette série →]                   │
│  Checksum: A1B2                            │
│                                            │
│  ┌──────────────────────┐                 │
│  │ Constellation         │                 │
│  │  ⭐ ─── ⭐ ─── ⭐      │                 │
│  │  5 / 30 étoiles       │                 │
│  └──────────────────────┘                 │
└────────────────────────────────────────────┘
```

### Écran "Generating"
```
┌────────────────────────────────────────────┐
│      Génération de votre identité          │
│                                            │
│         ◯  (anneaux rotatifs)              │
│        ◯ 🔐 ◯                              │
│         ◯                                  │
│                                            │
│  ✅ Normalisation                          │
│  🔥 Argon2id (en cours...)                 │
│  🔗 HKDF                                   │
│  🔐 KeyGen                                 │
│                                            │
│  [▓▓▓▓▓▓░░░░░░░░░░] 45%                   │
└────────────────────────────────────────────┘
```

### Écran "Results"
```
┌────────────────────────────────────────────┐
│  🎉 (particules explosent)                 │
│      Identité Créée !                      │
│                                            │
│  Votre Identité Unique                     │
│  abc123def456 (glow pulsant) 📋           │
│  @alice                                    │
│                                            │
│  🔑 Clés Générées                          │
│  ✅ Identity Key (Ed25519)                 │
│  ✅ Signature Key (Ed25519)                │
│  ✅ Signed Pre-Key (X25519)                │
│  ✅ 100 One-Time Pre-Keys                  │
│                                            │
│  [Créer mon compte ✨]                     │
└────────────────────────────────────────────┘
```

---

## 🧩 COMPOSANTS DISPONIBLES

### Classes CSS Rapides

```tsx
// Backgrounds
<div className="dark-matter-bg">Fond avec texture</div>

// Boutons
<button className="btn btn-primary">Principal</button>
<button className="btn btn-secondary">Secondaire</button>
<button className="btn btn-ghost">Transparent</button>

// Cartes
<div className="glass-card p-6">Contenu</div>
<div className="glass-card card-hover">Avec hover</div>

// Inputs
<input className="input" placeholder="Texte" />
<input className="dice-input" type="number" />

// Progress
<div className="progress-container">
  <div className="progress-fill" style={{ width: '50%' }} />
</div>

// Badges
<div className="badge badge-quantum">
  <span>🔐</span> <span>Zero-Knowledge</span>
</div>

// Animations
<div className="animate-fade-in">Apparition</div>
<div className="animate-slide-up">Montée</div>
<div className="animate-glow-pulse">Pulse</div>

// Glow
<div className="glow-cyan">Box glow</div>
<h1 className="glow-text-cyan">Text glow</h1>
```

---

### Composants React

```tsx
// 1. Saisie DiceKey
import DiceKeyInputFluid from '../components/DiceKeyInputFluid';

<DiceKeyInputFluid
  onComplete={(rolls) => console.log(rolls)}
  onCancel={() => history.back()}
/>

// 2. Loader Cosmique
import CosmicLoader from '../components/CosmicLoader';

<CosmicLoader
  stage="argon2"  // normalizing | argon2 | hkdf | keygen | complete
  progress={45}
/>

// 3. Résultats
import DiceKeyResults from '../components/DiceKeyResults';

<DiceKeyResults
  userId="abc123"
  username="alice"
  keysGenerated={{
    identityKey: true,
    signatureKey: true,
    signedPreKey: true,
    oneTimePreKeysCount: 100,
  }}
  checksums={['A1B2', 'C3D4', ...]}
  onConfirm={() => createAccount()}
  onRetry={() => restart()}
/>
```

---

## 🎨 PERSONNALISATION RAPIDE

### Changer les Couleurs

Éditer `apps/frontend/src/styles/fluidCrypto.css` :

```css
:root {
  /* Cyan → Votre couleur */
  --quantum-cyan: #00e5ff;  /* Changez ici */
  
  /* Magenta → Votre couleur */
  --magenta-trust: #d946ef;  /* Changez ici */
}
```

### Changer les Animations

```css
:root {
  /* Plus rapide */
  --duration-normal: 200ms;  /* au lieu de 300ms */
  
  /* Moins de bounce */
  --ease-bounce: cubic-bezier(0.68, -0.25, 0.265, 1.25);
}
```

---

## 🔧 DÉPANNAGE RAPIDE

### Q: Les animations ne fonctionnent pas
```tsx
// Vérifier que le CSS est importé
import './styles/fluidCrypto.css';  // dans main.tsx
```

### Q: Framer Motion erreur
```bash
npm install framer-motion
```

### Q: Glassmorphism flou sur Safari
```css
/* Ajouter préfixe */
-webkit-backdrop-filter: blur(20px);
```

### Q: Les sons ne marchent pas
```tsx
// Ce sont des placeholders, ajoutez vos fichiers audio :
const clickSound = new Audio('/sounds/click.mp3');
```

---

## 📚 DOCUMENTATION COMPLÈTE

- **FLUID_CRYPTO_GUIDE.md** : Guide détaillé avec exemples
- **UI_UX_REDESIGN_COMPLETE.md** : Design system complet
- **SESSION_FINALE_FLUID_CRYPTO.md** : Récapitulatif session

---

## 🎉 C'EST TOUT !

En 3 minutes, vous avez activé le design "Fluid Cryptography" complet.

**Testez maintenant** :
```bash
npm run dev
# → http://localhost:5173/signup
```

**Profitez** :
- ✨ Constellation progressive
- 🌌 Cosmic loader
- 🎨 Glassmorphism & glow
- ⚡ Animations fluides
- 🔐 775 bits d'entropie

---

**ENJOY THE FLUID ! 🌊✨**
