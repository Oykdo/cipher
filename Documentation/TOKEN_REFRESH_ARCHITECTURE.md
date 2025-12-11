## 🔄 Architecture de Rafraîchissement Automatique des Tokens

**Date:** 2025-01-13  
**Statut:** ✅ IMPLÉMENTÉ

---

## 📋 Problème Identifié

### Symptômes
```
GET http://localhost:4000/api/v2/conversations 401 (Unauthorized)
Error: Authorization token expired

WebSocket connection failed: Authentication failed
```

### Analyse des Patterns

1. **Pattern d'Expiration de Token**
   - Le client possède un token mais il est expiré
   - Aucun mécanisme de rafraîchissement automatique
   - L'utilisateur est brutalement déconnecté

2. **Pattern d'Effet en Cascade**
   - Échec API → Échec WebSocket
   - Les deux dépendent du même token
   - Nécessite une solution centralisée

3. **Pattern de Manque de Résilience**
   - Pas de stratégie de retry
   - Pas de refresh automatique
   - Expérience utilisateur dégradée

---

## 🎯 Solution Architecturale

### Vue d'Ensemble

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT APPLICATION                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐         ┌──────────────┐                  │
│  │  API Call    │────────▶│ Interceptor  │                  │
│  └──────────────┘         └──────┬───────┘                  │
│                                   │                           │
│                                   ▼                           │
│                          ┌────────────────┐                  │
│                          │  401 Detected? │                  │
│                          └────────┬───────┘                  │
│                                   │                           │
│                          ┌────────▼────────┐                 │
│                          │ Refresh Token   │                 │
│                          │   (Once Only)   │                 │
│                          └────────┬────────┘                 │
│                                   │                           │
│                    ┌──────────────┴──────────────┐           │
│                    │                              │           │
│              ┌─────▼─────┐                 ┌─────▼─────┐    │
│              │  Success  │                 │   Failed  │    │
│              └─────┬─────┘                 └─────┬─────┘    │
│                    │                              │           │
│              ┌─────▼─────┐                 ┌─────▼─────┐    │
│              │ Retry API │                 │  Logout   │    │
│              │   Call    │                 │  Redirect │    │
│              └───────────┘                 └───────────┘    │
│                                                               │
│  ┌──────────────┐         ┌──────────────┐                  │
│  │  WebSocket   │────────▶│ Auto-Reconnect│                 │
│  │              │◀────────│  on Token     │                 │
│  │              │         │   Change      │                 │
│  └──────────────┘         └──────────────┘                  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 Composants Implémentés

### 1. API Interceptor (`api-interceptor.ts`)

**Responsabilités:**
- ✅ Intercepte toutes les réponses 401
- ✅ Gère le rafraîchissement du token
- ✅ Rejoue automatiquement la requête échouée
- ✅ Gère la concurrence (une seule requête de refresh)
- ✅ Déconnecte si le refresh échoue

**Fonctions Principales:**

```typescript
// Fetch avec auto-refresh
fetchWithRefresh(url, options)

// Wrapper pour API v2
fetchV2WithRefresh<T>(path, options)

// Wrapper authentifié
authFetchV2WithRefresh<T>(path, options)

// Utilitaires
isTokenExpired(token)
getTokenTimeRemaining(token)
proactiveTokenRefresh(token)
```

**Gestion de la Concurrence:**

```typescript
// Si plusieurs requêtes échouent simultanément:
// 1. La première déclenche le refresh
// 2. Les autres attendent dans une queue
// 3. Toutes reçoivent le nouveau token ensemble
// 4. Toutes rejouent leur requête

const pendingRequests: Array<{
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}> = [];
```

### 2. WebSocket avec Auto-Reconnect (`useSocketWithRefresh.ts`)

**Responsabilités:**
- ✅ Écoute les changements de token dans le store
- ✅ Reconnecte automatiquement avec le nouveau token
- ✅ Gère les erreurs d'authentification
- ✅ Cleanup automatique

**Utilisation:**

```typescript
function MyComponent() {
  const { socket, connected, error, reconnect } = useSocketWithRefresh();
  
  // Le socket se reconnecte automatiquement quand le token change
  
  useSocketEvent(socket, 'message', (data) => {
    console.log('New message:', data);
  });
  
  return <div>Connected: {connected ? 'Yes' : 'No'}</div>;
}
```

**Reconnexion Automatique:**

```typescript
// Effect qui écoute les changements de token
useEffect(() => {
  if (!token) {
    disconnect();
    return;
  }
  
  // Reconnect avec le nouveau token
  connect();
  
  return () => disconnect();
}, [token]); // ← Reconnect when token changes
```

---

## 📊 Flux de Rafraîchissement

### Scénario 1: Requête API avec Token Expiré

```
1. User Action
   └─▶ API Call (GET /conversations)
       └─▶ Response: 401 Unauthorized
           └─▶ Interceptor détecte 401
               └─▶ Vérifie si refresh en cours
                   ├─▶ OUI: Ajoute à la queue
                   └─▶ NON: Démarre refresh
                       └─▶ POST /auth/refresh
                           ├─▶ SUCCESS
                           │   ├─▶ Update store
                           │   ├─▶ Notify queue
                           │   └─▶ Retry original request
                           │       └─▶ Response: 200 OK ✅
                           │
                           └─▶ FAILED
                               ├─▶ Clear session
                               ├─▶ Redirect to /login
                               └─▶ Notify queue with error
```

### Scénario 2: WebSocket avec Token Expiré

```
1. Token Expires
   └─▶ Server disconnects WebSocket
       └─▶ Client détecte disconnect
           └─▶ Interceptor refresh le token (via API call)
               └─▶ Store updated with new token
                   └─▶ useEffect détecte changement
                       └─▶ Reconnect avec nouveau token
                           └─▶ WebSocket connected ✅
```

### Scénario 3: Requêtes Concurrentes

```
Time: 0ms
├─▶ Request A (GET /conversations) → 401
├─▶ Request B (GET /messages) → 401
└─▶ Request C (POST /message) → 401

Time: 10ms
└─▶ Request A déclenche refresh
    ├─▶ isRefreshing = true
    ├─▶ Request B → ajouté à queue
    └─▶ Request C → ajouté à queue

Time: 200ms
└─▶ Refresh SUCCESS
    ├─▶ isRefreshing = false
    ├─▶ Notify A, B, C avec nouveau token
    ├─▶ Retry A → 200 OK ✅
    ├─▶ Retry B → 200 OK ✅
    └─▶ Retry C → 200 OK ✅
```

---

## 🔐 Sécurité

### Stockage des Tokens

```typescript
// ✅ BON: Store Zustand (mémoire)
const session = {
  accessToken: 'eyJ...',
  refreshToken: 'eyJ...',
};

// ❌ MAUVAIS: localStorage (XSS vulnerable)
localStorage.setItem('token', 'eyJ...');
```

### Refresh Token

```typescript
// ✅ Le refresh token est envoyé dans le body
POST /auth/refresh
{
  "refreshToken": "eyJ..."
}

// ✅ Le serveur valide et révoque l'ancien
// ✅ Retourne un nouveau access token ET refresh token
```

### Expiration Proactive

```typescript
// Rafraîchir AVANT expiration (5 min avant)
proactiveTokenRefresh(token, 5 * 60 * 1000);

// Peut être appelé périodiquement
setInterval(() => {
  const { session } = useAuthStore.getState();
  if (session?.accessToken) {
    proactiveTokenRefresh(session.accessToken);
  }
}, 60 * 1000); // Check every minute
```

---

## 📝 Migration Guide

### Avant (Code Existant)

```typescript
// ❌ Pas de gestion d'expiration
const conversations = await authFetchV2('/conversations', token);
```

### Après (Avec Auto-Refresh)

```typescript
// ✅ Auto-refresh si token expiré
import { authFetchV2WithRefresh } from '@/services/api-interceptor';

const conversations = await authFetchV2WithRefresh('/conversations');
// Plus besoin de passer le token, il est récupéré du store
```

### WebSocket - Avant

```typescript
// ❌ Pas de reconnexion automatique
const { socket } = useSocket({ token });
```

### WebSocket - Après

```typescript
// ✅ Reconnexion automatique sur token refresh
import { useSocketWithRefresh } from '@/hooks/useSocketWithRefresh';

const { socket, connected, reconnect } = useSocketWithRefresh();
// Reconnecte automatiquement quand le token change
```

---

## 🧪 Tests Recommandés

### Test 1: Token Expiré

```typescript
// 1. Connecter l'utilisateur
// 2. Attendre expiration du token (ou forcer expiration)
// 3. Faire un appel API
// 4. Vérifier que le token est rafraîchi automatiquement
// 5. Vérifier que l'appel réussit
```

### Test 2: Refresh Token Expiré

```typescript
// 1. Connecter l'utilisateur
// 2. Invalider le refresh token côté serveur
// 3. Faire un appel API avec token expiré
// 4. Vérifier que l'utilisateur est déconnecté
// 5. Vérifier la redirection vers /login
```

### Test 3: Requêtes Concurrentes

```typescript
// 1. Connecter l'utilisateur avec token expiré
// 2. Lancer 10 requêtes API simultanément
// 3. Vérifier qu'une seule requête de refresh est envoyée
// 4. Vérifier que toutes les requêtes réussissent
```

### Test 4: WebSocket Reconnect

```typescript
// 1. Connecter l'utilisateur
// 2. Établir connexion WebSocket
// 3. Rafraîchir le token (simuler expiration)
// 4. Vérifier que le WebSocket se reconnecte automatiquement
// 5. Vérifier que les événements sont toujours reçus
```

---

## 🚀 Prochaines Étapes

### Implémentation Immédiate

1. ✅ Créer `api-interceptor.ts`
2. ✅ Créer `useSocketWithRefresh.ts`
3. ⏳ Migrer tous les appels API vers `fetchV2WithRefresh`
4. ⏳ Migrer tous les `useSocket` vers `useSocketWithRefresh`
5. ⏳ Tester en conditions réelles

### Améliorations Futures

1. **Refresh Proactif**
   - Rafraîchir automatiquement 5 min avant expiration
   - Éviter les interruptions

2. **Retry avec Backoff**
   - Retry exponentiel en cas d'échec réseau
   - Distinguer erreurs temporaires vs permanentes

3. **Monitoring**
   - Logger les refresh réussis/échoués
   - Alerter si taux d'échec élevé

4. **Offline Support**
   - Détecter perte de connexion
   - Queue les requêtes pour replay

---

## 📚 Références

- [OWASP JWT Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)
- [RFC 6749 - OAuth 2.0](https://tools.ietf.org/html/rfc6749)
- [Socket.IO Authentication](https://socket.io/docs/v4/middlewares/#sending-credentials)

---

**Auteur:** Kiro AI Assistant  
**Révision:** v1.0
