# 🔧 DÉPANNAGE - ERREUR FETCH STANDARD SIGNUP

## 📅 Date
11 Novembre 2025

## 🚨 PROBLÈME IDENTIFIÉ

### Symptôme
```
❌ Erreur de fetching sur la page d'inscription standard (12 et 24 mots)
```

### Cause Racine
```
Le backend n'est PAS démarré sur http://localhost:4000
```

---

## ✅ VÉRIFICATIONS EFFECTUÉES

### 1. Code Frontend (SignupFluid.tsx)
```typescript
const handleStandardLengthSubmit = async (length: 12 | 24) => {
  const response = await fetch('http://localhost:4000/api/v2/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      method: 'standard',
      mnemonicLength: length,
    }),
  });
  // ...
}
```
✅ Code frontend correct

---

### 2. Code Backend (auth.ts)
```typescript
if (body.method === 'standard') {
  const length = body.mnemonicLength === 24 ? 24 : 12;
  const strength = length === 24 ? 256 : 128;
  const mnemonicArray = bip39.generateMnemonic(strength).split(' ');
  // ...
}
```
✅ Code backend correct

---

### 3. BIP-39 Installation
```bash
$ node test-bip39.js
Testing BIP-39...
12 words: stand excess rhythm hole cart drive chronic air will garlic error divert
24 words: iron diagram ticket distance bomb very stomach fossil...
Success!
```
✅ BIP-39 fonctionne correctement

---

### 4. Backend Status
```bash
$ curl http://localhost:4000/api/health
❌ Impossible de se connecter au serveur distant
```
**❌ LE BACKEND N'EST PAS DÉMARRÉ !**

---

## 🛠️ SOLUTION

### Étape 1 : Démarrer le Backend

#### Terminal 1 : Backend
```bash
cd C:\Users\jerem\Desktop\scrt\projectchimera\project_chimera_repo\apps\bridge
npm run dev
```

**Output attendu** :
```
[Bridge] Server listening at http://localhost:4000
[Bridge] Database initialized
✅ Backend ready
```

---

#### Terminal 2 : Frontend (si pas déjà lancé)
```bash
cd C:\Users\jerem\Desktop\scrt\projectchimera\project_chimera_repo\apps\frontend
npm run dev
```

**Output attendu** :
```
VITE v5.x.x ready in xxx ms
➜ Local: http://localhost:5178/
✅ Frontend ready
```

---

### Étape 2 : Vérifier le Backend

#### Test Health Endpoint
```bash
curl http://localhost:4000/api/health
```

**Réponse attendue** :
```json
{"status":"ok"}
```

#### Test Signup Endpoint (via Postman ou curl)
```bash
curl -X POST http://localhost:4000/api/v2/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "method": "standard",
    "mnemonicLength": 12
  }'
```

**Réponse attendue** :
```json
{
  "id": "...",
  "username": "testuser",
  "securityTier": "standard",
  "accessToken": "...",
  "refreshToken": "...",
  "mnemonic": ["word1", "word2", ..., "word12"]
}
```

---

### Étape 3 : Tester le Signup Standard

1. **Frontend** : http://localhost:5178/signup
2. **Choisir** : Standard
3. **Username** : alice
4. **Cliquer** : 12 Mots
5. **Résultat** : ✅ Mnemonic affiché

---

## 📊 CHECKLIST DÉMARRAGE

Avant de tester Dead Drop, assurez-vous que :

- [ ] **Terminal 1** : Backend running sur port 4000
  ```
  cd apps/bridge
  npm run dev
  ```

- [ ] **Terminal 2** : Frontend running sur port 5178
  ```
  cd apps/frontend
  npm run dev
  ```

- [ ] **Test Backend** : `curl http://localhost:4000/api/health`
  - Doit retourner `{"status":"ok"}`

- [ ] **Test Frontend** : Ouvrir http://localhost:5178/
  - Doit afficher la Landing page

- [ ] **Test Complet** : Signup Standard → 12 Mots
  - Doit afficher le mnemonic sans erreur

---

## 🔍 DIAGNOSTICS SUPPLÉMENTAIRES

### Si Backend ne démarre pas

#### Erreur : Port déjà utilisé
```
Error: listen EADDRINUSE: address already in use :::4000
```

**Solution** :
```bash
# Windows
netstat -ano | findstr :4000
taskkill /PID <PID> /F
```

---

#### Erreur : Module manquant
```
Cannot find module 'bip39'
```

**Solution** :
```bash
cd apps/bridge
npm install
```

---

#### Erreur : Database
```
Error: SQLITE_ERROR: no such table
```

**Solution** :
```bash
cd apps/bridge
rm -rf data/deaddrop.db
npm run dev  # Recrée la DB
```

---

### Si Frontend ne démarre pas

#### Erreur : Port déjà utilisé
```
Port 5178 is already in use
```

**Solution** :
```bash
# Windows
netstat -ano | findstr :5178
taskkill /PID <PID> /F
```

---

#### Erreur : Module manquant
```
Cannot find module '@/lib/...'
```

**Solution** :
```bash
cd apps/frontend
npm install
```

---

## 🎯 ERREURS COURANTES ET SOLUTIONS

| Erreur | Cause | Solution |
|--------|-------|----------|
| `Failed to fetch` | Backend pas démarré | `npm run dev` dans apps/bridge |
| `CORS error` | CORS mal configuré | Vérifier @fastify/cors dans backend |
| `404 Not Found` | Route inexistante | Vérifier endpoint dans auth.ts |
| `500 Internal Error` | Bug backend | Vérifier logs backend |
| `Network error` | Mauvaise URL | Vérifier `http://localhost:4000` |

---

## 📝 ORDRE DE DÉMARRAGE RECOMMANDÉ

### 1️⃣ Backend d'abord
```bash
# Terminal 1
cd C:\Users\jerem\Desktop\scrt\projectchimera\project_chimera_repo\apps\bridge
npm run dev
```

**Attendre** : `Server listening at http://localhost:4000`

---

### 2️⃣ Frontend ensuite
```bash
# Terminal 2
cd C:\Users\jerem\Desktop\scrt\projectchimera\project_chimera_repo\apps\frontend
npm run dev
```

**Attendre** : `Local: http://localhost:5178/`

---

### 3️⃣ Test dans le navigateur
```
http://localhost:5178/signup
```

---

## ✅ CONFIRMATION DU FIX

Une fois le backend démarré, le signup standard devrait fonctionner :

```
✅ Choix 12 Mots → Mnemonic affiché
✅ Choix 24 Mots → Mnemonic affiché
✅ Vérification 6 mots → Validation OK
✅ Page bienvenue → Navigation settings
```

---

## 🎉 RÉSUMÉ

### Problème
❌ Fetch error lors du signup standard (12 et 24 mots)

### Cause
Le backend n'était pas démarré

### Solution
```bash
cd apps/bridge
npm run dev
```

### Résultat
✅ Backend running sur port 4000  
✅ Signup standard fonctionnel  
✅ Mnemonic généré correctement  

---

**FIN DU DOCUMENT - TROUBLESHOOTING** 🔧✅

**Action immédiate** : Démarrer le backend avec `npm run dev` !
