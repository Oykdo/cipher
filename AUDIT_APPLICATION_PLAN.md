# 📋 Plan d'Application de l'Audit de Sécurité Complet

**Date** : 11 Décembre 2025  
**Contexte** : Audit pré-production de Cipher Pulse  
**Statut** : ✅ Phase 1 Complétée | 🔄 Phases 2-5 En Attente

---

## 📊 Résumé Exécutif

### Ce qui a été fait (Phase 1)

✅ **Corrections Critiques Appliquées** :
1. Console.log crypto supprimés (8 occurrences dangereuses)
2. Debug div production supprimé
3. Logger conditionnel créé (`debugLogger.ts`)
4. Fichiers .log supprimés du repository
5. Scripts obsolètes et placeholders nettoyés
6. Prisma désinstallé (80 packages libérés)
7. .gitignore amélioré
8. TODOs critiques implémentés (Time-Lock, Contacts backup)
9. Scripts de déploiement créés (Bash + PowerShell)

### Ce qui reste à faire

🔴 **BLOQUANT PRODUCTION** :
- [ ] Régénération DATABASE_URL (action utilisateur)
- [ ] Régénération JWT_SECRET (action utilisateur)

🟠 **IMPORTANT AVANT LANCEMENT** :
- [ ] Remplacer console.log restants (~115)
- [ ] Implémenter ou désactiver Refresh Token endpoint
- [ ] Tests E2E complets
- [ ] Setup monitoring (Sentry)

🟡 **POST-LANCEMENT** :
- [ ] Augmenter couverture de tests
- [ ] Optimisations de performance
- [ ] Documentation utilisateur

---

## 🎯 Phase 2 : Sécurité & Secrets (CRITIQUE)

### Objectif
Éliminer toutes les expositions de secrets et credentials.

### Actions Requises (Utilisateur)

#### 2.1. Régénérer DATABASE_URL
**Pourquoi** : Credentials PostgreSQL exposés dans `.env` local  
**Comment** :
1. Se connecter à https://console.neon.tech/
2. Sélectionner projet `neondb`
3. Settings → Reset Password
4. Copier nouveau `DATABASE_URL`
5. Mettre à jour `apps/bridge/.env` (local)
6. Configurer dans Render/Fly.io (production)

**Temps estimé** : 5 minutes  
**Priorité** : 🔴 CRITIQUE

---

#### 2.2. Régénérer JWT_SECRET
**Pourquoi** : Secret JWT exposé dans `.env`  
**Comment** :
```bash
# Générer nouveau secret (128 caractères)
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"

# Ou avec PowerShell
powershell -Command "[Convert]::ToBase64String((1..64 | ForEach-Object { Get-Random -Maximum 256 }))"
```

**Impact** : Tous les tokens existants seront invalidés. Utilisateurs devront se reconnecter.

**Temps estimé** : 3 minutes  
**Priorité** : 🔴 CRITIQUE

---

#### 2.3. Vérifier Historique Git
**Pourquoi** : S'assurer qu'aucun secret n'a été commité  
**Comment** :
```bash
# Rechercher .env dans l'historique
git log --all --full-history -- "**/*.env" --oneline

# Si des commits trouvés, purger l'historique :
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch apps/bridge/.env" \
  --prune-empty --tag-name-filter cat -- --all

# Force push (coordonner avec l'équipe !)
git push origin --force --all
```

**Temps estimé** : 10 minutes  
**Priorité** : 🔴 CRITIQUE

---

#### 2.4. Configurer Variables d'Environnement Production

**Render.com** :
1. Dashboard → Web Service → Environment
2. Ajouter :
   - `DATABASE_URL` = nouveau URL Neon
   - `JWT_SECRET` = nouveau secret
   - `NODE_ENV` = production
   - `PORT` = 10000 (par défaut)
   - `CORS_ORIGIN` = https://votre-frontend.vercel.app

**Vercel** :
1. Dashboard → Project → Settings → Environment Variables
2. Ajouter :
   - `VITE_API_BASE_URL` = https://votre-backend.render.com
   - `VITE_WS_BASE_URL` = wss://votre-backend.render.com

**Temps estimé** : 10 minutes  
**Priorité** : 🔴 CRITIQUE

---

## 🧹 Phase 3 : Nettoyage du Code (IMPORTANT)

### Objectif
Éliminer les logs debug et améliorer la qualité du code.

### Actions

#### 3.1. Remplacer Console.log Restants
**Statut** : Guide créé (`TODO_CONSOLE_LOG_REPLACEMENT.md`)  
**Restant** : ~115 console.log à remplacer

**Stratégie Recommandée** : Semi-automatique avec VS Code

1. **Ouvrir Find in Files** (Ctrl+Shift+F)
2. **Regex** : `console\.(log|warn|error)\(([`'"])([^`'"]+)\2([^\)]*)\)`
3. **Remplacer manuellement selon contexte** :
   - E2EE logs → `debugLogger.e2ee()`
   - P2P logs → `debugLogger.p2p()`
   - WebSocket → `debugLogger.websocket()`
   - Général → `debugLogger.debug()`
   - Erreurs → `debugLogger.error()`

**Temps estimé** : 30-60 minutes  
**Priorité** : 🟠 HAUTE (avant production)

**Peut être délégué** : Oui (avec le guide)

---

#### 3.2. Implémenter Refresh Token Endpoint
**Fichier** : `apps/bridge/src/routes/auth.ts`  
**TODO** : Ligne ~89

**Options** :

**Option A : Implémentation Complète** (2-3h)
```typescript
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  
  // Vérifier refresh token en DB
  const session = await getSessionByRefreshToken(refreshToken);
  if (!session || session.expiresAt < Date.now()) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
  
  // Générer nouveau access token
  const newAccessToken = jwt.sign(
    { userId: session.userId, username: session.username },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
  
  res.json({ accessToken: newAccessToken });
});
```

**Option B : Désactivation Temporaire** (5 min)
```typescript
router.post('/refresh', async (req, res) => {
  res.status(501).json({ 
    error: 'Refresh token not implemented yet',
    message: 'Please re-login to get new access token'
  });
});
```

**Option C : Supprimer l'Endpoint** (1 min)
- Supprimer la route `/refresh`
- Mettre à jour frontend pour gérer re-login automatique

**Recommandation** : Option B (désactiver temporairement) pour ne pas bloquer le lancement.

**Temps estimé** : 5 minutes (Option B) | 3 heures (Option A)  
**Priorité** : 🟡 MOYENNE (non-bloquant si Option B)

---

## 🧪 Phase 4 : Tests & Validation (CRITIQUE)

### Objectif
S'assurer que l'application fonctionne correctement avant le lancement.

### Actions

#### 4.1. Tests Unitaires
```bash
# Frontend
cd apps/frontend
npm test

# Backend
cd apps/bridge
npm test
```

**Résultat attendu** : Tous les tests passent ✅

**Temps estimé** : 5 minutes  
**Priorité** : 🔴 CRITIQUE

---

#### 4.2. Type Checking
```bash
# Frontend
cd apps/frontend
npm run type-check

# Backend (si configuré)
cd apps/bridge
npx tsc --noEmit
```

**Résultat attendu** : Aucune erreur TypeScript

**Temps estimé** : 3 minutes  
**Priorité** : 🔴 CRITIQUE

---

#### 4.3. Build Production
```bash
# Frontend
cd apps/frontend
npm run build
# Taille attendue : ~500 KB (gzipped)

# Backend
cd apps/bridge
npm run build
```

**Résultat attendu** : Build réussi sans erreurs

**Temps estimé** : 5 minutes  
**Priorité** : 🔴 CRITIQUE

---

#### 4.4. Tests E2E Manuels (Staging)

**Scénarios Critiques** :

1. **Signup Flow**
   - [ ] Créer compte avec DiceKey
   - [ ] Vérifier génération clés E2EE
   - [ ] Vérifier stockage sécurisé

2. **Login Flow**
   - [ ] Login avec DiceKey correct
   - [ ] Rejection DiceKey incorrect
   - [ ] Restauration session après refresh

3. **Messaging**
   - [ ] Envoi message NaCl Box (baseline)
   - [ ] Envoi message Double Ratchet (X3DH handshake)
   - [ ] Réception et déchiffrement
   - [ ] Messages hors ligne (store & forward)

4. **Burn After Reading**
   - [ ] Créer message BAR (60s timer)
   - [ ] Vérifier affichage countdown
   - [ ] Vérifier suppression automatique
   - [ ] Vérifier `is_burned` = 1 en DB

5. **Time-Lock**
   - [ ] Créer message Time-Lock (BTC block height)
   - [ ] Vérifier affichage "Locked" jusqu'au block
   - [ ] Vérifier unlock automatique

6. **Backup/Restore**
   - [ ] Créer backup chiffré avec mot de passe
   - [ ] Restaurer sur nouveau compte
   - [ ] Vérifier conversations restaurées
   - [ ] Vérifier contacts restaurés
   - [ ] Vérifier clés E2EE restaurées

7. **P2P Mode**
   - [ ] Activer P2P
   - [ ] Établir connexion WebRTC
   - [ ] Envoyer message P2P (hors serveur)
   - [ ] Vérifier fallback sur erreur

**Temps estimé** : 45-60 minutes  
**Priorité** : 🔴 CRITIQUE

---

#### 4.5. Tests de Sécurité

**Vérifications** :

1. **Aucun secret en clair** :
```bash
# Rechercher dans le code source
rg -i "password|secret|token" apps/frontend/dist apps/bridge/dist
# Résultat attendu : Aucun secret en clair (seulement variables d'env)
```

2. **Aucun console.log crypto** :
```bash
rg "console\.(log|warn).*\b(key|secret|shared|fingerprint)\b" apps/frontend/src
# Résultat attendu : Aucun match
```

3. **CSP Headers** :
   - Vérifier Content-Security-Policy configuré
   - Pas de inline scripts dans production

4. **Rate Limiting** :
   - Tester 10+ requêtes/seconde sur `/api/auth/login`
   - Résultat attendu : 429 Too Many Requests

**Temps estimé** : 20 minutes  
**Priorité** : 🔴 CRITIQUE

---

## 🚀 Phase 5 : Déploiement (PRODUCTION)

### Objectif
Déployer en production de manière sécurisée et vérifiable.

### Prérequis
- [ ] Phase 2 complétée (secrets régénérés)
- [ ] Phase 3 complétée (code nettoyé)
- [ ] Phase 4 complétée (tests passés)

### Actions

#### 5.1. Déploiement Staging
```bash
# Utiliser le script automatisé
./scripts/deploy.sh staging

# Ou PowerShell (Windows)
.\scripts\deploy.ps1 -Environment staging
```

**Temps estimé** : 10 minutes  
**Vérifier** : Staging URL accessible et fonctionnel

---

#### 5.2. Tests Staging Complets
- [ ] Exécuter tous les tests E2E manuels (section 4.4)
- [ ] Vérifier logs d'erreur (Render Dashboard)
- [ ] Tester depuis plusieurs navigateurs (Chrome, Firefox, Safari)
- [ ] Tester depuis mobile (iOS, Android)

**Temps estimé** : 60 minutes

---

#### 5.3. Déploiement Production
```bash
# Utiliser le script automatisé
./scripts/deploy.sh production

# Ou PowerShell (Windows)
.\scripts\deploy.ps1 -Environment production
```

**Confirmations requises** :
- Type "yes" pour confirmer production deployment
- Vérifier commit hash correct

**Temps estimé** : 10 minutes

---

#### 5.4. Smoke Tests Production
**Immédiatement après déploiement** :

1. **Vérifier URLs** :
   - [ ] Frontend accessible : https://cipher-pulse.vercel.app
   - [ ] Backend health check : https://api.cipher-pulse.render.com/health
   - [ ] WebSocket connecte : wss://api.cipher-pulse.render.com

2. **Tests Rapides** :
   - [ ] Signup nouveau compte (2 min)
   - [ ] Login compte existant (1 min)
   - [ ] Envoi message (1 min)
   - [ ] Réception message (1 min)

3. **Monitoring** :
   - [ ] Vérifier Sentry : aucune erreur critique
   - [ ] Vérifier Render logs : aucune erreur 500
   - [ ] Vérifier Vercel logs : build réussi

**Temps estimé** : 10 minutes  
**Priorité** : 🔴 CRITIQUE

---

## 📈 Phase 6 : Monitoring & Observabilité (POST-LANCEMENT)

### Objectif
Surveiller l'application en production et détecter les problèmes rapidement.

### Actions

#### 6.1. Setup Sentry
```bash
npm install @sentry/react @sentry/tracing
```

**Configuration** :
```typescript
// apps/frontend/src/main.tsx
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: 'YOUR_SENTRY_DSN',
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.1,
  beforeSend(event) {
    // Ne pas envoyer de données sensibles
    if (event.exception) {
      delete event.request?.data; // Supprimer body requests
    }
    return event;
  }
});
```

**Temps estimé** : 30 minutes  
**Priorité** : 🟠 HAUTE (post-lancement immédiat)

---

#### 6.2. Setup Application Monitoring

**Métriques à Surveiller** :

1. **Performance** :
   - Temps de réponse API (95e percentile < 500ms)
   - Temps de chargement frontend (< 3s)
   - Temps d'établissement WebSocket (< 2s)

2. **Erreurs** :
   - Taux d'erreur API (< 1%)
   - Taux d'erreur frontend (< 0.5%)
   - Échecs de déchiffrement (< 0.1%)

3. **Business** :
   - Signups/jour
   - Messages envoyés/jour
   - Taux d'activation (signup → 1er message)
   - Taux de rétention J1, J7, J30

**Outils Recommandés** :
- Sentry (erreurs)
- Render Metrics (backend performance)
- Vercel Analytics (frontend performance)
- Neon Dashboard (database metrics)

**Temps estimé** : 2 heures  
**Priorité** : 🟡 MOYENNE (première semaine)

---

## 🔧 Phase 7 : Optimisations (POST-LANCEMENT)

### Objectif
Améliorer performance, sécurité et expérience utilisateur après le lancement.

### Actions Suggérées

#### 7.1. Augmenter Couverture de Tests

**Actuellement** : ~30% de couverture  
**Objectif** : 80% de couverture

**Focus** :
1. Fonctions cryptographiques E2EE (x3dh, doubleRatchet)
2. Logique métier critique (burnService, backupService)
3. Gestionnaires d'erreurs

**Temps estimé** : 10-15 heures  
**Priorité** : 🟡 MOYENNE

---

#### 7.2. Optimisations Performance

**Opportunités** :

1. **Code Splitting** :
   ```typescript
   // apps/frontend/vite.config.ts
   build: {
     rollupOptions: {
       output: {
         manualChunks: {
           'vendor': ['react', 'react-dom'],
           'crypto': ['libsodium-wrappers', '@noble/secp256k1']
         }
       }
     }
   }
   ```

2. **Service Worker** :
   - Cache assets statiques
   - Offline support
   - Background sync messages

3. **Database Indexing** :
   ```sql
   CREATE INDEX idx_messages_unlock_time ON messages(unlock_block_height)
   WHERE unlock_block_height IS NOT NULL;
   
   CREATE INDEX idx_messages_burn_time ON messages(burn_after_unix_ms)
   WHERE burn_after_unix_ms IS NOT NULL;
   ```

**Temps estimé** : 8 heures  
**Priorité** : 🟢 BASSE

---

#### 7.3. Fonctionnalités Post-MVP

**Roadmap Suggérée** :

1. **Contact Verification** (2 semaines)
   - QR code scanning
   - Safety numbers
   - Verification badges

2. **Group Chats** (3 semaines)
   - Sender Keys protocol
   - Member management
   - Group key rotation

3. **Voice Messages** (1 semaine)
   - WebRTC audio recording
   - Encrypted audio storage
   - Voice message player

4. **Desktop App** (2 semaines)
   - Electron packaging
   - Auto-updates
   - OS notifications

**Priorité** : 🟢 BASSE (après stabilisation)

---

## 📊 Timeline Recommandé

| Phase | Description | Durée | Dépendances |
|-------|-------------|-------|-------------|
| **Phase 1** | ✅ Corrections Critiques | 4h | - |
| **Phase 2** | 🔴 Sécurité & Secrets | 30 min | - |
| **Phase 3** | 🟠 Nettoyage Code | 2h | Phase 2 |
| **Phase 4** | 🔴 Tests & Validation | 2h | Phase 3 |
| **Phase 5** | 🚀 Déploiement Prod | 2h | Phase 4 |
| **Phase 6** | 🟠 Monitoring | 3h | Phase 5 |
| **Phase 7** | 🟡 Optimisations | 20h+ | Phase 6 |

**Total Pré-Production** : ~10 heures  
**Total Post-Production** : ~20+ heures (optionnel)

---

## ✅ Checklist de Validation Finale

Avant de lancer en production, cocher :

### Sécurité
- [ ] DATABASE_URL régénéré
- [ ] JWT_SECRET régénéré (128+ caractères)
- [ ] Aucun secret dans .env commité Git
- [ ] Aucun console.log crypto dans code
- [ ] CORS configuré strictement (pas de wildcard)
- [ ] Rate limiting activé
- [ ] Helmet middleware activé
- [ ] CSP headers configurés

### Infrastructure
- [ ] Base Neon upgradée (Pro plan)
- [ ] Backend déployé Render/Fly.io
- [ ] Frontend déployé Vercel/Netlify
- [ ] Variables d'environnement configurées
- [ ] SSL/TLS actif partout
- [ ] Domaine custom configuré (optionnel)

### Code Quality
- [ ] Tous les tests passent (npm test)
- [ ] Type checking OK (npm run type-check)
- [ ] Build production OK (npm run build)
- [ ] Aucune erreur ESLint critique
- [ ] Console.log remplacés par debugLogger

### Features
- [ ] Signup/Login fonctionnel
- [ ] Messaging E2EE fonctionnel
- [ ] Burn After Reading fonctionnel
- [ ] Time-Lock fonctionnel
- [ ] Backup/Restore fonctionnel
- [ ] P2P mode fonctionnel (fallback graceful)

### Monitoring
- [ ] Sentry configuré
- [ ] Logs centralisés accessibles
- [ ] Alertes d'erreurs configurées
- [ ] Métriques business trackées

### Documentation
- [ ] README.md à jour
- [ ] DEPLOYMENT_GUIDE.md créé
- [ ] API documentation (optionnel)
- [ ] User guide (optionnel)

---

## 🆘 Dépannage

### Problème : "JWT_SECRET too short"
**Solution** : Générer nouveau secret 128+ caractères
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
```

### Problème : "Database connection failed"
**Solution** : Vérifier DATABASE_URL dans .env et Render

### Problème : "CORS error"
**Solution** : Configurer CORS_ORIGIN dans backend .env

### Problème : "Build failed - TypeScript errors"
**Solution** : Exécuter `npm run type-check` et corriger erreurs

### Problème : "Déploiement Vercel échoue"
**Solution** : Vérifier `VITE_API_BASE_URL` dans Environment Variables

---

## 📞 Support

**Documentation** :
- `ACTIONS_DEPLOIEMENT_REQUISES.md` - Actions utilisateur critiques
- `TODO_CONSOLE_LOG_REPLACEMENT.md` - Guide remplacement logs
- `DEPLOYMENT_GUIDE.md` - Guide déploiement détaillé

**Scripts Automatisés** :
- `scripts/deploy.sh` - Déploiement Linux/Mac
- `scripts/deploy.ps1` - Déploiement Windows
- `scripts/generate_secure_key.ps1` - Génération JWT_SECRET

**Contact** : Si bloqué, demander de l'aide !

---

**Dernière Mise à Jour** : 11 Décembre 2025  
**Version** : 1.0  
**Statut** : ✅ Phase 1 Complétée | 🔄 Phases 2-7 Planifiées
