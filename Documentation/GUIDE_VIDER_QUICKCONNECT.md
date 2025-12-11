# 🗑️ Guide : Vider le cache QuickConnect

## C'est quoi QuickConnect ?

QuickConnect (ou QuickUnlock) est la fonctionnalité qui vous permet de vous connecter rapidement avec juste un mot de passe, comme MetaMask. Vos données de connexion sont stockées localement sur votre appareil.

## Pourquoi vider le cache ?

Vous devriez vider le cache QuickConnect si :

- ✅ Vous avez utilisé un **ordinateur partagé**
- ✅ Vous avez **nettoyé la base de données** et un utilisateur fantôme apparaît
- ✅ Vous avez des **problèmes de connexion** avec QuickUnlock
- ✅ Vous voulez **forcer une connexion complète**

## ⚠️ Important à savoir

### Ce qui sera supprimé
- ❌ Vos données de connexion rapide (mot de passe local)
- ❌ Votre session QuickConnect

### Ce qui sera conservé
- ✅ Vos messages et conversations
- ✅ Vos clés de chiffrement
- ✅ Votre session actuelle (vous restez connecté)

### Après le nettoyage
- ⚠️ Vous devrez utiliser la **connexion complète** la prochaine fois
  - **Standard** : Username + Phrase mnémonique (12 ou 24 mots)
  - **DiceKey** : Username + 300 lancers de dés

## 📖 Comment vider le cache ?

### Méthode 1 : Via l'interface (Recommandé)

1. **Connectez-vous** à Cipher Pulse

2. **Cliquez sur Paramètres** (⚙️ en haut à droite)

3. **Allez dans l'onglet "Sécurité"**

4. **Trouvez la section "QuickConnect"**
   - Vous verrez le nombre de comptes en cache

5. **Cliquez sur "🗑️ Vider le cache QuickConnect"**

6. **Confirmez** l'action dans la popup

7. **C'est fait !** Un message de confirmation apparaîtra

### Méthode 2 : Via la console du navigateur

Si vous préférez utiliser la console :

1. **Ouvrez les outils de développement**
   - Windows/Linux : `F12` ou `Ctrl + Shift + I`
   - Mac : `Cmd + Option + I`

2. **Allez dans l'onglet "Console"**

3. **Copiez et collez ce code** :

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
alert('✅ Cache QuickConnect vidé avec succès !');
```

4. **Appuyez sur Entrée**

5. **Rafraîchissez la page** (`F5`)

## 🔄 Après avoir vidé le cache

### Que se passe-t-il ?

1. ✅ Le cache QuickConnect est supprimé
2. ✅ Vous restez connecté à votre session actuelle
3. ⚠️ À la prochaine connexion, vous devrez utiliser la connexion complète

### Comment se reconnecter ?

#### Si vous avez un compte Standard :

1. Allez sur la page de connexion
2. Choisissez "Connexion avancée"
3. Entrez votre **username**
4. Entrez votre **phrase mnémonique** (12 ou 24 mots)
5. Définissez un nouveau mot de passe pour QuickConnect

#### Si vous avez un compte DiceKey :

1. Allez sur la page de connexion
2. Choisissez "DiceKey"
3. Entrez votre **username**
4. Entrez vos **300 lancers de dés**
5. Définissez un nouveau mot de passe pour QuickConnect

## 🆘 Problèmes courants

### "Utilisateur fantôme" après nettoyage de la base

**Symptôme** : Un utilisateur apparaît dans QuickUnlock mais n'existe plus dans la base de données.

**Solution** :
1. Videz le cache QuickConnect (méthode 1 ou 2)
2. Rafraîchissez la page
3. L'utilisateur fantôme disparaîtra

### QuickUnlock refuse mon mot de passe

**Symptôme** : Le mot de passe est refusé ou erreur "Clé maître introuvable".

**Solution** :
1. Videz le cache QuickConnect
2. Utilisez la connexion complète (mnémonique ou DiceKey)
3. Redéfinissez un nouveau mot de passe

### Plusieurs comptes apparaissent

**Symptôme** : Plusieurs utilisateurs apparaissent dans QuickUnlock.

**Solution** :
1. Videz le cache QuickConnect pour tout supprimer
2. Reconnectez-vous avec le compte que vous voulez utiliser
3. Définissez un mot de passe pour ce compte uniquement

## 💡 Conseils de sécurité

### Ordinateur personnel
- ✅ Gardez le cache QuickConnect pour plus de commodité
- ✅ Utilisez un mot de passe fort

### Ordinateur partagé
- ⚠️ Videz TOUJOURS le cache après utilisation
- ⚠️ Déconnectez-vous complètement

### Avant de vendre/donner votre ordinateur
- ❌ Videz le cache QuickConnect
- ❌ Déconnectez-vous
- ❌ Nettoyez la base de données
- ❌ Videz le cache du navigateur

## 📞 Besoin d'aide ?

Si vous rencontrez des problèmes :

1. Consultez la [documentation complète](./QUICKCONNECT_CACHE_MANAGEMENT.md)
2. Vérifiez les [corrections QuickUnlock](./QUICKUNLOCK_FIXES.md)
3. Contactez le support Project Chimera

---

**Dernière mise à jour** : 2025-01-18  
**Version** : 1.0.0

