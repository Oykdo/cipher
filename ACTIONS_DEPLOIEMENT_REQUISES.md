# 🚨 Actions Critiques Requises Avant Déploiement

**Date** : 11 Décembre 2025  
**Statut** : ⚠️ **ACTIONS IMMÉDIATES REQUISES**

---

## 🔴 CRITIQUE - Actions à Faire MAINTENANT

### 1. Régénérer le Mot de Passe PostgreSQL (Neon)

**Pourquoi** : Le fichier `apps/bridge/.env` contient des credentials en clair qui ont été exposés localement.

**Actions** :

1. **Se connecter à Neon Dashboard** : https://console.neon.tech/
2. **Sélectionner votre projet** : `neondb`
3. **Aller dans "Settings" → "Reset Password"**
4. **Générer un nouveau mot de passe**
5. **Copier le nouveau `DATABASE_URL`**
6. **Mettre à jour `apps/bridge/.env`** (LOCAL UNIQUEMENT) :
   ```env
   DATABASE_URL=postgresql://neondb_owner:NOUVEAU_MOT_DE_PASSE@ep-lively-bush-ah2hyzr6-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```
7. **Stocker le nouveau `DATABASE_URL` dans les secrets du serveur de production**

**Urgent** : ✅ Faire AVANT tout déploiement

---

### 2. Régénérer le JWT_SECRET

**Pourquoi** : Le secret JWT actuel a été exposé dans le fichier `.env`.

**Actions** :

1. **Générer un nouveau secret (128 caractères minimum)** :
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
   ```

2. **Mettre à jour `apps/bridge/.env`** (LOCAL) :
   ```env
   JWT_SECRET=NOUVEAU_SECRET_ICI
   ```

3. **Stocker dans les secrets de production** (Heroku, Render, etc.)

4. **⚠️ Impact** : Tous les tokens JWT existants seront invalidés. Les utilisateurs devront se reconnecter.

**Urgent** : ✅ Faire AVANT tout déploiement

---

### 3. Vérifier l'Historique Git

**Pourquoi** : S'assurer qu'aucun secret n'a été commité dans Git.

**Actions** :

```bash
# Vérifier si .env a été commité
git log --all --full-history -- "**/*.env" --oneline

# Si des commits sont trouvés, purger l'historique :
# ATTENTION : Ceci réécrit l'historique Git !
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch apps/bridge/.env" \
  --prune-empty --tag-name-filter cat -- --all

# Forcer le push (⚠️ coordinat
ion avec l'équipe requise)
git push origin --force --all
```

**Urgent** : ✅ Vérifier IMMÉDIATEMENT

---

## 🟠 IMPORTANT - Actions Avant Production

### 4. Supprimer les Console.log Debug Restants

**Statut** : ✅ **Partiellement Fait** (logs crypto supprimés)

**Actions Restantes** :

1. Remplacer les `console.log` restants par le nouveau logger :
   ```typescript
   import { debugLogger } from '@/lib/debugLogger';
   
   // Avant :
   console.log('Session created', data);
   
   // Après :
   debugLogger.debug('Session created', data);
   ```

2. Fichiers prioritaires à nettoyer :
   - `apps/frontend/src/lib/e2ee/e2eeService.ts`
   - `apps/frontend/src/lib/e2ee/messagingIntegration.ts`
   - `apps/frontend/src/lib/p2p/key-exchange.ts`

**Délai** : Avant lancement production

---

### 5. Implémenter les TODOs Critiques

**Problèmes identifiés** :

#### 5.1. Time-Lock Messages Non Implémentés
- **Fichier** : `apps/bridge/src/infrastructure/database/repositories/MessageRepository.ts:67`
- **Problème** : `findTimeLocked()` retourne `[]`
- **Impact** : Feature Time-Lock annoncée mais non fonctionnelle

#### 5.2. Contacts Non Sauvegardés dans Backup
- **Fichier** : `apps/frontend/src/lib/backup/backupService.ts:45`
- **Problème** : Contacts non inclus dans le backup chiffré
- **Impact** : Backup incomplet

#### 5.3. Refresh Token Non Implémenté
- **Fichier** : `apps/bridge/src/presentation/http/controllers/AuthController.ts:89`
- **Problème** : Endpoint non implémenté
- **Impact** : Erreur 500 si appelé

**Actions** :
- [ ] Implémenter OU désactiver ces fonctionnalités
- [ ] Retourner HTTP 501 (Not Implemented) pour les endpoints non prêts

**Délai** : Avant lancement (ou désactiver)

---

## 🟡 RECOMMANDÉ - Préparation Infrastructure

### 6. Augmenter la Taille de la Base Neon

**État Actuel** : Plan gratuit Neon (limité)

**Recommandations** :

1. **Plan Pro Neon** : ~19$/mois
   - 10 GB de stockage
   - 2 vCPU
   - Connexions illimitées
   - Support 24/7

2. **Plan Scale** : ~69$/mois (si croissance rapide attendue)
   - 50 GB de stockage
   - 4 vCPU
   - Autoscaling

**Actions** :
- [ ] Estimer le nombre d'utilisateurs attendus
- [ ] Calculer le stockage nécessaire (messages + avatars)
- [ ] Upgrader le plan Neon AVANT le lancement

**Lien** : https://console.neon.tech/ → Billing

---

### 7. Choisir un Hébergeur pour le Backend

**Options Recommandées** :

#### Option A : **Render** (Recommandé pour démarrer)
- ✅ SSL automatique
- ✅ Déploiement depuis Git
- ✅ Variables d'environnement sécurisées
- ✅ ~7$/mois (instance Starter)
- 🔗 https://render.com

**Setup** :
```yaml
# render.yaml
services:
  - type: web
    name: cipher-pulse-backend
    env: node
    buildCommand: cd apps/bridge && npm install && npm run build
    startCommand: cd apps/bridge && npm start
    envVars:
      - key: DATABASE_URL
        sync: false  # Renseigné manuellement
      - key: JWT_SECRET
        sync: false
      - key: NODE_ENV
        value: production
```

#### Option B : **Fly.io**
- ✅ Edge deployment (rapide mondialement)
- ✅ Gratuit jusqu'à 3 VMs
- ✅ SSL automatique
- 🔗 https://fly.io

#### Option C : **Railway**
- ✅ Interface simple
- ✅ PostgreSQL inclus (optionnel)
- ✅ ~5$/mois
- 🔗 https://railway.app

**Actions** :
- [ ] Créer un compte sur l'hébergeur choisi
- [ ] Configurer les variables d'environnement (DATABASE_URL, JWT_SECRET)
- [ ] Tester le déploiement en staging

---

### 8. Configurer le Frontend (Vite Build)

**Hébergeur Frontend** : **Vercel** ou **Netlify** (Recommandé)

**Vercel** :
```bash
# Installer Vercel CLI
npm i -g vercel

# Déployer
cd apps/frontend
vercel --prod
```

**Configuration `vercel.json`** :
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "env": {
    "VITE_API_BASE_URL": "https://votre-backend.render.com",
    "VITE_WS_BASE_URL": "wss://votre-backend.render.com"
  }
}
```

**Actions** :
- [ ] Créer un compte Vercel/Netlify
- [ ] Connecter le repository GitHub
- [ ] Configurer les variables d'environnement
- [ ] Déployer le frontend

---

## 📋 Checklist Pré-Lancement

Avant de lancer en production, vérifier :

### Sécurité
- [ ] DATABASE_URL régénéré ✅
- [ ] JWT_SECRET régénéré ✅
- [ ] Aucun secret dans `.env` commité dans Git ✅
- [ ] Console.log crypto supprimés ✅
- [ ] CORS configuré strictement (pas de wildcard '*')
- [ ] Rate limiting activé
- [ ] Helmet middleware activé

### Infrastructure
- [ ] Base de données Neon upgradée
- [ ] Backend déployé sur Render/Fly.io
- [ ] Frontend déployé sur Vercel/Netlify
- [ ] Variables d'environnement configurées en production
- [ ] SSL/TLS activé partout

### Tests
- [ ] Tests E2E passés (signup, login, envoi message)
- [ ] Backup/Restore testé
- [ ] Burn After Reading testé
- [ ] Time-Lock testé (ou désactivé si non implémenté)

### Monitoring
- [ ] Logs de production configurés
- [ ] Alertes d'erreur configurées (ex: Sentry)
- [ ] Monitoring de performance

---

## 📞 Prochaines Étapes

1. **IMMÉDIAT** : Régénérer DATABASE_URL et JWT_SECRET (10 min)
2. **AUJOURD'HUI** : Choisir hébergeur et créer comptes (30 min)
3. **CETTE SEMAINE** : Déployer en staging et tester (2h)
4. **AVANT LANCEMENT** : Implémenter ou désactiver TODOs critiques (4h)

---

## 🎯 Résumé des Corrections Déjà Appliquées

✅ **Console.log crypto supprimés** (x3dh.ts, doubleRatchet.ts, sessionManager.ts)  
✅ **Debug div supprimé** (MessageList.tsx)  
✅ **Logger conditionnel créé** (debugLogger.ts)  
✅ **Fichiers .log supprimés**  
✅ **.gitignore amélioré** (.crush/, apps/*/output.log)  
✅ **Scripts obsolètes supprimés** (clear-database.cjs)  
✅ **Fichiers .blend placeholders supprimés**  
✅ **Prisma désinstallé** (80 packages, ~50 MB libérés)

---

**Contact** : Si besoin d'aide pour les déploiements, n'hésite pas !

**Fin du Document** ✅
