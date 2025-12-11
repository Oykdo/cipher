# QuickConnect Cache Management

## Vue d'ensemble

Le système **QuickConnect** (aussi appelé **QuickUnlock**) permet aux utilisateurs de se connecter rapidement avec juste un mot de passe, similaire à MetaMask. Les données de connexion sont stockées localement dans le navigateur pour faciliter l'accès.

## Données stockées

Le QuickConnect stocke les informations suivantes dans `localStorage` :

### 1. Hash du mot de passe
- **Clé** : `pwd_{username}`
- **Contenu** : Hash du mot de passe de l'utilisateur
- **Usage** : Vérification locale du mot de passe

### 2. Session d'authentification
- **Clé** : `cipher-pulse-auth`
- **Contenu** : Informations de session (user ID, username, security tier)
- **Usage** : Restauration de la session

### 3. Session sécurisée
- **Clé** : `cipher-pulse-auth-secure`
- **Contenu** : Session avec KeyVault
- **Usage** : Gestion sécurisée des clés

## Pourquoi vider le cache ?

Vous pourriez vouloir vider le cache QuickConnect dans les cas suivants :

1. **Sécurité** : Après avoir utilisé un ordinateur partagé
2. **Nettoyage** : Après avoir supprimé la base de données
3. **Dépannage** : Pour résoudre des problèmes de connexion
4. **Changement d'utilisateur** : Pour forcer une connexion complète

## Méthodes pour vider le cache

### Méthode 1 : Interface utilisateur (Recommandé)

1. Connectez-vous à Cipher Pulse
2. Allez dans **Paramètres** (⚙️)
3. Cliquez sur l'onglet **Sécurité**
4. Trouvez la section **QuickConnect**
5. Cliquez sur **🗑️ Vider le cache QuickConnect**
6. Confirmez l'action

### Méthode 2 : Console du navigateur

1. Ouvrez les outils de développement (F12)
2. Allez dans l'onglet **Console**
3. Copiez et collez ce code :

```javascript
// Vider le cache QuickConnect
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

4. Appuyez sur Entrée
5. Rafraîchissez la page (F5)

### Méthode 3 : Script automatisé

Utilisez le script fourni :

```bash
# Ouvrez la console du navigateur et exécutez :
node scripts/clear-quickconnect.js
```

Ou copiez le contenu de `scripts/clear-quickconnect.js` dans la console.

## Après avoir vidé le cache

### Ce qui se passe

1. ✅ Le cache QuickConnect est supprimé
2. ✅ Vous restez connecté à votre session actuelle
3. ⚠️ À la prochaine connexion, vous devrez utiliser la **connexion complète**

### Connexion complète requise

Après avoir vidé le cache, vous devrez vous connecter avec :

- **Standard** : Username + Phrase mnémonique (12 ou 24 mots)
- **DiceKey** : Username + 300 lancers de dés

### Reconfigurer QuickConnect

Pour réactiver QuickConnect après l'avoir vidé :

1. Utilisez la connexion complète (mnemonic ou DiceKey)
2. Définissez un nouveau mot de passe
3. QuickConnect sera automatiquement reconfiguré

## Sécurité

### ⚠️ Important

- **Vider le cache ne supprime PAS vos données** (messages, conversations)
- **Vider le cache ne vous déconnecte PAS** de votre session actuelle
- **Vider le cache supprime uniquement** les données de connexion rapide

### 🔒 Bonnes pratiques

1. **Ordinateur partagé** : Videz toujours le cache après utilisation
2. **Ordinateur personnel** : Gardez le cache pour plus de commodité
3. **Après nettoyage DB** : Videz le cache pour éviter les utilisateurs fantômes
4. **Avant vente/don** : Videz le cache ET déconnectez-vous

## Dépannage

### Problème : Utilisateur fantôme après nettoyage DB

**Symptôme** : Un utilisateur apparaît dans QuickUnlock mais n'existe plus dans la base de données.

**Solution** :
```javascript
// Console du navigateur
localStorage.removeItem('pwd_alice'); // Remplacez 'alice' par le username
localStorage.removeItem('cipher-pulse-auth');
location.reload();
```

### Problème : QuickUnlock ne fonctionne pas

**Symptôme** : Le mot de passe est refusé ou erreur "Clé maître introuvable".

**Solution** :
1. Videz le cache QuickConnect
2. Utilisez la connexion complète
3. Redéfinissez un mot de passe

### Problème : Plusieurs comptes en cache

**Symptôme** : Plusieurs utilisateurs apparaissent dans QuickUnlock.

**Solution** :
```javascript
// Lister tous les comptes
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  if (key && key.startsWith('pwd_')) {
    console.log(key);
  }
}

// Supprimer un compte spécifique
localStorage.removeItem('pwd_username'); // Remplacez 'username'
```

## API de développement

### Fonction utilitaire

```typescript
import { clearQuickConnectCache, getLocalAccounts } from '@/lib/localStorage';

// Vider le cache
clearQuickConnectCache();

// Vérifier les comptes en cache
const accounts = getLocalAccounts();
console.log(`${accounts.length} comptes en cache`);
```

### Vérifier l'état

```typescript
import { hasAnyLocalAccount } from '@/lib/localStorage';

if (hasAnyLocalAccount()) {
  console.log('QuickConnect disponible');
} else {
  console.log('Aucun compte en cache');
}
```

## Voir aussi

- [QUICKUNLOCK_FIXES.md](./QUICKUNLOCK_FIXES.md) - Corrections du système QuickUnlock
- [DICEKEY_QUICK_UNLOCK_FIX.md](./DICEKEY_QUICK_UNLOCK_FIX.md) - Fix DiceKey + QuickUnlock
- [DATABASE_CLEAR_GUIDE.md](./DATABASE_CLEAR_GUIDE.md) - Guide de nettoyage de la base de données

