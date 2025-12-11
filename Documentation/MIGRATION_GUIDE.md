# 🔄 Guide de Migration - Token Refresh Automatique

## 📋 Vue d'Ensemble

Ce guide explique comment migrer l'application pour utiliser le nouveau système de rafraîchissement automatique des tokens.

---

## 🎯 Objectifs

- ✅ Éliminer les erreurs "Authorization token expired"
- ✅ Améliorer l'expérience utilisateur (pas de déconnexion brutale)
- ✅ Gérer automatiquement l'expiration des tokens
- ✅ Reconnexion automatique du WebSocket

---

## 📦 Nouveaux Fichiers Créés

1. **`apps/frontend/src/services/api-interceptor.ts`**
   - Intercepteur avec auto-refresh
   - Gestion de la concurrence
   - Utilitaires de validation de token

2. **`apps/frontend/src/hooks/useSocketWithRefresh.ts`**
   - Hook WebSocket avec auto-reconnect
   - Écoute les changements de token
   - Reconnexion automatique

3. **`apps/frontend/src/lib/sanitize.ts`**
   - Utilitaires de sanitization (bonus sécurité)

---

## 🔧 Étapes de Migration

### Étape 1: Migrer les Appels API

**Fichiers à modifier:**
- `apps/frontend/src/screens/Conversations.tsx`
- `apps/frontend/src/screens/Chat.tsx`
- `apps/frontend/src/screens/Settings.tsx`

**Changements:**

```typescript
// AVANT
import { apiv2 } from '@/services/api-v2';

const conversations = await apiv2.listConversations(session.accessToken);

// APRÈS
import { authFetchV2WithRefresh } from '@/services/api-interceptor';

const data = await authFetchV2WithRefresh<{ conversations: any[] }>('/conversations');
const conversations = data.conversations;
```

### Étape 2: Migrer le WebSocket

**Fichiers à modifier:**
- Tout composant utilisant `useSocket`

**Changements:**

```typescript
// AVANT
import { useSocket } from '@/hooks/useSocket';

const { socket, connected } = useSocket({ 
  token: session?.accessToken || '' 
});

// APRÈS
import { useSocketWithRefresh } from '@/hooks/useSocketWithRefresh';

const { socket, connected, reconnect } = useSocketWithRefresh();
```

### Étape 3: Ajouter le Refresh Proactif (Optionnel)

**Fichier:** `apps/frontend/src/App.tsx` ou composant racine

```typescript
import { proactiveTokenRefresh } from '@/services/api-interceptor';
import { useAuthStore } from '@/store/auth';

function App() {
  const session = useAuthStore((state) => state.session);
  
  useEffect(() => {
    if (!session?.accessToken) return;
    
    // Rafraîchir le token 5 min avant expiration
    const interval = setInterval(() => {
      proactiveTokenRefresh(session.accessToken, 5 * 60 * 1000);
    }, 60 * 1000); // Check every minute
    
    return () => clearInterval(interval);
  }, [session?.accessToken]);
  
  return <YourApp />;
}
```

---

## 🧪 Tests à Effectuer

### Test 1: Token Expiré - API

1. Se connecter à l'application
2. Attendre que le token expire (ou modifier manuellement l'expiration)
3. Faire une action qui appelle l'API (ex: charger les conversations)
4. **Résultat attendu:** La requête réussit après refresh automatique

### Test 2: Token Expiré - WebSocket

1. Se connecter à l'application
2. Établir la connexion WebSocket
3. Attendre que le token expire
4. **Résultat attendu:** Le WebSocket se reconnecte automatiquement

### Test 3: Refresh Token Expiré

1. Se connecter à l'application
2. Invalider le refresh token côté serveur
3. Faire une action qui appelle l'API
4. **Résultat attendu:** L'utilisateur est déconnecté et redirigé vers /login

### Test 4: Requêtes Concurrentes

1. Se connecter avec un token expiré
2. Ouvrir la console réseau
3. Charger plusieurs ressources simultanément
4. **Résultat attendu:** Une seule requête `/auth/refresh` est envoyée

---

## 📊 Checklist de Migration

### Backend (Déjà Implémenté ✅)

- [x] Endpoint `/api/v2/auth/refresh` existe
- [x] Refresh tokens stockés en base de données
- [x] Validation et révocation des tokens
- [x] Retourne nouveau access token ET refresh token

### Frontend (✅ TERMINÉ)

- [x] Remplacer `authFetchV2` par `authFetchV2WithRefresh` dans:
  - [x] `Conversations.tsx`
  - [x] `Login.tsx`
  - [x] `Settings.tsx`
  - [x] Tous les composants utilisant l'API

- [x] Remplacer `useSocket` par `useSocketWithRefresh` dans:
  - [x] `Conversations.tsx` (composant de chat principal)

- [x] Ajouter refresh proactif dans `App.tsx`

- [ ] Tester tous les scénarios (voir MIGRATION_COMPLETED.md)

---

## 🚨 Points d'Attention

### 1. Store Zustand

Le système utilise `useAuthStore` pour:
- Lire le token actuel
- Mettre à jour le token après refresh
- Déconnecter l'utilisateur si refresh échoue

**Assurez-vous que le store expose:**
```typescript
interface AuthStore {
  session: { accessToken: string; refreshToken: string } | null;
  setSession: (session: Session) => void;
  clearSession: () => void;
}
```

### 2. Redirection

En cas d'échec du refresh, l'utilisateur est redirigé vers `/login`:

```typescript
window.location.href = '/login';
```

Adaptez si votre route de login est différente.

### 3. API Base URL

Le système utilise `API_BASE_URL` depuis `config.ts`:

```typescript
import { API_BASE_URL } from '../config';
```

Vérifiez que cette constante est correctement définie.

---

## 🎓 Concepts Clés

### Token Lifecycle

```
Access Token (15 min)
├─▶ Utilisé pour toutes les requêtes API
├─▶ Expire rapidement pour sécurité
└─▶ Rafraîchi automatiquement

Refresh Token (7 jours)
├─▶ Utilisé uniquement pour rafraîchir l'access token
├─▶ Expire lentement
├─▶ Révoqué lors du logout
└─▶ Stocké de manière sécurisée
```

### Gestion de la Concurrence

```
Request A ──┐
Request B ──┼──▶ 401 Detected ──▶ Refresh (Once) ──▶ Retry All
Request C ──┘
```

Une seule requête de refresh, même si plusieurs requêtes échouent simultanément.

---

## 📚 Ressources

- **Architecture:** `TOKEN_REFRESH_ARCHITECTURE.md`
- **Exemples:** `api-v2-with-refresh.example.ts`
- **Code Source:** 
  - `services/api-interceptor.ts`
  - `hooks/useSocketWithRefresh.ts`

---

## ✅ Validation

Une fois la migration terminée, vérifiez:

1. ✅ Aucune erreur "Authorization token expired" dans la console
2. ✅ Les requêtes API réussissent même avec token expiré
3. ✅ Le WebSocket se reconnecte automatiquement
4. ✅ L'utilisateur n'est déconnecté que si le refresh token expire
5. ✅ Une seule requête de refresh pour plusieurs requêtes concurrentes

---

**Prêt à migrer !** 🚀
