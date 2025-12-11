# 🚀 Guide de déploiement - Sécurité durcie

## Commandes rapides

### 1. Migrer les logs (console.* → logger.*)

```bash
# Exécuter le script de migration
node scripts/migrate-console-to-logger.js

# Vérifier les changements
git diff

# Vérifier avec ESLint
npm run lint
```

### 2. Tester le stockage sécurisé

```bash
# Frontend
cd apps/frontend
npm run dev

# Dans la console navigateur :
# 1. Ouvrir DevTools → Application → IndexedDB
# 2. Vérifier que "CipherPulseSecure" existe
# 3. Vérifier que localStorage est vide de données sensibles
```

### 3. Activer les routes sécurisées (Backend)

```typescript
// apps/bridge/src/index.ts

// Ajouter l'import
import { authSecureRoutes } from './routes/authSecure.js';
import { securityHeaders, CORS_CONFIG } from './middleware/security.js';

// Configurer CORS avec credentials
await app.register(cors, CORS_CONFIG);

// Ajouter les headers de sécurité
app.addHook('onRequest', securityHeaders);

// Enregistrer les routes sécurisées
await app.register(authSecureRoutes);
```

### 4. Adapter le frontend

```typescript
// apps/frontend/src/main.tsx ou App.tsx

import { useAuthStore } from '@/store/authSecure';

// Initialiser au démarrage
const authStore = useAuthStore();

// Au login, initialiser avec le mot de passe utilisateur
await authStore.initialize(userPassword);
```

### 5. Configurer les requêtes API

```typescript
// apps/frontend/src/services/api-interceptor.ts

// Ajouter credentials: 'include' à toutes les requêtes
fetch(url, {
  ...options,
  credentials: 'include', // Important pour les cookies
});
```

## Vérifications de sécurité

### Checklist localStorage

```javascript
// Console navigateur
console.log('Keys in localStorage:', Object.keys(localStorage));
// Ne devrait PAS contenir : masterKey, accessToken, refreshToken, password, etc.
```

### Checklist cookies

```javascript
// DevTools → Application → Cookies
// Vérifier :
// - accessToken : HttpOnly ✓, Secure ✓, SameSite: Strict ✓
// - refreshToken : HttpOnly ✓, Secure ✓, SameSite: Strict ✓
```

### Checklist CSP

```bash
# Vérifier les headers
curl -I http://localhost:4000/api/v2/health

# Devrait contenir :
# Content-Security-Policy: default-src 'self'; script-src 'self'; ...
# (sans 'unsafe-inline')
```

### Checklist logs

```bash
# Rechercher console.* restants
grep -r "console\.log\|console\.info\|console\.debug" apps/frontend/src apps/bridge/src

# Devrait retourner 0 résultats (sauf console.warn et console.error)
```

## Tests fonctionnels

### Test 1 : Signup avec stockage sécurisé

```typescript
// 1. Créer un compte
const response = await fetch('/api/v2/auth/signup-secure', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'testuser',
    method: 'standard',
    mnemonicLength: 12,
  }),
});

// 2. Vérifier que les tokens sont dans les cookies
// DevTools → Application → Cookies → accessToken, refreshToken

// 3. Vérifier que masterKey est dans IndexedDB
// DevTools → Application → IndexedDB → CipherPulseSecure
```

### Test 2 : Login avec cookies

```typescript
// 1. Se connecter
const response = await fetch('/api/v2/auth/login-secure', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'testuser',
    masterKeyHash: hash,
  }),
});

// 2. Vérifier que les cookies sont définis
// 3. Faire une requête authentifiée
const data = await fetch('/api/v2/conversations', {
  credentials: 'include', // Les cookies sont envoyés automatiquement
});
```

### Test 3 : Refresh token automatique

```typescript
// 1. Attendre 15 minutes (expiration accessToken)
// 2. Faire une requête
const response = await fetch('/api/v2/conversations', {
  credentials: 'include',
});

// 3. Vérifier que le refresh est automatique
// DevTools → Network → Headers → Set-Cookie (nouveau accessToken)
```

### Test 4 : Logout

```typescript
// 1. Se déconnecter
await fetch('/api/v2/auth/logout-secure', {
  method: 'POST',
  credentials: 'include',
});

// 2. Vérifier que les cookies sont supprimés
// DevTools → Application → Cookies (vide)

// 3. Vérifier que IndexedDB est vidé
// DevTools → Application → IndexedDB (vide)
```

## Configuration production

### Variables d'environnement

```bash
# Backend (.env)
NODE_ENV=production
FRONTEND_URL=https://app.cipherpulse.com
JWT_SECRET=<secret-fort-aleatoire>
COOKIE_DOMAIN=.cipherpulse.com
```

### HTTPS obligatoire

```nginx
# nginx.conf
server {
    listen 443 ssl http2;
    server_name api.cipherpulse.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Headers de sécurité (redondants avec Fastify, mais recommandés)
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;

    location / {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### CORS production

```typescript
// apps/bridge/src/middleware/security.ts
export const CORS_CONFIG = {
  origin: [
    'https://app.cipherpulse.com',
    'https://www.cipherpulse.com',
  ],
  credentials: true,
  // ...
};
```

## Monitoring et alertes

### Logs à surveiller

```typescript
// Alertes critiques
logger.error('SECURITY_ALERT: Sensitive data in localStorage');
logger.error('SECURITY_ALERT: XSS attempt detected');
logger.error('SECURITY_ALERT: CSRF token mismatch');

// Métriques à suivre
- Nombre de tentatives de login échouées
- Nombre de refresh token révoqués
- Nombre d'audits localStorage avec données sensibles
- Nombre de violations CSP
```

### Dashboard de sécurité

```typescript
// Endpoint de monitoring
app.get('/api/v2/security/metrics', async (request, reply) => {
  return {
    localStorage: {
      audits: auditCount,
      violations: violationCount,
    },
    cookies: {
      active: activeCookieCount,
      expired: expiredCookieCount,
    },
    csp: {
      violations: cspViolationCount,
    },
    logs: {
      sanitized: sanitizedLogCount,
    },
  };
});
```

## Rollback en cas de problème

### Revenir à l'ancien système

```bash
# 1. Désactiver les nouvelles routes
# Commenter dans apps/bridge/src/index.ts :
# await app.register(authSecureRoutes);

# 2. Revenir à l'ancien store
# apps/frontend/src/store/auth.ts (ancien fichier)

# 3. Redéployer
npm run build
npm run deploy
```

### Migration progressive

```typescript
// Supporter les deux systèmes en parallèle
app.register(authRoutes); // Ancien
app.register(authSecureRoutes); // Nouveau

// Les clients peuvent migrer progressivement
```

## Support et dépannage

### Problème : Cookies non définis

**Cause** : CORS mal configuré ou credentials manquant

**Solution** :
```typescript
// Backend
CORS_CONFIG.credentials = true;

// Frontend
fetch(url, { credentials: 'include' });
```

### Problème : IndexedDB vide

**Cause** : KeyVault non initialisé

**Solution** :
```typescript
const authStore = useAuthStore();
await authStore.initialize(userPassword);
```

### Problème : ESLint erreurs console.*

**Cause** : console.log/info/debug non migrés

**Solution** :
```bash
node scripts/migrate-console-to-logger.js
```

### Problème : CSP bloque les ressources

**Cause** : CSP trop strict

**Solution** :
```typescript
// Ajouter les domaines nécessaires
'img-src': "'self' data: https://cdn.example.com",
```

## Ressources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [MDN Web Security](https://developer.mozilla.org/en-US/docs/Web/Security)
- [Content Security Policy](https://content-security-policy.com/)
- [HttpOnly Cookies](https://owasp.org/www-community/HttpOnly)

---

**Support** : security@cipherpulse.com
**Documentation** : https://docs.cipherpulse.com/security
**Dernière mise à jour** : 15 novembre 2025
