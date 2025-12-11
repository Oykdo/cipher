# Dead Drop - Audit Final et Guide de Deploiement

## 1. AUDIT DE L'APPLICATION

### Architecture
```
project_chimera_repo/
├── apps/
│   ├── bridge/          # Backend API (Fastify + PostgreSQL)
│   └── frontend/        # Frontend React (Vite + Tailwind)
├── main.js              # Electron main process
├── preload.cjs          # Electron preload script
└── package.json         # Configuration Electron Builder
```

### Stack Technique
| Composant | Technologie | Version |
|-----------|-------------|---------|
| Frontend | React + Vite | 19.0.0 / 6.0.5 |
| Backend | Fastify | 5.1.0 |
| Base de donnees | PostgreSQL (Neon) | - |
| Desktop | Electron | 30.5.1 |
| Temps reel | Socket.io | 4.8.1 |
| Crypto | TweetNaCl, libsodium | - |
| Auth | JWT + SRP | - |

### Fonctionnalites Principales
- [x] Inscription Standard (BIP-39 mnemonic 12/24 mots)
- [x] Inscription DiceKey (775 bits d'entropie)
- [x] Connexion SRP (Secure Remote Password)
- [x] Chiffrement E2E (Signal Protocol)
- [x] Messages temps reel (WebSocket)
- [x] Demandes de conversation
- [x] Parametres utilisateur
- [x] Export cles de recuperation
- [x] Support multilingue (EN, FR, DE, ES, IT, ZH-CN)

### Problemes Connus
1. **TypeScript** - Erreur de type mineure dans `UserRepository.ts` (n'affecte pas le runtime)
2. **Build Vite** - Warning WASM argon2-browser (fonctionne en dev, necessite plugin pour prod)
3. **Fichier ContributionSettings.tsx** - Cle dupliquee "color" (warning)

---

## 2. PREREQUIS DEPLOIEMENT

### Serveur Production
- Node.js 22.x LTS
- PostgreSQL 15+ (ou Neon/Supabase)
- RAM: 2GB minimum
- Stockage: 20GB minimum

### Variables d'Environnement Requises

```bash
# apps/bridge/.env
JWT_SECRET=<64+ caracteres aleatoires>
DATABASE_URL=postgresql://user:password@host:5432/dbname?sslmode=require
PORT=4000
NODE_ENV=production
ALLOWED_ORIGINS=https://votre-domaine.com
MAX_ACTIVE_UPLOADS_PER_USER=3
BLOCKCHAIN_NETWORK=simulated-chimera
```

### Generation JWT_SECRET
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('base64url'))"
```

---

## 3. DEPLOIEMENT BACKEND (API)

### Option A: VPS/Serveur Dedie

```bash
# 1. Cloner le repo
git clone https://github.com/Oykdo/Project_Chimera.git
cd Project_Chimera

# 2. Installer les dependances
npm install
cd apps/bridge && npm install && cd ../..
cd apps/frontend && npm install && cd ../..

# 3. Configurer l'environnement
cp apps/bridge/.env.example apps/bridge/.env
# Editer .env avec vos valeurs

# 4. Build
npm run build:bridge

# 5. Demarrer avec PM2
pm2 start apps/bridge/dist/index.js --name "dead-drop-api"
pm2 save
pm2 startup
```

### Option B: Docker

```dockerfile
# Dockerfile.bridge
FROM node:22-alpine

WORKDIR /app
COPY apps/bridge/package*.json ./
RUN npm ci --only=production

COPY apps/bridge/dist ./dist
COPY apps/bridge/.env ./.env

EXPOSE 4000
CMD ["node", "dist/index.js"]
```

```bash
docker build -f Dockerfile.bridge -t dead-drop-api .
docker run -d -p 4000:4000 --env-file apps/bridge/.env dead-drop-api
```

### Option C: Services Cloud

**Railway/Render/Fly.io:**
1. Connecter le repo GitHub
2. Configurer le root directory: `apps/bridge`
3. Build command: `npm run build`
4. Start command: `npm start`
5. Ajouter les variables d'environnement

---

## 4. DEPLOIEMENT FRONTEND (Web)

### Build Production

```bash
cd apps/frontend

# Creer .env.production
echo "VITE_API_URL=https://api.votre-domaine.com" > .env.production

# Build
npm run build
```

### Hebergement Statique

**Vercel:**
```bash
vercel --prod
```

**Netlify:**
- Build command: `npm run build`
- Publish directory: `apps/frontend/dist`

**Nginx:**
```nginx
server {
    listen 80;
    server_name votre-domaine.com;
    root /var/www/dead-drop/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /ws {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
```

---

## 5. BUILD APPLICATION DESKTOP (Electron)

### Windows
```bash
npm run build:win
# Output: release/Dead Drop-Setup-1.0.0.exe
```

### macOS
```bash
npm run build:mac
# Output: release/Dead Drop-1.0.0-arm64.dmg
```

### Linux
```bash
npm run build:linux
# Output: release/Dead Drop-1.0.0-amd64.AppImage
```

### Signature de Code (Recommande)

**Windows:**
```bash
# Installer certificat de signature
export WIN_CSC_LINK=/path/to/certificate.pfx
export WIN_CSC_KEY_PASSWORD=your-password
npm run build:win
```

**macOS:**
```bash
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=your-password
export APPLE_ID=your@email.com
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
npm run build:mac
```

---

## 6. BASE DE DONNEES

### Schema PostgreSQL
Le schema est cree automatiquement au demarrage. Tables principales:
- `users` - Comptes utilisateurs
- `conversations` - Conversations
- `messages` - Messages chiffres
- `conversation_members` - Membres des conversations
- `conversation_requests` - Demandes de conversation
- `key_bundles` - Cles E2E publiques
- `settings` - Parametres utilisateurs
- `attachments` - Pieces jointes
- `refresh_tokens` - Tokens de rafraichissement

### Backup
```bash
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
```

---

## 7. SECURITE PRODUCTION

### Checklist
- [ ] JWT_SECRET unique et complexe (64+ caracteres)
- [ ] HTTPS obligatoire (Let's Encrypt)
- [ ] CORS restreint aux domaines de production
- [ ] Rate limiting active
- [ ] Headers de securite (CSP, HSTS, X-Frame-Options)
- [ ] Base de donnees avec SSL
- [ ] Logs centralises
- [ ] Monitoring (Sentry, LogRocket)
- [ ] Backups automatises

### Headers Nginx SSL
```nginx
ssl_certificate /etc/letsencrypt/live/domain/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/domain/privkey.pem;
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
ssl_prefer_server_ciphers off;
add_header Strict-Transport-Security "max-age=63072000" always;
```

---

## 8. COMMANDES UTILES

```bash
# Developpement
npm run dev                    # Lance tout (bridge + frontend + electron)
npm run dev:bridge             # Backend seul
npm run dev:frontend           # Frontend seul

# Build
npm run build:all              # Build bridge + frontend
npm run build                  # Build tout + package Electron
npm run build:win              # Package Windows
npm run build:mac              # Package macOS
npm run build:linux            # Package Linux

# Tests
cd apps/bridge && npm test     # Tests backend
cd apps/frontend && npm test   # Tests frontend

# Base de donnees
cd apps/bridge && npm run db:clear  # Vider la DB (dev only!)
```

---

## 9. MONITORING ET LOGS

### PM2
```bash
pm2 logs dead-drop-api
pm2 monit
```

### Docker
```bash
docker logs -f dead-drop-api
```

### Application Logs
Les logs sont ecrits sur stdout/stderr et peuvent etre rediriges:
```bash
node dist/index.js 2>&1 | tee -a /var/log/dead-drop/api.log
```

---

## 10. MISE A JOUR

```bash
# 1. Pull des changements
git pull origin main

# 2. Installer dependances
npm install
cd apps/bridge && npm install && cd ../..
cd apps/frontend && npm install && cd ../..

# 3. Rebuild
npm run build:all

# 4. Redemarrer le service
pm2 restart dead-drop-api

# Pour Electron: rebuild et distribuer le nouveau package
npm run build:win  # ou build:mac, build:linux
```

---

## CONTACT ET SUPPORT

- GitHub Issues: https://github.com/Oykdo/Project_Chimera/issues
- Documentation: Voir les fichiers dans `/Documentation`

---

*Guide genere le 2025-12-08*
