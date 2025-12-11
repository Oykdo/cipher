# 🧪 Scénarios de Test - Token Refresh

## 📋 Vue d'Ensemble

Ce document décrit les scénarios de test pour valider le système de rafraîchissement automatique des tokens.

---

## ✅ Checklist Rapide

- [ ] Test 1: Token expiré - API
- [ ] Test 2: Token expiré - WebSocket
- [ ] Test 3: Refresh token expiré
- [ ] Test 4: Requêtes concurrentes
- [ ] Test 5: Refresh proactif

---

## 🔬 Test 1: Token Expiré - API

### Objectif
Vérifier que les requêtes API réussissent même avec un token expiré.

### Étapes
1. Se connecter à l'application
2. Ouvrir la console développeur (F12)
3. Ouvrir l'onglet Network
4. **Option A:** Attendre 15 minutes (durée de vie du token)
5. **Option B:** Modifier manuellement le token dans le store Zustand
   ```javascript
   // Dans la console
   const store = JSON.parse(localStorage.getItem('cipher-pulse-auth'));
   store.state.session.accessToken = 'expired_token';
   localStorage.setItem('cipher-pulse-auth', JSON.stringify(store));
   location.reload();
   ```
6. Effectuer une action (ex: charger les conversations)

### Résultat Attendu
- ✅ Une requête échoue avec 401
- ✅ Une requête `/api/v2/auth/refresh` est envoyée
- ✅ La requête initiale est rejouée avec le nouveau token
- ✅ Les conversations se chargent correctement
- ✅ Aucune erreur visible pour l'utilisateur

### Logs Attendus
```
🔄 [REFRESH] Token expired, refreshing...
✅ [REFRESH] Token refreshed successfully
🔄 [RETRY] Retrying original request with new token
✅ [API] Request succeeded
```

---

## 🔌 Test 2: Token Expiré - WebSocket

### Objectif
Vérifier que le WebSocket se reconnecte automatiquement après un refresh de token.

### Étapes
1. Se connecter à l'application
2. Ouvrir une conversation (établir la connexion WebSocket)
3. Vérifier que le statut est "● En ligne"
4. Attendre que le token expire (ou forcer l'expiration)
5. Observer le comportement du WebSocket

### Résultat Attendu
- ✅ Le WebSocket détecte le changement de token
- ✅ Une reconnexion automatique est effectuée
- ✅ Le statut reste "● En ligne"
- ✅ Les messages continuent d'être reçus

### Logs Attendus
```
🔄 [WEBSOCKET] Token changed, reconnecting...
🔌 [WEBSOCKET] Disconnecting old connection
🔌 [WEBSOCKET] Connecting with new token
✅ [WEBSOCKET] Connected successfully
```

---

## 🚫 Test 3: Refresh Token Expiré

### Objectif
Vérifier que l'utilisateur est déconnecté si le refresh token est invalide.

### Étapes
1. Se connecter à l'application
2. **Côté serveur:** Invalider le refresh token
   - Option A: Supprimer le refresh token de la base de données
   - Option B: Modifier le refresh token dans le store
3. Attendre que l'access token expire
4. Effectuer une action API

### Résultat Attendu
- ✅ La requête de refresh échoue
- ✅ L'utilisateur est déconnecté automatiquement
- ✅ Redirection vers `/login`
- ✅ Message d'erreur approprié (optionnel)

### Logs Attendus
```
🔄 [REFRESH] Token expired, refreshing...
❌ [REFRESH] Refresh failed: Invalid refresh token
🚪 [AUTH] Logging out user
➡️  [REDIRECT] Redirecting to /login
```

---

## ⚡ Test 4: Requêtes Concurrentes

### Objectif
Vérifier qu'une seule requête de refresh est envoyée même avec plusieurs requêtes simultanées.

### Étapes
1. Se connecter avec un token expiré (ou forcer l'expiration)
2. Ouvrir la console Network
3. Effectuer plusieurs actions simultanément :
   - Charger les conversations
   - Charger les paramètres utilisateur
   - Envoyer un message
4. Observer les requêtes réseau

### Résultat Attendu
- ✅ Plusieurs requêtes échouent avec 401
- ✅ **UNE SEULE** requête `/api/v2/auth/refresh` est envoyée
- ✅ Toutes les requêtes initiales sont rejouées après le refresh
- ✅ Toutes les requêtes réussissent

### Logs Attendus
```
🔄 [REFRESH] Token expired, refreshing...
⏳ [QUEUE] Request queued, waiting for refresh
⏳ [QUEUE] Request queued, waiting for refresh
✅ [REFRESH] Token refreshed successfully
🔄 [RETRY] Retrying 3 queued requests
✅ [API] All requests succeeded
```

---

## 🕐 Test 5: Refresh Proactif

### Objectif
Vérifier que le token est rafraîchi automatiquement avant expiration.

### Étapes
1. Se connecter à l'application
2. Ouvrir la console développeur
3. Attendre 10 minutes (le token expire dans 15 min, refresh à 10 min)
4. Observer les logs et les requêtes réseau

### Résultat Attendu
- ✅ Une requête `/api/v2/auth/refresh` est envoyée automatiquement
- ✅ Le token est mis à jour dans le store
- ✅ Aucune interruption de service
- ✅ L'utilisateur ne remarque rien

### Logs Attendus
```
⏰ [PROACTIVE] Token will expire in 5 minutes
🔄 [PROACTIVE] Refreshing token proactively
✅ [REFRESH] Token refreshed successfully
```

---

## 🐛 Debugging

### Vérifier le Token dans le Store
```javascript
// Console développeur
const store = JSON.parse(localStorage.getItem('cipher-pulse-auth'));
console.log('Access Token:', store.state.session.accessToken);
console.log('Refresh Token:', store.state.session.refreshToken);
```

### Décoder le JWT
```javascript
// Console développeur
function parseJwt(token) {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));
  return JSON.parse(jsonPayload);
}

const token = JSON.parse(localStorage.getItem('cipher-pulse-auth')).state.session.accessToken;
const decoded = parseJwt(token);
console.log('Token expires at:', new Date(decoded.exp * 1000));
console.log('Time remaining:', Math.floor((decoded.exp * 1000 - Date.now()) / 1000 / 60), 'minutes');
```

### Forcer l'Expiration du Token
```javascript
// Console développeur
const store = JSON.parse(localStorage.getItem('cipher-pulse-auth'));
store.state.session.accessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjB9.invalid';
localStorage.setItem('cipher-pulse-auth', JSON.stringify(store));
location.reload();
```

---

## 📊 Résultats Attendus

### Tous les Tests Passent ✅
- ✅ Aucune erreur "Authorization token expired" visible
- ✅ Les requêtes API réussissent toujours
- ✅ Le WebSocket reste connecté
- ✅ Une seule requête de refresh pour plusieurs requêtes concurrentes
- ✅ Déconnexion automatique si refresh échoue
- ✅ Refresh proactif fonctionne

### Métriques de Performance
- **Temps de refresh:** < 500ms
- **Temps de reconnexion WebSocket:** < 1s
- **Nombre de requêtes de refresh:** 1 (même avec 10 requêtes concurrentes)

---

## 🎯 Validation Finale

Une fois tous les tests passés, vous pouvez considérer la migration comme **réussie** et déployer en production.

**Checklist finale:**
- [ ] Tous les tests passent
- [ ] Aucune erreur dans la console
- [ ] Les logs sont cohérents
- [ ] L'expérience utilisateur est fluide
- [ ] La documentation est à jour

---

**Bonne chance pour les tests !** 🚀
