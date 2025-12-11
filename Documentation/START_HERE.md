# 🚀 DÉMARRAGE RAPIDE - DEAD DROP

## 📅 Dernière mise à jour
11 Novembre 2025

---

## ⚡ MÉTHODE RAPIDE (Recommandée)

### Windows PowerShell
```powershell
.\start-dev.ps1
```

Ce script :
- ✅ Démarre le backend sur port 4000
- ✅ Démarre le frontend sur port 5178
- ✅ Ouvre automatiquement le navigateur
- ✅ Vérifie si les services sont déjà lancés

---

## 🔧 MÉTHODE MANUELLE

### Terminal 1 : Backend
```bash
cd apps/bridge
npm run dev
```

**Attendre le message** :
```
[Bridge] Server listening at http://localhost:4000
✅ Backend ready
```

---

### Terminal 2 : Frontend
```bash
cd apps/frontend
npm run dev
```

**Attendre le message** :
```
VITE ready
➜ Local: http://localhost:5178/
✅ Frontend ready
```

---

### Terminal 3 : Tests
```bash
# Test backend
curl http://localhost:4000/api/health

# Réponse attendue: {"status":"ok"}
```

---

## 📝 URLS

| Service | URL | Description |
|---------|-----|-------------|
| **Frontend** | http://localhost:5178 | Interface utilisateur |
| **Backend** | http://localhost:4000 | API REST |
| **Health Check** | http://localhost:4000/api/health | Vérification backend |

---

## 🧪 TESTER L'APPLICATION

### 1. Signup Standard (Rapide - 2 minutes)
```
1. http://localhost:5178/signup
2. Choisir "Standard"
3. Username: alice
4. Choisir "12 Mots"
5. Noter les 12 mots affichés
6. Vérification: Saisir 6 mots aléatoires
7. Page bienvenue
8. → /settings ✅
```

**Temps** : 1-2 minutes

---

### 2. Signup DiceKey (Long - 20 minutes)
```
1. http://localhost:5178/signup
2. Choisir "DiceKey"
3. Username: bob
4. Saisir 300 dés (orientation + valeur)
5. Génération clés cryptographiques
6. Welcome: userId + 30 checksums
7. Vérification: 6 checksums aléatoires
8. Set password local
9. → /login puis /settings ✅
```

**Temps** : 15-20 minutes

---

## 🔍 DIAGNOSTICS

### Backend ne démarre pas ?

#### Erreur: Port 4000 déjà utilisé
```bash
# Windows
netstat -ano | findstr :4000
taskkill /PID <PID> /F
```

#### Erreur: Modules manquants
```bash
cd apps/bridge
npm install
```

---

### Frontend ne démarre pas ?

#### Erreur: Port 5178 déjà utilisé
```bash
# Windows
netstat -ano | findstr :5178
taskkill /PID <PID> /F
```

#### Erreur: Modules manquants
```bash
cd apps/frontend
npm install
```

---

## ⚠️ ERREUR COURANTE : FETCH ERROR

### Symptôme
```
❌ Failed to fetch lors du signup standard
```

### Cause
```
Backend pas démarré
```

### Solution
```bash
cd apps/bridge
npm run dev
```

**Voir** : `TROUBLESHOOTING_STANDARD_SIGNUP.md` pour plus de détails

---

## 📊 CHECKLIST AVANT TEST

Avant de tester Dead Drop :

- [ ] Backend running (`curl http://localhost:4000/api/health`)
- [ ] Frontend running (`http://localhost:5178` accessible)
- [ ] Navigateur à jour (Chrome, Firefox, Edge)
- [ ] Console DevTools ouverte (F12) pour voir les erreurs
- [ ] Papier et stylo pour noter la seed/checksums

---

## 🎯 FEATURES DISPONIBLES

### ✅ Implémenté

#### Authentification
- [x] Signup Standard (BIP-39 12/24 mots)
- [x] Signup DiceKey (300 dés)
- [x] Login Standard (username + password)
- [x] Login DiceKey (credentials + checksums)
- [x] Vérification mnemonic (6 mots aléatoires)
- [x] Vérification DiceKey (6 checksums aléatoires)
- [x] Page bienvenue Standard
- [x] Page bienvenue DiceKey
- [x] Username uniqueness check

#### UI/UX
- [x] Landing page avec 3 boutons
- [x] Discover page (FAQ)
- [x] Fluid Cryptography design system
- [x] Glass morphism cards
- [x] Animations Framer Motion
- [x] Responsive design

#### Sécurité
- [x] Zero-knowledge architecture
- [x] E2E encryption (Signal Protocol)
- [x] PBKDF2 key derivation
- [x] Database encryption (SQLCipher)
- [x] JWT authentication
- [x] Refresh tokens

#### Database
- [x] 4 tables clés publiques (identity, signature, pre-keys)
- [x] 8 indexes pour performance
- [x] 3 audit triggers
- [x] SQLCipher encryption

---

### ⏳ À Implémenter

- [ ] Messagerie Drop (créer, envoyer, lire)
- [ ] Burn after reading
- [ ] Pre-Key rotation automatique
- [ ] Backup encrypted checksums
- [ ] Cross-device login flow
- [ ] Argon2 (remplacer PBKDF2)
- [ ] Sound effects
- [ ] Haptic feedback mobile

---

## 📚 DOCUMENTATION

| Document | Description |
|----------|-------------|
| `STANDARD_SIGNUP_INTEGRATED.md` | Interface Standard intégrée |
| `STANDARD_VERIFICATION_FLOW.md` | Vérification mnemonic |
| `TROUBLESHOOTING_STANDARD_SIGNUP.md` | Dépannage erreurs |
| `UI_UX_FINAL_SUMMARY.md` | Design Fluid Cryptography |
| `HYBRID_LOGIN_SYSTEM.md` | Système login hybride |

---

## 🎉 COMMENCER MAINTENANT

### Option 1 : Script automatique (Recommandé)
```powershell
.\start-dev.ps1
```

### Option 2 : Manuel
```bash
# Terminal 1
cd apps/bridge && npm run dev

# Terminal 2
cd apps/frontend && npm run dev

# Navigateur
http://localhost:5178
```

---

**Bonne découverte de Dead Drop ! 🔐✨**

Pour toute question, consultez les documents dans le dossier racine.
