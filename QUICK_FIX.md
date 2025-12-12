# 🚑 Quick Fix - e2ee-v2

## ✅ Fix Appliqué

### Problème : Backend ne démarre pas
**Erreur** :
```
SyntaxError: The requested module '../db/database.js' does not provide an export named 'db'
```

**Cause** : `publicKeys.ts` utilisait `import { db }` au lieu de `getDatabase()`

**Solution** : ✅ **CORRIGÉ dans commit `98d334b`**

```typescript
// ❌ Avant
import { db } from '../db/database.js';

// ✅ Après
import { getDatabase } from '../db/database.js';
const db = getDatabase();
```

---

## 🚀 Démarrage

### 1. Vérifier les Commits

```bash
git log --oneline -2
```

Vous devriez voir :
```
98d334b fix: correct database import in publicKeys route
ff2c9ab feat: implement e2ee-v2 'Self-Encrypting Message' architecture
```

✅ Si vous voyez ces 2 commits, tout est bon !

---

### 2. Lancer Backend

```bash
cd apps/bridge
npm run dev
```

**Attendez ce message** :
```
Server listening at http://0.0.0.0:3001
✅ Ready
```

**Si erreur** :
- Vérifier que PostgreSQL est en cours d'exécution
- Vérifier `.env` avec `DATABASE_URL`
- Exécuter migration : `node scripts/run-migration.js`

---

### 3. Lancer Frontend

**Nouveau terminal** :
```bash
cd apps/frontend
npm run dev
```

**Attendez ce message** :
```
➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
```

---

### 4. Tester e2ee-v2

1. **Ouvrir** : http://localhost:5173
2. **Login**
3. **Ouvrir Console** (F12)
4. **Vérifier logs** :

```
🔑 [KeyInit] Generating new keys for user...
✅ [KeyInit] Keys stored locally
✅ [KeyInit] Public keys uploaded to server
🎉 [KeyInit] Key initialization complete
🔐 [App] e2ee-v2 keys ready
✅ [Conversations] e2ee-v2 keys detected
```

5. **Envoyer un message**
6. **Vérifier log** :
```
🔐 [E2EE-v2] Encrypting text message with e2ee-v2
📋 [E2EE-v2] Encrypting for 2 participants
✅ [E2EE-v2] Message encrypted successfully
```

7. **Recharger page** → Message toujours visible ✅

---

## 🐛 Dépannage

### Backend ne démarre pas

#### Erreur : `Cannot find package 'ts-node'`
**Solution** : Utiliser `npm run dev` au lieu de `node src/index.ts`

#### Erreur : `connect ECONNREFUSED`
**Cause** : PostgreSQL n'est pas lancé ou mauvaise `DATABASE_URL`

**Solution** :
1. Vérifier PostgreSQL :
   ```bash
   # Windows
   sc query postgresql-x64-14
   
   # Linux/Mac
   sudo systemctl status postgresql
   ```

2. Vérifier `.env` :
   ```bash
   cat apps/bridge/.env | grep DATABASE_URL
   ```

3. Tester connexion :
   ```bash
   cd apps/bridge
   node scripts/run-migration.js
   ```

#### Erreur : `relation "users" does not exist`
**Solution** : Base de données vide, exécuter les migrations :
```bash
cd apps/bridge
# Vérifier les migrations existantes
ls -la scripts/migrations/ 2>/dev/null || dir scripts\migrations\

# Exécuter migration e2ee-v2
node scripts/run-migration.js
```

---

### Frontend ne démarre pas

#### Erreur : `EADDRINUSE: address already in use`
**Cause** : Port 5173 déjà utilisé

**Solution** :
1. Fermer l'autre instance
2. Ou changer le port dans `vite.config.ts` :
   ```typescript
   server: {
     port: 5174 // nouveau port
   }
   ```

#### Erreur : `Failed to resolve module libsodium`
**Cause** : Dépendances manquantes

**Solution** :
```bash
cd apps/frontend
npm install
```

---

### Messages ne s'affichent pas en e2ee-v2

#### Symptôme : Logs montrent `[E2EE-v1]` au lieu de `[E2EE-v2]`

**Causes possibles** :

1. **Clés non générées**
   ```javascript
   // Console navigateur
   localStorage.getItem('e2ee-v2:keys:YOUR_USER_ID')
   // Si null → clés manquantes
   ```

   **Solution** : Forcer régénération
   ```javascript
   Object.keys(localStorage).forEach(key => {
     if (key.startsWith('e2ee-v2:keys:')) {
       localStorage.removeItem(key);
     }
   });
   location.reload();
   ```

2. **Clés publiques non uploadées**
   ```sql
   -- Vérifier dans DB
   SELECT username, 
          CASE WHEN public_key IS NULL THEN '❌ Missing' ELSE '✅ Present' END as public_key,
          CASE WHEN sign_public_key IS NULL THEN '❌ Missing' ELSE '✅ Present' END as sign_key
   FROM users 
   WHERE username = 'your-username';
   ```

   **Solution** : Si manquant, forcer régénération (voir ci-dessus)

3. **Migration SQL non exécutée**
   ```sql
   -- Vérifier colonnes
   SELECT column_name 
   FROM information_schema.columns 
   WHERE table_name = 'users' 
     AND column_name IN ('public_key', 'sign_public_key');
   ```

   **Solution** : Si vide, exécuter migration
   ```bash
   cd apps/bridge
   node scripts/run-migration.js
   ```

---

### Erreur au Build Production

#### Symptôme : `argon2.wasm: ESM integration not supported`

**Cause** : argon2-browser WASM nécessite configuration Vite spéciale

**Impact** :
- ❌ `npm run build` échoue
- ✅ `npm run dev` fonctionne

**Solution Temporaire** : Utiliser dev mode pour tester

**Solution Permanente** :
```bash
cd apps/frontend
npm install vite-plugin-wasm
```

Puis modifier `vite.config.ts` :
```typescript
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [
    react(),
    wasm(), // ← Ajouter
    // ...
  ]
});
```

---

## 📊 Checklist de Vérification

### Backend ✅
- [ ] PostgreSQL en cours d'exécution
- [ ] `.env` avec `DATABASE_URL` valide
- [ ] Migration SQL exécutée (colonnes `public_key`, `sign_public_key` existent)
- [ ] Backend démarre : `Server listening at http://0.0.0.0:3001`
- [ ] Route `/health` répond : `curl http://localhost:3001/health`

### Frontend ✅
- [ ] Dépendances installées : `npm install`
- [ ] Frontend démarre : `Local: http://localhost:5173/`
- [ ] Console montre : `🔐 [App] e2ee-v2 keys ready`
- [ ] Clés générées : Check localStorage `e2ee-v2:keys:*`

### e2ee-v2 ✅
- [ ] Clés publiques en BDD : `SELECT public_key FROM users LIMIT 1`
- [ ] Envoi message : Log `✅ [E2EE-v2] Message encrypted successfully`
- [ ] Réception : Log `✅ [E2EE-v2] Decrypted successfully`
- [ ] Relecture sender : Message visible après cache clear ✅

---

## 🎯 Test Critique Final

```bash
# 1. Lancer app (backend + frontend)
# 2. Login
# 3. Envoyer message "Test e2ee-v2"
# 4. Console navigateur :

Object.keys(localStorage).forEach(key => {
  if (key.startsWith('e2ee:decrypted:')) {
    localStorage.removeItem(key);
  }
});
console.log('Cache vidé !');
location.reload();

# 5. Ouvrir conversation
# 6. VÉRIFIER : Message "Test e2ee-v2" toujours visible ✅
```

**Résultat attendu** : ✅ Message visible (e2ee-v2 fonctionne !)

---

## 📚 Ressources

- **Guide complet** : [START_TESTING.md](START_TESTING.md)
- **Architecture** : [E2EE_V2_README.md](E2EE_V2_README.md)
- **Index** : [E2EE_V2_INDEX.md](E2EE_V2_INDEX.md)

---

**Tout devrait fonctionner maintenant ! 🚀**
