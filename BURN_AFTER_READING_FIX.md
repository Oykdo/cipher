# 🔥 Fix : Messages "Burn After Reading" Réapparaissaient

## ❌ Le Problème

**Symptômes** :
- Un utilisateur télécharge un message avec "Burn After Reading"
- Le message disparaît correctement après lecture
- L'utilisateur se déconnecte puis se reconnecte
- ❌ **Le message brûlé réapparaît !**

## 🔍 Analyse de la Cause

### Flux Normal (Avant le Fix)

```
1. Utilisateur télécharge le message avec "Burn After Reading"
   └─> Frontend déclenche `socket.emit('burn_message')`

2. Backend reçoit l'événement
   └─> Appelle `db.burnMessage(messageId)`
   └─> Met à jour la DB: UPDATE messages SET is_burned = true

3. Backend envoie à tous : `socket.emit('message_burned')`

4. Frontend reçoit l'événement
   └─> Met à jour l'état local: setMessages(...isBurned: true)
   └─> BurnMessage component cache le message (return null)
   
✅ Message disparaît de l'écran
```

### Le Problème à la Reconnexion

```
5. Utilisateur se déconnecte et se reconnecte

6. Frontend charge les messages depuis la DB
   └─> GET /api/v2/conversations/:id/messages

7. Backend retourne TOUS les messages (y compris brûlés)
   └─> SELECT * FROM messages WHERE conversation_id = $1
   └─> ❌ Inclut les messages avec is_burned = true

8. Frontend affiche les messages
   └─> Mais l'état local "revealed" n'existe plus !
   └─> BurnMessage montre "Tap to Reveal" pour le message brûlé
   
❌ Le message brûlé réapparaît
```

### Root Cause

**Le problème était dans les requêtes SQL** :

```sql
-- ❌ AVANT (bug)
SELECT * FROM messages 
WHERE conversation_id = $1
-- Retourne TOUS les messages, même ceux avec is_burned = true

-- ✅ APRÈS (fix)
SELECT * FROM messages 
WHERE conversation_id = $1 
  AND (is_burned = false OR is_burned IS NULL)
-- Exclut les messages brûlés de la réponse
```

---

## ✅ La Solution

### Fichiers Modifiés

**`apps/bridge/src/db/database.js`**

3 fonctions ont été corrigées pour **filtrer les messages brûlés** :

#### 1. `getConversationMessages()`

```javascript
async getConversationMessages(conversationId, limit = 100) {
    // ✅ FIX: Exclure les messages brûlés (Burn After Reading)
    return await all(this.pool, `
        SELECT * FROM messages 
        WHERE conversation_id = $1 
          AND (is_burned = false OR is_burned IS NULL)
        ORDER BY created_at ASC 
        LIMIT $2
    `, [conversationId, limit]);
}
```

#### 2. `getConversationMessagesPaged()`

```javascript
async getConversationMessagesPaged(conversationId, before, limit) {
    // ✅ FIX: Exclure les messages brûlés (Burn After Reading)
    return await all(this.pool, `
        SELECT * FROM messages 
        WHERE conversation_id = $1 
          AND created_at < to_timestamp($2 / 1000.0)
          AND (is_burned = false OR is_burned IS NULL)
        ORDER BY created_at DESC
        LIMIT $3
    `, [conversationId, before, limit]);
}
```

#### 3. `getLastMessage()`

```javascript
async getLastMessage(conversationId) {
    // ✅ FIX: Exclure les messages brûlés (Burn After Reading)
    return await get(this.pool, `
        SELECT * FROM messages 
        WHERE conversation_id = $1 
          AND (is_burned = false OR is_burned IS NULL)
        ORDER BY created_at DESC 
        LIMIT 1
    `, [conversationId]);
}
```

---

## 🎯 Pourquoi Cette Solution ?

### Option 1 : Filtrer côté Frontend ❌

```javascript
// ❌ Mauvaise approche
const visibleMessages = messages.filter(m => !m.isBurned);
```

**Problèmes** :
- Les messages brûlés sont quand même envoyés sur le réseau (fuite de données)
- Les utilisateurs pourraient intercepter les requêtes et voir le contenu
- Charge réseau inutile

### Option 2 : Filtrer côté Backend ✅

```sql
-- ✅ Bonne approche
WHERE (is_burned = false OR is_burned IS NULL)
```

**Avantages** :
- ✅ **Sécurité** : Les messages brûlés ne quittent jamais le serveur
- ✅ **Performance** : Moins de données envoyées sur le réseau
- ✅ **Confidentialité** : Impossibilité d'intercepter les messages brûlés
- ✅ **Cohérence** : Source unique de vérité (la DB)

---

## 🔒 Sécurité

### Données Détruites ou Cachées ?

**Question** : Les messages brûlés sont-ils vraiment détruits ?

**Réponse** : **Oui**, grâce à `burnMessage()` :

```javascript
async burnMessage(messageId, burnedAt = new Date()) {
    await run(this.pool, `
        UPDATE messages 
        SET is_burned = true, 
            burned_at = $1, 
            body = '[Message détruit]',  // ✅ Contenu écrasé
            scheduled_burn_at = NULL
        WHERE id = $2
    `, [burnedAt, messageId]);
}
```

**Sécurité multicouche** :
1. ✅ `body` écrasé par `'[Message détruit]'`
2. ✅ `is_burned = true` empêche le chargement
3. ✅ Même si quelqu'un accède à la DB, le contenu est détruit

---

## 🧪 Comment Tester le Fix

### Scénario de Test

1. **Créer une conversation** entre Alice et Bob
2. **Alice envoie un fichier** avec "Burn After Reading"
3. **Bob télécharge le fichier** → Message brûlé
4. **Bob se déconnecte** puis **se reconnecte**
5. **Vérifier** : Le message brûlé ne doit PAS réapparaître

### Test Manuel

```powershell
# 1. Démarrer l'application
.\start-dev.ps1

# 2. Ouvrir deux navigateurs (Alice et Bob)
# Alice: http://localhost:5173
# Bob: http://localhost:5173 (mode incognito)

# 3. Alice envoie un fichier avec "Burn After Reading"
# 4. Bob télécharge → Message disparaît
# 5. Bob ferme et rouvre l'application
# 6. ✅ Vérifier que le message n'est PAS revenu
```

### Test avec la DB Directement

```bash
# Se connecter à PostgreSQL
psql -U postgres -d deaddrop

# Vérifier qu'un message est brûlé
SELECT id, body, is_burned, burned_at 
FROM messages 
WHERE is_burned = true;

# Résultat attendu:
# id | body                | is_burned | burned_at
# ---|---------------------|-----------|----------
# 123| [Message détruit]   | true      | 2025-12-12
```

---

## 📊 Impact du Fix

### Avant le Fix

| Action | Comportement |
|--------|--------------|
| **Télécharger fichier** | ✅ Message brûlé |
| **Rester connecté** | ✅ Message reste brûlé |
| **Se reconnecter** | ❌ **Message réapparaît** |

### Après le Fix

| Action | Comportement |
|--------|--------------|
| **Télécharger fichier** | ✅ Message brûlé |
| **Rester connecté** | ✅ Message reste brûlé |
| **Se reconnecter** | ✅ **Message reste brûlé** |

---

## 🔄 Flux Complet (Après le Fix)

```
┌──────────────────────────────────────────────────────────────┐
│ 1. Alice envoie fichier avec "Burn After Reading"           │
└──────────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────────┐
│ 2. Message stocké en DB avec scheduled_burn_at              │
│    is_burned = false                                         │
└──────────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────────┐
│ 3. Bob télécharge le fichier                                │
└──────────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────────┐
│ 4. Frontend → socket.emit('burn_message')                   │
└──────────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────────┐
│ 5. Backend → db.burnMessage()                               │
│    UPDATE messages SET:                                      │
│    - is_burned = true                                        │
│    - body = '[Message détruit]'                             │
│    - burned_at = NOW()                                       │
└──────────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────────┐
│ 6. Backend → io.emit('message_burned')                      │
└──────────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────────┐
│ 7. Frontend → Message disparaît (isBurned: true)           │
└──────────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────────┐
│ 8. Bob se déconnecte et se reconnecte                       │
└──────────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────────┐
│ 9. Frontend → GET /api/v2/conversations/:id/messages        │
└──────────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────────┐
│ 10. Backend → SELECT WHERE is_burned = false                │
│     ✅ Messages brûlés EXCLUS de la réponse                 │
└──────────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────────┐
│ 11. Bob voit seulement les messages non-brûlés              │
│     ✅ Message brûlé n'apparaît PAS                         │
└──────────────────────────────────────────────────────────────┘
```

---

## 📝 Notes Supplémentaires

### Pourquoi `(is_burned = false OR is_burned IS NULL)` ?

- **`is_burned = false`** : Messages normaux (pas Burn After Reading)
- **`is_burned IS NULL`** : Messages anciens (avant la fonctionnalité)
- **`is_burned = true`** : Messages brûlés (❌ exclus)

### Migration des Messages Existants

Aucune migration nécessaire ! La clause `OR is_burned IS NULL` gère les messages existants.

### Performance

```sql
-- Index recommandé (si beaucoup de messages)
CREATE INDEX idx_messages_burned 
ON messages(conversation_id, is_burned, created_at);
```

Cela accélère la requête avec le filtre `is_burned`.

---

## ✅ Résultat Final

**Le bug est corrigé** :
- ✅ Messages brûlés disparaissent définitivement
- ✅ Ne réapparaissent JAMAIS, même après reconnexion
- ✅ Contenu détruit dans la DB (`body = '[Message détruit]'`)
- ✅ Sécurité renforcée (messages brûlés ne quittent pas le serveur)

---

**Date du fix** : 12 Décembre 2025  
**Fichiers modifiés** : `apps/bridge/src/db/database.js`  
**Fonctions corrigées** : 3 (getConversationMessages, getConversationMessagesPaged, getLastMessage)  
**Statut** : ✅ **Résolu**
