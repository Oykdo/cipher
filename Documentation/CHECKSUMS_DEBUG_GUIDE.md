# 🔍 Guide de débogage - Checksums DiceKey

## ✅ Modifications apportées

### Welcome.tsx
1. **Ajout du bouton copier** :
   - État `copiedChecksums` 
   - Fonction `copyAllChecksums()` 
   - Bouton "📋 Copier tout" avec feedback visuel

2. **Numérotation des checksums** :
   - Affichage `#1`, `#2`, ..., `#30` au-dessus de chaque checksum
   - Layout amélioré avec colonnes

3. **Vérification 10 checksums** :
   - 10 champs de saisie (au lieu de 6)
   - Demande de 10 checksums aléatoires

4. **Création automatique du compte** :
   - Appel API `/auth/signup` après vérification réussie
   - Redirection automatique vers définition mot de passe

---

## 🔄 Flux complet

### 1. SignupFluid.tsx
```javascript
handleDiceKeyComplete(rolls: number[]) {
  // Calcul des checksums à partir des 300 dés
  const series = splitIntoSeries(rolls); // 30 séries de 10 dés
  const calculatedChecksums = series.map((s) => calculateSeriesChecksum(s));
  setChecksums(calculatedChecksums); // ✅ 30 checksums
  
  // Stockage dans pendingSignup
  sessionStorage.setItem('pendingSignup', JSON.stringify({
    username,
    userId: generatedUserId,
    checksums, // ✅ 30 checksums
    masterKeyHex: seeds.masterKey,
    keySet: serializeKeySet(keySet),
  }));
}

handleConfirmSignup() {
  const data = JSON.parse(sessionStorage.getItem('pendingSignup'));
  navigate('/welcome', {
    state: {
      userId: data.userId,
      username: data.username,
      checksums: data.checksums, // ✅ 30 checksums passés
    },
  });
}
```

### 2. Welcome.tsx
```javascript
export default function Welcome() {
  const location = useLocation();
  const state = location.state as WelcomeState | null;
  
  if (!state || !state.userId || !state.checksums) {
    // Rediriger si pas de données
    navigate('/');
    return null;
  }
  
  const { userId, username, checksums } = state; // ✅ 30 checksums reçus
  
  // Génération de 10 checksums aléatoires
  useEffect(() => {
    if (checksums.length === 30) {
      const indices: number[] = [];
      while (indices.length < 10) {
        const rand = Math.floor(Math.random() * 30);
        if (!indices.includes(rand)) {
          indices.push(rand);
        }
      }
      indices.sort((a, b) => a - b);
      setRandomChecksums(indices.map(i => ({ index: i, value: checksums[i] })));
    }
  }, [checksums]);
  
  // Affichage
  return (
    <div>
      <h3>Vos Checksums de Vérification ({checksums.length} séries)</h3>
      {checksums.map((checksum, idx) => (
        <div>
          <span>#{idx + 1}</span>
          <span>{checksum}</span>
        </div>
      ))}
    </div>
  );
}
```

---

## 🐛 Points de vérification

### Si "0 séries" s'affiche :

#### Vérification 1 : Checksums générés ?
Ajoutez un console.log dans SignupFluid.tsx :

```javascript
const handleDiceKeyComplete = async (rolls: number[]) => {
  const series = splitIntoSeries(rolls);
  const calculatedChecksums = series.map((s) => calculateSeriesChecksum(s));
  console.log('✅ Checksums générés:', calculatedChecksums.length, calculatedChecksums);
  setChecksums(calculatedChecksums);
  // ...
}
```

**Attendu** : `✅ Checksums générés: 30 ['abc123', 'def456', ...]`

#### Vérification 2 : Checksums dans pendingSignup ?
Ajoutez un console.log avant navigation :

```javascript
const handleConfirmSignup = () => {
  const pendingData = sessionStorage.getItem('pendingSignup');
  const data = JSON.parse(pendingData);
  console.log('✅ Données pendingSignup:', data);
  console.log('✅ Checksums dans pendingSignup:', data.checksums?.length);
  navigate('/welcome', {
    state: {
      userId: data.userId,
      username: data.username,
      checksums: data.checksums,
    },
  });
};
```

**Attendu** : 
```
✅ Données pendingSignup: { username: "alice", userId: "...", checksums: [...], ... }
✅ Checksums dans pendingSignup: 30
```

#### Vérification 3 : Checksums reçus dans Welcome ?
Ajoutez un console.log dans Welcome.tsx :

```javascript
export default function Welcome() {
  const location = useLocation();
  const state = location.state as WelcomeState | null;
  
  console.log('✅ State reçu dans Welcome:', state);
  console.log('✅ Checksums reçus:', state?.checksums?.length);
  
  if (!state || !state.userId || !state.checksums) {
    navigate('/');
    return null;
  }
  
  const { userId, username, checksums } = state;
  console.log('✅ Checksums finaux:', checksums.length, checksums);
  // ...
}
```

**Attendu** :
```
✅ State reçu dans Welcome: { userId: "...", username: "alice", checksums: [...] }
✅ Checksums reçus: 30
✅ Checksums finaux: 30 ['abc123', 'def456', ...]
```

---

## 🧪 Test manuel complet

### Étape 1 : Ouvrir la console du navigateur
- **Chrome/Edge** : F12 ou Ctrl+Shift+I
- Onglet "Console"

### Étape 2 : Créer un compte DiceKey
1. Aller sur `/signup`
2. Choisir "🎲 DiceKey"
3. Saisir username : `test_user`
4. Laisser générer 300 lancers

**Console attendue** :
```
✅ Checksums générés: 30 [...]
```

### Étape 3 : Vérifier l'affichage des checksums
1. Sur la page DiceKeyResults
2. Vérifier : "📝 Vos Checksums de Vérification (30 séries)"
3. Vérifier : Chaque checksum a un numéro `#1`, `#2`, ..., `#30`
4. Cliquer sur "📋 Copier tout"
5. Coller dans notepad → Format : `1. abc123\n2. def456\n...`

### Étape 4 : Cliquer "Créer mon compte"
**Console attendue** :
```
✅ Données pendingSignup: {...}
✅ Checksums dans pendingSignup: 30
```

### Étape 5 : Page Welcome
**Console attendue** :
```
✅ State reçu dans Welcome: {...}
✅ Checksums reçus: 30
✅ Checksums finaux: 30 [...]
```

**Visuel attendu** :
- ✅ "Vos Checksums de Vérification (30 séries)"
- ✅ 30 checksums numérotés `#1` à `#30`
- ✅ Bouton "📋 Copier tout" en haut à droite
- ✅ Message : "Notez ces checksums NUMÉROTÉS sur papier"

### Étape 6 : Cliquer "J'ai noté mes informations, vérifier maintenant"
**Visuel attendu** :
- ✅ Titre : "🔍 Vérification de vos notes"
- ✅ 10 champs de saisie avec labels : "Série 3", "Série 7", ..., etc.

### Étape 7 : Saisir les 10 checksums
1. Regarder le numéro demandé (ex: "Série 3")
2. Retrouver le checksum `#3` dans vos notes
3. Le saisir dans le champ
4. Répéter pour les 10 checksums

### Étape 8 : Cliquer "Vérifier et créer le compte"
**Console attendue** :
```
✅ Vérification réussie !
✅ Création du compte...
✅ Compte créé, redirection...
```

**Visuel attendu** :
- ✅ Bouton affiche : "🔄 Création du compte..."
- ✅ Redirection automatique vers page de mot de passe
- ✅ Username pré-rempli

### Étape 9 : Définir mot de passe
1. Saisir mot de passe (min 6 caractères)
2. Confirmer
3. Cliquer "Définir le mot de passe"

**Visuel attendu** :
- ✅ Redirection automatique vers `/conversations`
- ✅ Compte créé et connecté !

---

## ❌ Problèmes courants

### Problème 1 : "0 séries" affiché
**Cause** : Checksums non générés ou non passés

**Solution** :
1. Vérifier que `calculateSeriesChecksum()` fonctionne
2. Vérifier que `splitIntoSeries()` retourne 30 séries
3. Ajouter console.log dans `handleDiceKeyComplete`

### Problème 2 : Rien ne s'affiche dans la vérification
**Cause** : `randomChecksums` vide

**Solution** :
1. Vérifier que `checksums.length === 30`
2. Vérifier que le useEffect se déclenche
3. Ajouter console.log dans le useEffect

### Problème 3 : Navigation ne fonctionne pas
**Cause** : State non passé correctement

**Solution** :
1. Vérifier `navigate('/welcome', { state: {...} })`
2. Vérifier `location.state` dans Welcome
3. Utiliser React DevTools pour inspecter les props

---

## 🔧 Code de débogage complet

### SignupFluid.tsx
```javascript
const handleDiceKeyComplete = async (rolls: number[]) => {
  setDiceRolls(rolls);
  
  // Calculate checksums
  const series = splitIntoSeries(rolls);
  const calculatedChecksums = series.map((s) => calculateSeriesChecksum(s));
  
  console.log('=== DEBUG CHECKSUMS ===');
  console.log('Rolls:', rolls.length);
  console.log('Series:', series.length);
  console.log('Checksums:', calculatedChecksums.length, calculatedChecksums);
  console.log('=======================');
  
  setChecksums(calculatedChecksums);
  // ...
};
```

### Welcome.tsx
```javascript
export default function Welcome() {
  const location = useLocation();
  const state = location.state as WelcomeState | null;
  
  console.log('=== DEBUG WELCOME ===');
  console.log('State:', state);
  console.log('Checksums:', state?.checksums);
  console.log('=====================');
  
  // ...
}
```

---

## ✅ Checklist de vérification

- [ ] Console ouverte (F12)
- [ ] Créer compte DiceKey
- [ ] Voir "Checksums générés: 30" dans console
- [ ] Voir 30 checksums numérotés sur DiceKeyResults
- [ ] Bouton "Copier tout" fonctionne
- [ ] Cliquer "Créer mon compte"
- [ ] Voir "Checksums dans pendingSignup: 30" dans console
- [ ] Page Welcome affiche 30 checksums numérotés
- [ ] Bouton "Copier tout" fonctionne sur Welcome
- [ ] Cliquer "J'ai noté mes informations"
- [ ] Voir 10 champs de saisie
- [ ] Saisir 10 checksums corrects
- [ ] Cliquer "Vérifier et créer le compte"
- [ ] Voir "🔄 Création du compte..."
- [ ] Redirection automatique vers mot de passe
- [ ] Définir mot de passe
- [ ] Redirection automatique vers conversations

---

**Date** : 2025-11-12  
**Statut** : 🔧 **DÉBOGAGE EN COURS**  

Si le problème persiste après ces vérifications, partagez les messages de console et je pourrai vous aider davantage ! 🚀
