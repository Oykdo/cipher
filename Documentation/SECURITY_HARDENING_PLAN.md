# 🔒 Plan de durcissement de la sécurité

## Vue d'ensemble

Migration complète des données sensibles hors de localStorage vers des solutions sécurisées.

## Phase 1 : Migration du stockage des clés sensibles

### 1.1 IndexedDB chiffré pour masterKeys ✅ À implémenter

**Objectif** : Remplacer localStorage par IndexedDB avec chiffrement

**Fichiers à créer** :
- `apps/frontend/src/lib/secureStorage.ts` - Wrapper IndexedDB chiffré
- `apps/frontend/src/lib/keyVault.ts` - Gestionnaire de clés sécurisé

**Avantages** :
- Chiffrement des données au repos
- Isolation par origine
- Meilleure capacité de stockage
- API asynchrone (plus sécurisée)

### 1.2 Cookies HttpOnly pour tokens JWT ✅ À implémenter

**Objectif** : Migrer accessToken et refreshToken vers cookies HttpOnly

**Modifications backend** :
- `apps/bridge/src/routes/auth.ts` - Retourner tokens via cookies
- Configuration CORS pour credentials

**Modifications frontend** :
- `apps/frontend/src/store/auth.ts` - Supprimer stockage tokens
- `apps/frontend/src/services/api-interceptor.ts` - Utiliser cookies

**Avantages** :
- Protection contre XSS
- Tokens inaccessibles au JavaScript
- Gestion automatique par le navigateur

### 1.3 Nettoyage localStorage au démarrage ✅ À implémenter

**Objectif** : Supprimer toutes les données sensibles de localStorage

**Fichier** :
- `apps/frontend/src/lib/storageMigration.ts` - Migration automatique

## Phase 2 : Durcissement CSP

### 2.1 Retirer 'unsafe-inline' ✅ À implémenter

**Objectif** : Éliminer tous les styles inline

**Actions** :
- Externaliser tous les styles inline vers CSS
- Utiliser des classes CSS au lieu de `style={}`
- Configurer nonce pour scripts nécessaires

### 2.2 Configurer CSP via headers HTTP ✅ À implémenter

**Fichier backend** :
- `apps/bridge/src/middleware/security.ts` - Headers de sécurité

**Headers à configurer** :
```
Content-Security-Policy: 
  default-src 'self';
  script-src 'self';
  style-src 'self';
  img-src 'self' data: https:;
  font-src 'self';
  connect-src 'self' ws: wss:;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
```

## Phase 3 : Élimination des logs sensibles

### 3.1 Remplacer console.* par logger ✅ À implémenter

**Objectif** : Centraliser tous les logs et sanitizer les données sensibles

**Actions** :
- Rechercher tous les `console.log`, `console.error`, etc.
- Remplacer par `logger.debug`, `logger.error`, etc.
- Ajouter sanitization automatique

### 3.2 Ajouter ESLint rule no-console ✅ À implémenter

**Fichier** :
- `apps/frontend/.eslintrc.json` - Ajouter règle

**Configuration** :
```json
{
  "rules": {
    "no-console": ["error", { "allow": ["warn", "error"] }]
  }
}
```

## Ordre d'implémentation

1. ✅ Créer SecureStorage (IndexedDB chiffré)
2. ✅ Créer KeyVault (gestionnaire de clés)
3. ✅ Migrer masterKey vers KeyVault
4. ✅ Implémenter cookies HttpOnly (backend)
5. ✅ Migrer tokens vers cookies (frontend)
6. ✅ Créer migration automatique localStorage
7. ✅ Externaliser styles inline
8. ✅ Configurer CSP headers
9. ✅ Remplacer console.* par logger
10. ✅ Ajouter ESLint no-console

## Métriques de succès

- [ ] Aucune clé sensible dans localStorage
- [ ] Tous les tokens dans cookies HttpOnly
- [ ] CSP sans 'unsafe-inline'
- [ ] Aucun console.* dans le code
- [ ] ESLint passe sans erreurs

---

**Date de début** : 15 novembre 2025
**Priorité** : CRITIQUE
**Statut** : En cours
