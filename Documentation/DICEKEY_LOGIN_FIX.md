# Fix: DiceKey Login "Username introuvable" Error

## Problème identifié

Lorsqu'un utilisateur créait un identifiant DiceKey et tentait de se connecter, l'erreur suivante apparaissait :
```
Set password error: Error: Username introuvable. Veuillez recommencer le processus.
```

### Cause racine

Le flux de connexion DiceKey comportait deux scénarios :

1. **Nouveau compte** (depuis SignupFluid → Welcome → LoginNew)
   - `pendingSignup` existe dans sessionStorage
   - Le username était extrait et stocké dans `tempUsername`
   - ✅ Fonctionnait correctement

2. **Session expirée OU compte existant** 
   - `pendingSignup` n'existe plus (rafraîchissement page, fermeture navigateur)
   - Le code allait directement à l'étape `setpassword` **SANS stocker tempUsername**
   - ❌ **BUG** : `handleSetPassword` ne trouvait pas le username

## Solution implémentée

### 1. Ajout du champ username dans le formulaire DiceKey

Le formulaire de connexion DiceKey demande maintenant explicitement :
- **Username** (3 caractères minimum)
- Identifiant unique (12 caractères hex)
- 30 checksums

### 2. Gestion intelligente du champ username

```typescript
// Si pendingSignup existe (nouveau compte)
if (hasPendingSignup && username.length > 0) {
  // Username pré-rempli et en lecture seule
  readOnly={true}
}
// Sinon (session expirée)
else {
  // Username éditable, utilisateur doit le saisir
  readOnly={false}
}
```

### 3. Validation et stockage

Dans `handleDiceKeyCredentialsSubmit` :

```typescript
if (pendingSignup) {
  // Nouveau compte : utilise signupData.username
  sessionStorage.setItem('tempUsername', signupData.username);
} else {
  // Session expirée : utilise diceKeyUsername saisi par l'utilisateur
  if (!diceKeyUsername || diceKeyUsername.trim().length < 3) {
    throw new Error('Veuillez entrer votre nom d\'utilisateur (3 caractères minimum)');
  }
  sessionStorage.setItem('tempUsername', diceKeyUsername.trim());
}
```

## Fichiers modifiés

- `apps/frontend/src/screens/LoginNew.tsx`
  - Ajout de `diceKeyUsername` dans le state
  - Modification de `handleDiceKeyCredentialsSubmit` pour stocker `tempUsername` dans tous les cas
  - Ajout du champ username dans `DiceKeyCredentialsForm`
  - Pré-remplissage automatique du username si `pendingSignup` existe

## Test du fix

### Scénario 1 : Nouveau compte (flux normal)
1. SignupFluid → Génération des clés DiceKey
2. Welcome → Vérification des checksums
3. LoginNew → **Username pré-rempli automatiquement** ✅
4. Définition du mot de passe → **Fonctionne** ✅

### Scénario 2 : Session expirée
1. Utilisateur ferme le navigateur après SignupFluid
2. Rouvre et va sur LoginNew
3. **Doit saisir username, userId et checksums** ✅
4. Définition du mot de passe → **Fonctionne** ✅

## Instructions pour l'utilisateur

Si vous rencontrez l'erreur "Username introuvable" :

1. **Si vous venez de créer votre compte** :
   - Recommencez le processus depuis SignupFluid
   - Ne rafraîchissez PAS la page entre Welcome et LoginNew
   - Le username sera automatiquement pré-rempli

2. **Si votre session a expiré** :
   - Entrez votre **username** (celui que vous avez choisi lors de l'inscription)
   - Entrez votre **identifiant** (12 caractères hex)
   - Entrez vos **30 checksums**
   - Définissez votre mot de passe local

## Améliorations futures

1. **Implémenter le vrai login DiceKey avec l'API** `/api/v2/auth/login-dicekey`
   - Vérifier les checksums côté backend
   - Authentifier avec l'Identity Public Key

2. **Stocker les informations en localStorage** (avec consentement utilisateur)
   - Username
   - userId
   - Éviter la perte lors du rafraîchissement

3. **Améliorer les messages d'erreur**
   - Afficher dans le UI plutôt que des `alert()`
   - Guider l'utilisateur vers la solution

---

**Date** : 2025-11-12  
**Status** : ✅ Corrigé et testé
