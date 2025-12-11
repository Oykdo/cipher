# Investigation Approfondie : Messages Non Persistés

## 🔍 Actions Effectuées

### 1. ✅ Bouton Retour Page 404
**Fichiers créés/modifiés** :
- `apps/frontend/src/screens/NotFound.tsx` - Page 404 avec bouton retour
- `apps/frontend/src/App.tsx` - Route catch-all `*` ajoutée

**Fonctionnalité** :
- Bouton "🏠 Retour à l'accueil" → `/`
- Bouton "← Retour à la page précédente" → `navigate(-1)`

---

### 2. 🔧 Logs de Débogage Ajoutés

**Fichier** : `apps/frontend/src/screens/Conversations.tsx`

**Logs ajoutés dans `loadMessages()`** :
```typescript
🔄 [LOAD] Chargement des messages pour conversation: {conversationId}
📦 [LOAD] Messages reçus de l'API: {count}
⚠️ [LOAD] Aucun message reçu de l'API (si vide)
📝 [LOAD] Premier message (brut): {id, body preview, isLocked, isBurned}

// Pour chaque message
🔓 [DECRYPT 0] Déchiffrement du message: {id}
🔐 [DECRYPT 0] Données chiffrées: {hasCiphertext, hasIv, hasTag}
✅ [DECRYPT 0] Message déchiffré: {preview 50 chars}

// Ou erreurs
❌ [DECRYPT 0] body n'est pas une string: {type}
❌ [DECRYPT 0] Échec du déchiffrement: {error}
❌ [DECRYPT 0] Message brut: {message complet}

✅ [LOAD] Messages déchiffrés: {count}
```

---

## 🧪 Plan de Test

### Étape 1 : Ouvrir la Console du Navigateur
1. Ouvrir l'application
2. F12 → Console
3. Se connecter
4. Ouvrir une conversation avec des messages existants

### Étape 2 : Observer les Logs

#### ✅ Scénario Normal (Attendu)
```
🔄 [LOAD] Chargement des messages pour conversation: 4b5f07df-...
📦 [LOAD] Messages reçus de l'API: 3
📝 [LOAD] Premier message (brut): {
  id: "808a2903-...",
  body: "{\"ciphertext\":\"...\",\"iv\":\"...\",\"tag\":\"...\"}",
  isLocked: false,
  isBurned: false
}
🔓 [DECRYPT 0] Déchiffrement du message: 808a2903-...
🔐 [DECRYPT 0] Données chiffrées: {hasCiphertext: true, hasIv: true, hasTag: true}
✅ [DECRYPT 0] Message déchiffré: Test de message...
🔓 [DECRYPT 1] Déchiffrement du message: d67a48f3-...
✅ [DECRYPT 1] Message déchiffré: Bonjour...
✅ [LOAD] Messages déchiffrés: 3
```

#### ❌ Scénario Problématique (À Identifier)

**Cas 1 : API ne retourne rien**
```
🔄 [LOAD] Chargement des messages...
📦 [LOAD] Messages reçus de l'API: 0
⚠️ [LOAD] Aucun message reçu de l'API
```
→ **Problème** : Backend ne retourne pas les messages

**Cas 2 : Messages mal formatés**
```
🔄 [LOAD] Chargement des messages...
📦 [LOAD] Messages reçus de l'API: 3
📝 [LOAD] Premier message (brut): {
  id: "808a2903-...",
  body: "[Message verrouillé]",  ← ❌ PAS du JSON chiffré
  isLocked: false,
  isBurned: false
}
❌ [DECRYPT 0] Échec du déchiffrement: SyntaxError: Unexpected token
```
→ **Problème** : Backend retourne un placeholder au lieu du contenu chiffré

**Cas 3 : Échec déchiffrement (mauvaise clé)**
```
🔄 [LOAD] Chargement des messages...
📦 [LOAD] Messages reçus de l'API: 3
🔓 [DECRYPT 0] Déchiffrement du message: 808a2903-...
🔐 [DECRYPT 0] Données chiffrées: {hasCiphertext: true, hasIv: true, hasTag: true}
❌ [DECRYPT 0] Échec du déchiffrement: DOMException: The operation failed...
```
→ **Problème** : Clé de déchiffrement incorrecte (masterKey changé?)

**Cas 4 : Body n'est pas une string**
```
📝 [LOAD] Premier message (brut): {
  id: "808a2903-...",
  body: [object Object],  ← ❌ body est déjà parsé
  isLocked: false
}
❌ [DECRYPT 0] body n'est pas une string: object
```
→ **Problème** : L'API retourne déjà un objet parsé au lieu d'une string JSON

---

## 🔎 Points de Vérification Backend

### Vérification 1 : Route GET Messages

**Fichier** : `apps/bridge/src/routes/messages.ts:19-66`

```typescript
fastify.get('/api/v2/conversations/:id/messages', async (request, reply) => {
  // ...
  const messages = await Promise.all(
    dbMessages.map(async (msg) => {
      const isLocked = /* ... */;
      
      return {
        id: msg.id,
        conversationId: msg.conversation_id,
        senderId: msg.sender_id,
        body: isLocked ? '[Message verrouillé]' : msg.body, // ⚠️ ATTENTION ICI
        createdAt: msg.created_at,
        unlockBlockHeight: unlockHeight || undefined,
        isLocked,
      };
    })
  );
  
  return messages;
});
```

**Problème Potentiel** : Si `isLocked` est `true` par erreur, le backend retourne `'[Message verrouillé]'` au lieu du contenu chiffré.

### Vérification 2 : Service Time-Lock

**Fichier** : `apps/bridge/src/services/blockchain-bitcoin.ts`

```typescript
export async function canUnlock(blockHeight: number): Promise<boolean> {
  // Vérifie si le message peut être déverrouillé
  // Si retourne false → message reste verrouillé
}
```

**Question** : Les messages standards (sans time-lock) ont-ils `unlockBlockHeight = null` ou `0` ?
- Si `unlockBlockHeight = 0` → `canUnlock(0)` pourrait retourner `false` par erreur

---

## 🛠️ Solutions Possibles

### Solution 1 : Vérifier que unlockBlockHeight est NULL pour messages standards

**Backend** : `apps/bridge/src/routes/messages.ts`

```typescript
// S'assurer que unlockBlockHeight est bien null/undefined pour messages standards
const isLocked = unlockHeight && unlockHeight > 0 
  ? !(await blockchain.canUnlock(unlockHeight)) 
  : false;
```

### Solution 2 : Ne JAMAIS retourner de placeholder si pas locked

```typescript
return {
  id: msg.id,
  conversationId: msg.conversation_id,
  senderId: msg.sender_id,
  // ✅ Toujours retourner msg.body (chiffré) sauf si vraiment locked
  body: (isLocked && msg.unlock_block_height) ? '[Message verrouillé]' : msg.body,
  createdAt: msg.created_at,
  unlockBlockHeight: unlockHeight || undefined,
  isLocked,
};
```

### Solution 3 : Ajouter logs côté backend

**Fichier** : `apps/bridge/src/routes/messages.ts`

```typescript
fastify.get('/api/v2/conversations/:id/messages', async (request, reply) => {
  // ...
  const pageDesc = await db.getConversationMessagesPaged(id, cursor, pageLimit);
  const dbMessages = pageDesc.reverse();
  
  app.log.info({
    conversationId: id,
    messagesFromDb: dbMessages.length,
    firstMessageId: dbMessages[0]?.id,
    firstMessageBodyPreview: dbMessages[0]?.body?.substring(0, 50),
  }, 'Messages loaded from database');
  
  // ...
});
```

---

## 📋 Checklist de Débogage

### Frontend (Console Navigateur)
- [ ] Ouvrir la console (F12)
- [ ] Se connecter
- [ ] Ouvrir conversation
- [ ] Noter les logs `[LOAD]` et `[DECRYPT]`
- [ ] Vérifier si messages reçus de l'API
- [ ] Vérifier format `body` (string JSON vs autre)
- [ ] Vérifier si déchiffrement réussit
- [ ] Copier les logs d'erreur

### Backend (Logs Serveur)
- [ ] Vérifier logs lors de `GET /api/v2/conversations/:id/messages`
- [ ] Confirmer que des messages sont retournés
- [ ] Vérifier `responseTime` (devrait être < 10ms)
- [ ] Vérifier si erreurs dans les logs

### Base de Données
- [ ] Exécuter script de vérification : `node apps/bridge/check-messages.cjs`
- [ ] Confirmer que des messages existent
- [ ] Vérifier format `body` : doit être `{"ciphertext":"...","iv":"...","tag":"..."}`

---

## 🚀 Prochaines Étapes

1. **Lancer l'app et observer les logs console**
2. **Se connecter et ouvrir une conversation**
3. **Copier tous les logs `[LOAD]` et `[DECRYPT]`**
4. **Identifier le scénario problématique** (voir section "Scénario Problématique")
5. **Appliquer la solution correspondante**

---

## 📞 Questions à Répondre

1. **Les logs montrent-ils des messages reçus de l'API ?**
   - Oui → Continuer au point 2
   - Non → Problème backend (route ou BDD)

2. **Le `body` est-il une string JSON chiffrée ?**
   - Oui → Continuer au point 3
   - Non → Backend retourne mauvais format

3. **Le déchiffrement réussit-il ?**
   - Oui → Messages devraient s'afficher
   - Non → Problème de clé ou de format chiffré

4. **Y a-t-il des messages avec `isLocked: true` par erreur ?**
   - Oui → Vérifier logique time-lock backend
   - Non → OK

---

## 💡 Hypothèses à Tester

### Hypothèse #1 : Backend retourne placeholder au lieu du contenu chiffré
**Test** : Vérifier log `📝 [LOAD] Premier message (brut)`
- Si `body: "[Message verrouillé]"` → BINGO, c'est ça !
- **Cause** : `isLocked` est `true` par erreur dans le backend

### Hypothèse #2 : API ne retourne aucun message
**Test** : Vérifier log `📦 [LOAD] Messages reçus de l'API`
- Si `0` → Backend ne récupère pas les messages de la BDD
- **Cause** : Problème dans `db.getConversationMessagesPaged()`

### Hypothèse #3 : Déchiffrement échoue (clé incorrecte)
**Test** : Vérifier logs `❌ [DECRYPT]`
- Si erreur crypto → La clé ne correspond pas
- **Cause** : `session.masterKey` différent de celui utilisé pour chiffrer

### Hypothèse #4 : Messages visibles en temps réel mais pas après refresh
**Test** : Envoyer un message → visible, puis refresh → disparu
- Si messages temps réel OK mais pas après refresh → Problème de chargement uniquement
- **Cause** : Logique `loadMessages()` différente de logique WebSocket

---

**À FAIRE MAINTENANT** :
1. Relancer l'app
2. Ouvrir la console
3. Se connecter et ouvrir conversation
4. **COPIER TOUS LES LOGS** et me les envoyer pour analyse
