# Test : Vider le cache QuickConnect

## 🎯 Objectif

Vérifier que la fonctionnalité de vidage du cache QuickConnect fonctionne correctement et que l'utilisateur est bien déconnecté du système de connexion rapide.

## 📋 Prérequis

1. Application Cipher Pulse lancée
2. Au moins un compte créé avec QuickConnect activé
3. Accès aux outils de développement du navigateur (F12)

## 🧪 Scénario de test complet

### Étape 1 : Préparation

1. **Créer un compte de test**
   ```
   - Aller sur la page d'inscription
   - Créer un compte "testuser"
   - Définir un mot de passe pour QuickConnect
   - Se connecter avec succès
   ```

2. **Vérifier que QuickConnect est actif**
   ```
   - Ouvrir la console (F12)
   - Taper : localStorage.getItem('pwd_testuser')
   - Résultat attendu : Une chaîne de hash (non null)
   ```

3. **Vérifier la session**
   ```
   - Taper : localStorage.getItem('cipher-pulse-auth')
   - Résultat attendu : Un objet JSON avec les infos de session
   ```

### Étape 2 : Test via l'interface utilisateur

1. **Aller dans les paramètres**
   ```
   - Cliquer sur l'icône ⚙️ (Paramètres)
   - Cliquer sur l'onglet "Sécurité"
   ```

2. **Vérifier la section QuickConnect**
   ```
   - Trouver la section "QuickConnect"
   - Vérifier que le nombre de comptes en cache est affiché
   - Résultat attendu : "1" (ou plus si plusieurs comptes)
   ```

3. **Vider le cache**
   ```
   - Cliquer sur "🗑️ Vider le cache QuickConnect"
   - Confirmer dans la popup
   - Résultat attendu : Message de confirmation
   ```

4. **Vérifier que le cache est vidé**
   ```
   - Ouvrir la console (F12)
   - Taper : localStorage.getItem('pwd_testuser')
   - Résultat attendu : null
   - Taper : localStorage.getItem('cipher-pulse-auth')
   - Résultat attendu : null
   ```

### Étape 3 : Test de reconnexion

1. **Se déconnecter**
   ```
   - Cliquer sur "Se déconnecter" dans les paramètres
   - Résultat attendu : Redirection vers la page d'accueil
   ```

2. **Vérifier que QuickUnlock n'apparaît pas**
   ```
   - Rafraîchir la page (F5)
   - Résultat attendu : Page d'accueil standard (pas de QuickUnlock)
   ```

3. **Tester la connexion complète**
   ```
   - Cliquer sur "Se connecter"
   - Entrer username : testuser
   - Entrer la phrase mnémonique (12 ou 24 mots)
   - Résultat attendu : Connexion réussie
   ```

4. **Redéfinir QuickConnect**
   ```
   - Définir un nouveau mot de passe
   - Résultat attendu : QuickConnect réactivé
   ```

### Étape 4 : Test via la console

1. **Créer un nouveau compte de test**
   ```
   - Créer "testuser2" avec QuickConnect
   ```

2. **Vider le cache via la console**
   ```javascript
   // Ouvrir la console (F12)
   // Copier/coller ce code :
   
   const accounts = [];
   for (let i = 0; i < localStorage.length; i++) {
     const key = localStorage.key(i);
     if (key && key.startsWith('pwd_')) {
       accounts.push(key);
     }
   }
   
   accounts.forEach(key => localStorage.removeItem(key));
   localStorage.removeItem('cipher-pulse-auth');
   localStorage.removeItem('cipher-pulse-auth-secure');
   
   console.log(`✅ Cache QuickConnect vidé (${accounts.length} comptes)`);
   ```

3. **Vérifier le résultat**
   ```
   - Résultat attendu : "✅ Cache QuickConnect vidé (1 comptes)"
   - Vérifier : localStorage.getItem('pwd_testuser2')
   - Résultat attendu : null
   ```

### Étape 5 : Test avec plusieurs comptes

1. **Créer plusieurs comptes**
   ```
   - Créer "user1" avec QuickConnect
   - Se déconnecter
   - Créer "user2" avec QuickConnect
   - Se déconnecter
   - Créer "user3" avec QuickConnect
   ```

2. **Vérifier le nombre de comptes**
   ```
   - Aller dans Paramètres → Sécurité → QuickConnect
   - Résultat attendu : "3" comptes en cache
   ```

3. **Vider le cache**
   ```
   - Cliquer sur "Vider le cache QuickConnect"
   - Confirmer
   - Résultat attendu : Tous les comptes supprimés
   ```

4. **Vérifier**
   ```javascript
   // Console
   for (let i = 0; i < localStorage.length; i++) {
     const key = localStorage.key(i);
     if (key && key.startsWith('pwd_')) {
       console.log(key);
     }
   }
   // Résultat attendu : Aucune sortie (aucun compte)
   ```

## ✅ Critères de réussite

### Fonctionnalité UI

- [ ] Le bouton "Vider le cache" est visible dans Paramètres → Sécurité
- [ ] Le nombre de comptes en cache est affiché correctement
- [ ] La confirmation apparaît avant de vider
- [ ] Le message de succès apparaît après vidage
- [ ] Le cache est effectivement vidé (vérifiable dans localStorage)

### Fonctionnalité Console

- [ ] Le script de console fonctionne sans erreur
- [ ] Le nombre de comptes supprimés est affiché
- [ ] Tous les `pwd_*` sont supprimés
- [ ] `cipher-pulse-auth` est supprimé
- [ ] `cipher-pulse-auth-secure` est supprimé

### Comportement après vidage

- [ ] L'utilisateur reste connecté à sa session actuelle
- [ ] QuickUnlock n'apparaît plus sur la page d'accueil
- [ ] La connexion complète est requise
- [ ] QuickConnect peut être réactivé après reconnexion

## 🐛 Problèmes potentiels

### Problème 1 : Le cache n'est pas vidé

**Symptôme** : Après avoir cliqué sur "Vider le cache", les données sont toujours présentes.

**Vérification** :
```javascript
localStorage.getItem('pwd_testuser') // Devrait être null
```

**Solution** :
- Vérifier que la fonction `clearQuickConnectCache()` est bien appelée
- Vérifier les logs de la console
- Rafraîchir la page et réessayer

### Problème 2 : QuickUnlock apparaît toujours

**Symptôme** : Après vidage, QuickUnlock apparaît encore sur la page d'accueil.

**Vérification** :
```javascript
localStorage.getItem('cipher-pulse-auth') // Devrait être null
```

**Solution** :
- Rafraîchir la page (F5)
- Vider le cache du navigateur
- Vérifier que `cipher-pulse-auth` est bien supprimé

### Problème 3 : Erreur lors du vidage

**Symptôme** : Une erreur apparaît lors du clic sur "Vider le cache".

**Vérification** :
- Ouvrir la console et vérifier les erreurs
- Vérifier que `getLocalAccounts()` fonctionne

**Solution** :
- Vérifier l'import de `clearQuickConnectCache` dans Settings.tsx
- Vérifier que la fonction existe dans localStorage.ts

## 📊 Résultats attendus

### Avant vidage

```javascript
localStorage.getItem('pwd_testuser')        // "a3f7c9e2d8b1..."
localStorage.getItem('cipher-pulse-auth')   // "{\"state\":{\"session\":...}}"
```

### Après vidage

```javascript
localStorage.getItem('pwd_testuser')        // null
localStorage.getItem('cipher-pulse-auth')   // null
```

### Logs console

```
🗑️ [QuickConnect] Clearing QuickConnect cache...
  ✅ Cleared pwd_testuser
  ✅ Cleared cipher-pulse-auth
  ✅ Cleared cipher-pulse-auth-secure
✅ [QuickConnect] Cache cleared successfully
ℹ️  Users will need to use full login (username + master key)
```

## 🎓 Notes pour les testeurs

1. **Toujours vérifier localStorage** avant et après le vidage
2. **Tester avec plusieurs comptes** pour vérifier que tous sont supprimés
3. **Tester la reconnexion** pour vérifier que QuickConnect peut être réactivé
4. **Vérifier les logs** pour s'assurer qu'il n'y a pas d'erreurs
5. **Tester sur différents navigateurs** (Chrome, Firefox, Edge)

---

**Date de création** : 2025-01-18  
**Version** : 1.0.0  
**Auteur** : Project Chimera Team

