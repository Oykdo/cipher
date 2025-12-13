# Déploiement sur Render (tutoriel)

Ce projet est un monorepo avec :

* **Backend** (API + WebSocket) : `apps/bridge` (Fastify, Socket.IO) → **Render Web Service**
* **Frontend** (Vite) : `apps/frontend` → **Render Static Site**
* **Base de données** : PostgreSQL → **Render PostgreSQL**

> Objectif : avoir une URL frontend (ex: `https://dead-drop-frontend.onrender.com`) qui parle à une URL backend (ex: `https://dead-drop-bridge.onrender.com`).

---

## 1) Créer la base PostgreSQL sur Render

1. Render → **New** → **PostgreSQL**.
2. Une fois créée, récupère la variable **Internal Database URL** (ou **External Database URL** si besoin).

On l’utilisera comme `DATABASE_URL` côté backend.

---

## 2) Déployer le backend (`apps/bridge`) en Web Service

Render → **New** → **Web Service** → connecte le repo.

### Réglages recommandés

* **Root Directory** : `apps/bridge`
* **Build Command** :
  ```bash
  npm ci && npm run build
  ```
* **Start Command** :
  ```bash
  npm start
  ```
  (cela lance `node dist/index.js`)
* **Health Check Path** : `GET /health`

### Persistent Disk (fortement recommandé)

Les pièces jointes (attachments) sont stockées sur disque dans `BRIDGE_DATA_DIR/uploads`.
Sur Render, le filesystem **sans disque persistant** peut être perdu lors d’un redeploy/restart.

1. Ajoute un **Persistent Disk** au Web Service.
2. Choisis un **Mount Path** (ex : `/var/data`).
3. Mets `BRIDGE_DATA_DIR=/var/data` (voir plus bas).

---

## 3) Variables d’environnement backend (Render)

Le backend lit ses variables via `process.env` (voir `apps/bridge/src/config.ts`).

### A. Section **Environment Variables** (valeurs non sensibles)

À mettre dans Render → Web Service → **Environment** → **Environment Variables** :

| Nom | Exemple | Pourquoi |
|---|---|---|
| `NODE_ENV` | `production` | active les checks de sécurité (CORS/Origin, etc.) |
| `ALLOWED_ORIGINS` | `https://dead-drop-frontend.onrender.com` | CORS + validation Origin/Referer (CSRF protection pour les requêtes JWT) |
| `FRONTEND_URL` | `https://dead-drop-frontend.onrender.com` | CORS WebSocket (Socket.IO) |
| `BRIDGE_DATA_DIR` | `/var/data` | stocke uploads/backups sur le disque persistant |
| `MAX_ACTIVE_UPLOADS_PER_USER` | `3` | limite anti-abus upload |
| `BLOCKCHAIN_NETWORK` | `simulated-chimera` | optionnel |

Notes :
* `ALLOWED_ORIGINS` accepte **une liste séparée par des virgules** (sans espaces), ex :
  `https://site1.onrender.com,https://site2.onrender.com`
* `PORT` : ne mets rien (Render injecte `PORT` automatiquement). Le code fait `PORT || 4000`.

### B. Section **Secrets** (valeurs sensibles)

À mettre dans Render → Web Service → **Environment** → **Secrets** (ou “Environment Variables” mais *mark as secret*, selon ton UI Render) :

| Nom | Exemple | Pourquoi |
|---|---|---|
| `DATABASE_URL` | (URL fournie par Render PostgreSQL) | connexion DB |
| `JWT_SECRET` | une chaîne aléatoire **≥ 64 caractères** | requis en production (sinon le serveur refuse de démarrer) |
| `STRIPE_SECRET_KEY` | `sk_live_...` | uniquement si tu actives les paiements |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | uniquement si tu ajoutes un webhook Stripe |

#### Générer `JWT_SECRET`

Le code refuse les secrets trop courts/peu entropiques et bloque des motifs faibles (ex : contient `password`, `secret`, etc.).

Exemple (local) :
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

> Copie-colle le résultat dans le Secret `JWT_SECRET` sur Render.

### Option : utiliser les **Secret Files** (si tu préfères)

`apps/bridge/src/config.ts` supporte la convention `*_FILE`.

Exemple :
* Render → **Secret Files** : crée un fichier `jwt_secret`.
* Dans **Environment Variables** :
  * `JWT_SECRET_FILE=/etc/secrets/jwt_secret`

Même principe possible pour `BRIDGE_DB_KEY_FILE` si tu ajoutes un jour une clé dédiée.

---

## 4) Initialiser le schéma PostgreSQL

Le backend suppose que les tables existent. Sur une DB Render neuve, initialise le schéma.

### Méthode simple (DB vide uniquement)

Le fichier ci-dessous **drop + recreate** les tables :

* `apps/bridge/scripts/schema_postgresql.sql`

Sur Render (dans le “Shell” du service bridge) ou en local :
```bash
psql "$DATABASE_URL" -f apps/bridge/scripts/schema_postgresql.sql
```

> ⚠️ À n’utiliser que si la base est vide / tu acceptes de perdre les données.

### Appliquer les migrations SQL (optionnel mais recommandé)

Après build, tu peux lancer :
```bash
node dist/db/run_migrations.js
```

---

## 5) Déployer le frontend (`apps/frontend`) en Static Site

Render → **New** → **Static Site**.

### Réglages

* **Root Directory** : `apps/frontend`
* **Build Command** :
  ```bash
  npm ci && npm run build
  ```
* **Publish Directory** : `dist`

---

## 6) Variables d’environnement frontend (Render)

Dans Render → Static Site → **Environment Variables** :

| Nom | Exemple | Pourquoi |
|---|---|---|
| `VITE_API_BASE_URL` | `https://dead-drop-bridge.onrender.com` | base URL API |
| `VITE_WS_BASE_URL` | `wss://dead-drop-bridge.onrender.com` | WebSocket (Socket.IO) |
| `VITE_ENABLE_CONTRIBUTIONS` | `true` ou `false` | active/désactive l’UI contributions |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` | clé publique Stripe (si contributions activées) |

Notes :
* Mets bien **https/wss** en prod.
* Si tu ne veux pas Stripe tout de suite : `VITE_ENABLE_CONTRIBUTIONS=false` et tu peux laisser la clé Stripe vide.

---

## 7) Checklist de validation

1. Backend : ouvre `https://<bridge>.onrender.com/health` → doit répondre `{"status":"ok", ...}`.
2. Frontend : charge `https://<frontend>.onrender.com`.
3. Test login/signup depuis le frontend :
   * si tu as un **403 CSRF_ORIGIN_INVALID** → `ALLOWED_ORIGINS` ne matche pas exactement l’URL du frontend.
4. Test WebSocket :
   * si la connexion Socket.IO échoue en prod → vérifie `FRONTEND_URL` côté bridge.
5. Test pièces jointes :
   * si les uploads disparaissent après redeploy → configure le **Persistent Disk** + `BRIDGE_DATA_DIR`.
