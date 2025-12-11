# 🧪 Test des checksums - Instructions

## ✅ Console.log ajoutés

J'ai ajouté des console.log de débogage dans 3 endroits clés :

### 1. SignupFluid.tsx - handleDiceKeyComplete (ligne 242)
```javascript
console.log('=== DICEKEY COMPLETE DEBUG ===');
console.log('Rolls:', rolls.length);              // Devrait être 300
console.log('Series:', series.length);            // Devrait être 30
console.log('Checksums calculated:', calculatedChecksums.length);  // Devrait être 30
console.log('Checksums:', calculatedChecksums);   // Array de 30 checksums
console.log('===============================');
```

### 2. SignupFluid.tsx - handleConfirmSignup (ligne 312)
```javascript
console.log('=== CONFIRM SIGNUP DEBUG ===');
console.log('PendingData raw:', pendingData);     // String JSON
console.log('PendingData parsed:', data);         // Object avec checksums
console.log('Checksums in pendingData:', data.checksums);  // Array de 30
console.log('Checksums length:', data.checksums?.length);  // 30
console.log('============================');
```

### 3. Welcome.tsx - Component load (ligne 19)
```javascript
console.log('=== WELCOME DEBUG ===');
console.log('Location state:', state);            // Devrait contenir userId, username, checksums
console.log('Checksums received:', state?.checksums);  // Array de 30
console.log('Checksums length:', state?.checksums?.length);  // 30
console.log('====================');

// Plus loin :
console.log('Checksums extracted:', checksums.length, checksums);
```

---

## 🧪 Instructions de test

### Étape 1 : Ouvrir la console du navigateur
1. Ouvrir http://localhost:5189
2. Appuyer sur **F12** (ou Ctrl+Shift+I)
3. Aller dans l'onglet **Console**
4. Garder la console ouverte pendant tout le test

### Étape 2 : Créer un compte DiceKey
1. Cliquer sur "Créer un compte"
2. Choisir "🎲 DiceKey"
3. Saisir un username : `test_debug`
4. Laisser générer les 300 lancers de dés

**Console attendue** :
```
=== DICEKEY COMPLETE DEBUG ===
Rolls: 300
Series: 30
Checksums calculated: 30
Checksums: ['abc123', 'def456', 'xyz789', ...]
===============================
```

### Étape 3 : Vérifier l'affichage DiceKeyResults
1. Sur la page, vérifier :
   - ✅ "📝 Vos Checksums de Vérification (30 séries)"
   - ✅ Chaque checksum a un numéro #1, #2, ..., #30
   - ✅ Bouton "📋 Copier tout" visible

2. Cliquer sur "Créer mon compte"

**Console attendue** :
```
=== CONFIRM SIGNUP DEBUG ===
PendingData raw: {"username":"test_debug", "userId":"...", "checksums":[...], ...}
PendingData parsed: {username: "test_debug", userId: "...", checksums: Array(30), ...}
Checksums in pendingData: ['abc123', 'def456', ...]
Checksums length: 30
============================
```

### Étape 4 : Page Welcome - Vérifier les checksums
**Console attendue immédiatement** :
```
=== WELCOME DEBUG ===
Location state: {userId: "...", username: "test_debug", checksums: Array(30)}
Checksums received: ['abc123', 'def456', ...]
Checksums length: 30
====================
Checksums extracted: 30 ['abc123', 'def456', ...]
```

**Sur la page, vérifier** :
1. ✅ "Vos Checksums de Vérification (30 séries)"
2. ✅ 30 checksums numérotés #1 à #30
3. ✅ Bouton "📋 Copier tout"

### Étape 5 : Cliquer "J'ai noté mes informations, vérifier maintenant"

**Sur la page, vérifier** :
1. ✅ Titre : "🔍 Vérification de vos notes"
2. ✅ **10 champs de saisie** (PAS 6)
3. ✅ Labels : "Série 3:", "Série 7:", "Série 12:", etc.

### Étape 6 : Saisir les 10 checksums
1. Pour chaque champ, noter le numéro demandé (ex: "Série 3")
2. Remonter voir le checksum #3 dans la liste
3. Le copier et le coller dans le champ
4. Répéter pour les 10 checksums

### Étape 7 : Cliquer "Vérifier et créer le compte 🔐"

**Sur la page, vérifier** :
1. ✅ Bouton change en : "🔄 Création du compte..."
2. ✅ Redirection automatique vers page de mot de passe
3. ✅ Username pré-rempli

---

## ❌ Si le problème persiste

### Scénario A : Console montre "Checksums: []" (vide)
**Problème** : Les checksums ne sont pas générés

**Vérifier** :
- La fonction `splitIntoSeries(rolls)` fonctionne ?
- La fonction `calculateSeriesChecksum(s)` fonctionne ?

### Scénario B : Console montre "Checksums length: 30" mais page affiche "0 séries"
**Problème** : Le state React n'est pas mis à jour

**Solution** : Vérifier que `setChecksums(calculatedChecksums)` est appelé

### Scénario C : Welcome ne reçoit pas les checksums
**Console montre** : `Checksums received: undefined`

**Problème** : Navigation ne passe pas le state

**Vérifier** :
- `navigate('/welcome', { state: {...} })` est bien appelé
- Les checksums sont dans `pendingSignup`

### Scénario D : La section vérification ne s'affiche pas
**Problème** : Le bouton "J'ai noté mes informations" ne fait rien

**Vérifier** :
- `handleStartVerification()` est appelé
- `setVerificationStep('verify')` fonctionne

---

## 📊 Résultat attendu final

Après tous les tests, vous devriez voir :

1. ✅ Console : 3 blocs de debug avec "30 checksums"
2. ✅ DiceKeyResults : 30 checksums numérotés
3. ✅ Welcome : 30 checksums numérotés
4. ✅ Vérification : 10 champs de saisie
5. ✅ Validation : Création du compte automatique
6. ✅ Redirection : Mot de passe puis conversations

---

## 🚀 Prochaines étapes

Une fois que vous avez testé :
1. Partagez-moi les **messages de console** (copier-coller)
2. Dites-moi à quelle étape ça bloque
3. Je pourrai corriger précisément le problème

---

**Date** : 2025-11-12  
**Application** : http://localhost:5189  
**Console** : F12 → Onglet Console  

💡 **Astuce** : Faites Ctrl+L dans la console pour effacer et avoir des logs propres !
