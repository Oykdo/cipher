# 🗑️ Guide de nettoyage des données locales

## Méthodes disponibles

Il existe 3 méthodes pour nettoyer toutes les données locales du navigateur.

## Méthode 1 : Page HTML dédiée (Recommandé)

### Accès
```
http://localhost:5173/clear-local-data.html
```

### Avantages
- ✅ Interface visuelle conviviale
- ✅ Liste des données à supprimer
- ✅ Confirmation avant suppression
- ✅ Rapport détaillé des suppressions

### Utilisation
1. Ouvrir l'URL dans le navigateur
2. Cliquer sur "Supprimer toutes les données"
3. Attendre la confirmation
4. Retourner à l'accueil

## Méthode 2 : Script console (Rapide)

### Fichier
`scripts/clear-browser-data.js`

### Utilisation
1. Ouvrir DevTools (F12)
2. Aller dans l'onglet Console
3. Copier-coller le contenu du script
4. Appuyer sur Entrée
5. Confirmer le rechargement

### Script rapide
```javascript
// Copier-coller dans la console
(async function() {
  localStorage.clear();
  sessionStorage.clear();
  const dbs = await indexedDB.databases();
  for (const db of dbs) {
    if (db.name) indexedDB.deleteDatabase(db.name);
  }
  document.cookie.split(';').forEach(c => {
    const name = c.split('=')[0].trim();
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
  });
  if ('caches' in window) {
    const names = await caches.keys();
    for (const name of names) await caches.delete(name);
  }
  console.log('✅ All data cleared!');
  location.reload();
})();
```

## Méthode 3 : DevTools manuel

### localStorage
1. F12 → Application → Storage → Local Storage
2. Clic droit → Clear

### sessionStorage
1. F12 → Application → Storage → Session Storage
2. Clic droit → Clear

### IndexedDB
1. F12 → Application → Storage → IndexedDB
2. Clic droit sur "CipherPulseSecure" → Delete database

### Cookies
1. F12 → Application → Storage → Cookies
2. Clic droit → Clear

### Cache
1. F12 → Application → Storage → Cache Storage
2. Clic droit → Delete

## Données supprimées

### localStorage
- `cipher-pulse-auth` - Session utilisateur
- `cipher-pulse-auth-secure` - Session sécurisée
- `theme` - Préférences de thème
- `language` - Langue
- Autres préférences

### sessionStorage
- Données temporaires de session
- États temporaires de l'application

### IndexedDB
- `CipherPulseSecure` - Clés chiffrées (KeyVault)
  - masterKey (chiffré)
  - Autres données sensibles

### Cookies
- `accessToken` - Token d'accès (HttpOnly)
- `refreshToken` - Token de rafraîchissement (HttpOnly)
- Autres cookies de session

### Cache
- Cache du service worker
- Cache des assets statiques

## Quand nettoyer les données

### Développement
- ✅ Après avoir modifié le schéma de données
- ✅ Pour tester le signup avec des données propres
- ✅ Après avoir changé la logique d'authentification
- ✅ Pour résoudre des bugs de cache

### Utilisateur final
- ✅ Problèmes de connexion persistants
- ✅ Données corrompues
- ✅ Changement de compte
- ✅ Avant de vendre/donner l'appareil

### Production
- ⚠️ Perte de session active
- ⚠️ Perte des préférences
- ⚠️ Nécessite une nouvelle connexion

## Automatisation

### Script npm (frontend)

Ajoutez dans `apps/frontend/package.json` :

```json
{
  "scripts": {
    "clear:local": "open http://localhost:5173/clear-local-data.html"
  }
}
```

### Raccourci clavier

Ajoutez dans votre application :

```typescript
// apps/frontend/src/App.tsx
useEffect(() => {
  const handleKeyPress = (e: KeyboardEvent) => {
    // Ctrl+Shift+Delete
    if (e.ctrlKey && e.shiftKey && e.key === 'Delete') {
      if (confirm('Clear all local data?')) {
        window.location.href = '/clear-local-data.html';
      }
    }
  };
  
  window.addEventListener('keydown', handleKeyPress);
  return () => window.removeEventListener('keydown', handleKeyPress);
}, []);
```

## Vérification après nettoyage

### Console du navigateur
```javascript
// Vérifier localStorage
console.log('localStorage:', localStorage.length);

// Vérifier sessionStorage
console.log('sessionStorage:', sessionStorage.length);

// Vérifier IndexedDB
indexedDB.databases().then(dbs => 
  console.log('IndexedDB:', dbs.map(db => db.name))
);

// Vérifier cookies
console.log('Cookies:', document.cookie.split(';').length);

// Vérifier cache
caches.keys().then(names => 
  console.log('Cache:', names)
);
```

### Résultat attendu
```
localStorage: 0
sessionStorage: 0
IndexedDB: []
Cookies: 0
Cache: []
```

## Nettoyage complet (Backend + Frontend)

### Script combiné

```bash
# Backend - Nettoyer la base de données
cd apps/bridge
npm run db:clear

# Frontend - Ouvrir la page de nettoyage
open http://localhost:5173/clear-local-data.html
```

### Ou manuellement

```bash
# 1. Nettoyer le backend
cd apps/bridge
npm run db:clear

# 2. Nettoyer le frontend (dans la console navigateur)
# Copier-coller le script de la Méthode 2

# 3. Redémarrer les serveurs
npm run dev
```

## Troubleshooting

### IndexedDB bloqué

**Problème** : "Database deletion blocked"

**Solution** :
1. Fermer tous les onglets de l'application
2. Réessayer le nettoyage
3. Si ça persiste, redémarrer le navigateur

### Cookies non supprimés

**Problème** : Les cookies HttpOnly ne sont pas supprimés

**Solution** :
- Les cookies HttpOnly ne peuvent être supprimés que par le serveur
- Utilisez la route `/api/v2/auth/logout-secure`
- Ou redémarrez le serveur backend

### localStorage persiste

**Problème** : localStorage se remplit à nouveau

**Solution** :
- Vérifier qu'aucun code ne restaure automatiquement les données
- Désactiver la persistance Zustand temporairement
- Vider le cache du navigateur (Ctrl+Shift+Delete)

## Sécurité

### Protection des données

Le nettoyage supprime :
- ✅ Toutes les clés de chiffrement locales
- ✅ Tous les tokens d'authentification
- ✅ Toutes les données en cache

### Après nettoyage

- ❌ Impossible de déchiffrer les anciens messages
- ❌ Impossible de se reconnecter sans credentials
- ❌ Perte de toutes les préférences

### Recommandations

1. **Sauvegarder le mnemonic** avant de nettoyer
2. **Noter les préférences** importantes
3. **Exporter les données** si nécessaire
4. **Confirmer** avant de nettoyer en production

## Fichiers créés

1. `apps/frontend/public/clear-local-data.html` - Page HTML
2. `scripts/clear-browser-data.js` - Script console
3. `CLEAR_LOCAL_DATA_GUIDE.md` - Ce guide

---

**Date** : 15 novembre 2025
**Statut** : ✅ Prêt à l'emploi
**Usage** : Développement et production
