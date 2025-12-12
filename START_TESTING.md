# 🚀 QUICK START - Tester e2ee-v2

## 1. Lancer l'Application (30 secondes)

```bash
# Terminal 1 - Backend
cd apps/bridge
npm run dev

# Terminal 2 - Frontend  
cd apps/frontend
npm run dev
```

Ouvrez : **http://localhost:5173**

---

## 2. Vérifier l'Initialisation (Console Navigateur F12)

Après connexion, vous devriez voir :

```
🔑 [KeyInit] Generating new keys for user...
✅ [KeyInit] Keys stored locally
✅ [KeyInit] Public keys uploaded to server
🎉 [KeyInit] Key initialization complete
🔐 [App] e2ee-v2 keys ready
✅ [Conversations] e2ee-v2 keys detected, will use new format for messages
```

✅ **Si vous voyez ces logs → e2ee-v2 est actif !**

---

## 3. Test Critique : Envoi de Message

1. **Ouvrir une conversation**
2. **Taper** : "Test e2ee-v2"
3. **Envoyer**

**Console devrait montrer** :
```
🔐 [E2EE-v2] Encrypting text message with e2ee-v2
📋 [E2EE-v2] Encrypting for 2 participants
✅ [E2EE-v2] Message encrypted successfully
```

Le message s'affiche immédiatement dans l'UI ✅

---

## 4. Test Critique : Relecture Expéditeur

**C'est LE test qui prouve que e2ee-v2 résout le problème !**

### Avec e2ee-v1 (ancien système) ❌
```
Envoyer message → Vider cache → Recharger
→ Résultat : "[Your encrypted message]" (échec)
```

### Avec e2ee-v2 (nouveau système) ✅
```
Envoyer message → Vider cache → Recharger
→ Résultat : Message en clair (succès!)
```

### Comment tester :

1. **Envoyer un message** : "Mon message e2ee-v2"

2. **Ouvrir Console F12** et taper :
   ```javascript
   // Vider le cache de déchiffrement
   Object.keys(localStorage).forEach(key => {
     if (key.startsWith('e2ee:decrypted:')) {
       localStorage.removeItem(key);
     }
   });
   console.log('Cache vidé!');
   ```

3. **Recharger la page** (F5)

4. **Ouvrir la conversation**

5. **VÉRIFIER** : Le message s'affiche toujours en clair ! ✅

**Console devrait montrer** :
```
🔐 [E2EE-v2] Detected e2ee-v2 message, decrypting...
✅ [E2EE-v2] Decrypted successfully
```

---

## 5. Vérifier Base de Données

```sql
-- Vérifier que les clés publiques sont stockées
SELECT username, 
       SUBSTRING(public_key, 1, 20) as public_key_preview,
       SUBSTRING(sign_public_key, 1, 20) as sign_key_preview
FROM users 
ORDER BY updated_at DESC 
LIMIT 5;
```

Vous devriez voir des valeurs base64 dans `public_key` et `sign_public_key`.

---

## 6. Tests Additionnels

### Test Attachments e2ee-v2
1. Activer "Burn After Reading"
2. Joindre un fichier
3. Envoyer
4. Console : `🔐 [E2EE-v2] Encrypting attachment with e2ee-v2`

### Test Time-Lock e2ee-v2
1. Activer "Time Lock"
2. Choisir une date future
3. Envoyer
4. Console : `[SEND] messageType = "timelock"`

### Test Coexistence v1/v2
1. Avoir des anciens messages (e2ee-v1)
2. Envoyer nouveaux messages (e2ee-v2)
3. Recharger
4. **Vérifier** : Tous les messages s'affichent ✅

---

## 🎯 Résultats Attendus

| Test | Ancien (e2ee-v1) | Nouveau (e2ee-v2) |
|------|------------------|-------------------|
| **Envoi message** | ✅ Fonctionne | ✅ Fonctionne |
| **Réception message** | ✅ Fonctionne | ✅ Fonctionne |
| **Relecture après cache clear** | ❌ Échec | ✅ **SUCCÈS** |
| **Multi-device** | ❌ Échec | ✅ Via backup |
| **Zero-Knowledge** | ✅ Oui | ✅ Oui |
| **Perfect Forward Secrecy** | ✅ Oui | ✅ Oui |

---

## ⚠️ Dépannage

### Pas de logs e2ee-v2 ?

1. **Vérifier** : Migration SQL exécutée ?
   ```sql
   SELECT column_name 
   FROM information_schema.columns 
   WHERE table_name = 'users' 
     AND column_name IN ('public_key', 'sign_public_key');
   ```

2. **Vérifier** : Clés générées ?
   ```javascript
   // Console navigateur
   localStorage.getItem('e2ee-v2:keys:YOUR_USER_ID');
   ```

3. **Forcer régénération** :
   ```javascript
   // Console navigateur
   Object.keys(localStorage).forEach(key => {
     if (key.startsWith('e2ee-v2:keys:')) {
       localStorage.removeItem(key);
     }
   });
   location.reload();
   ```

### Erreur "User keys not found" ?

→ Rechargez la page, le hook `useKeyInitialization` devrait générer les clés automatiquement.

### Message reste crypté ?

1. **Console** → Chercher `[E2EE-v2]` ou `[E2EE-v1]`
2. Si `[E2EE-v1]` → Clés e2ee-v2 pas détectées
3. Vérifier `setUseE2EEv2` dans `Conversations.tsx`

---

## 📊 Logs Complets (Exemple)

```
# Au Login
🔑 [KeyInit] Checking for existing keys...
🔑 [KeyInit] No keys found, generating new keys...
✅ [KeyInit] Keys generated successfully
✅ [KeyInit] Keys stored locally
🌐 [KeyInit] Uploading public keys to server...
✅ [KeyInit] Public keys uploaded successfully
🎉 [KeyInit] Key initialization complete
🔐 [App] e2ee-v2 keys ready

# À l'ouverture de Conversations
✅ [Conversations] e2ee-v2 keys detected, will use new format for messages

# À l'envoi
🔐 [E2EE-v2] Encrypting text message with e2ee-v2
📋 [E2EE-v2] Encrypting for 2 participants
✅ [E2EE-v2] Message encrypted successfully
[SEND] Server returned message with ID: abc-123

# Au chargement
[LOAD] Processing message abc-123 from sender user-456
🔐 [E2EE-v2] Detected e2ee-v2 message, decrypting...
✅ [E2EE-v2] Decrypted successfully
[CACHE] Stored message abc-123 in cache
```

---

## 🎉 **C'est Prêt !**

Si tous les tests passent, **e2ee-v2 fonctionne parfaitement** ! 🚀

Le problème **"sender ne peut pas relire ses messages"** est **RÉSOLU** ! ✅

---

**Happy Testing ! 🐐**
