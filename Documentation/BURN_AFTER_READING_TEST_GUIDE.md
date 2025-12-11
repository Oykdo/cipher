# Guide de test - Burn After Reading 🔥

## Prérequis

Assurez-vous que les serveurs sont démarrés :

```bash
# Terminal 1 - Backend
cd apps/bridge
npm run dev

# Terminal 2 - Frontend
cd apps/frontend
npm run dev
```

## Scénarios de test

### Test 1 : Envoi d'un message avec Burn After Reading

1. **Connexion** : Connectez-vous avec deux utilisateurs différents (User A et User B)
2. **User A** : Créez une conversation avec User B
3. **User A** : Activez "Burn After Reading" (bouton 🔥)
4. **User A** : Sélectionnez un délai (ex: 30s)
5. **User A** : Tapez un message et envoyez-le
6. **Vérification** : Le message doit afficher un indicateur compact avec le compte à rebours

**Résultat attendu** :
- ✅ Le message est envoyé avec l'icône 🔥 et le temps restant
- ✅ Le délai sélectionné est visible

### Test 2 : Réception et compte à rebours

1. **User B** : Ouvrez la conversation
2. **User B** : Vous devriez voir le message avec un badge "Burn After Reading"
3. **User B** : Observez le compte à rebours (ne cliquez pas encore)

**Résultat attendu** :
- ✅ Barre de progression visible
- ✅ Temps restant affiché en temps réel
- ✅ Couleur change selon l'urgence (orange → rouge)
- ✅ Bouton "J'ai lu" visible

### Test 3 : Accusé de réception

1. **User B** : Cliquez sur "J'ai lu (confirmer la lecture)"
2. **Observation** : Le compte à rebours continue

**Résultat attendu** :
- ✅ Le compte à rebours continue normalement
- ✅ Aucune erreur dans la console
- ✅ Le serveur a bien reçu l'accusé de réception (vérifier les logs)

### Test 4 : Destruction automatique

1. **Attendez** : Laissez le compte à rebours arriver à 0
2. **Observation** : Animation de destruction

**Résultat attendu** :
- ✅ Animation spectaculaire avec emoji 🔥
- ✅ Particules qui s'éparpillent
- ✅ Message "Message détruit" affiché
- ✅ Le message passe à l'état "brûlé" (emoji 🔥 + "Message brûlé")
- ✅ Les deux utilisateurs voient le message brûlé

### Test 5 : Délais différents

Testez avec différents délais :

1. **10 secondes** : Délai très court
   - ✅ Avertissement "Délai très court" visible lors de la sélection
   - ✅ Destruction rapide

2. **1 minute** : Délai normal
   - ✅ Compte à rebours en minutes et secondes
   - ✅ Changement de couleur progressif

3. **1 heure** : Délai long
   - ✅ Affichage en heures et minutes
   - ✅ Barre de progression précise

### Test 6 : Persistance après redémarrage

1. **User A** : Envoyez un message avec Burn After Reading (délai: 5 minutes)
2. **User B** : Accusez réception
3. **Redémarrage** : Redémarrez le serveur backend
4. **Observation** : Le compte à rebours continue

**Résultat attendu** :
- ✅ Le message n'est pas perdu
- ✅ Le compte à rebours reprend correctement
- ✅ La destruction se produit au bon moment

### Test 7 : Plusieurs messages simultanés

1. **User A** : Envoyez 3 messages avec des délais différents :
   - Message 1 : 30s
   - Message 2 : 1min
   - Message 3 : 2min

2. **User B** : Accusez réception de tous les messages

**Résultat attendu** :
- ✅ Chaque message a son propre compte à rebours
- ✅ Les messages se détruisent dans l'ordre correct
- ✅ Aucune interférence entre les comptes à rebours

### Test 8 : Message sans Burn After Reading

1. **User A** : Envoyez un message normal (sans activer Burn After Reading)
2. **User B** : Recevez le message

**Résultat attendu** :
- ✅ Pas de compte à rebours
- ✅ Pas de badge "Burn After Reading"
- ✅ Message reste visible indéfiniment

### Test 9 : Validation des délais

1. **User A** : Essayez de sélectionner un délai personnalisé
2. **Test** : Entrez différentes valeurs :
   - Valeur négative
   - 0
   - Très grande valeur (> 7 jours)

**Résultat attendu** :
- ✅ Valeurs invalides sont rejetées ou corrigées
- ✅ Minimum : 5 secondes
- ✅ Maximum : 7 jours (604800 secondes)

### Test 10 : Destruction manuelle (API)

Testez l'endpoint de destruction manuelle :

```bash
# Récupérez un messageId depuis la console
curl -X POST http://localhost:4000/api/v2/messages/{messageId}/burn \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json"
```

**Résultat attendu** :
- ✅ Message détruit immédiatement
- ✅ Animation de destruction déclenchée
- ✅ Réponse JSON avec `success: true` et `burnedAt`

## Vérifications dans les logs

### Backend (apps/bridge)

Recherchez ces logs :

```
🔥 Burn Scheduler initialized
🔥 Message burn scheduled
🔥 Message burned successfully
```

### Frontend (Console navigateur)

Recherchez ces logs :

```
[SOCKET] New message received
[SOCKET] Message burned
```

## Checklist complète

- [ ] Test 1 : Envoi avec Burn After Reading
- [ ] Test 2 : Réception et compte à rebours
- [ ] Test 3 : Accusé de réception
- [ ] Test 4 : Destruction automatique
- [ ] Test 5 : Délais différents (10s, 1min, 1h)
- [ ] Test 6 : Persistance après redémarrage
- [ ] Test 7 : Plusieurs messages simultanés
- [ ] Test 8 : Message sans Burn After Reading
- [ ] Test 9 : Validation des délais
- [ ] Test 10 : Destruction manuelle (API)

## Problèmes connus et solutions

### Le compte à rebours ne démarre pas

**Solution** : Vérifiez que :
- Le serveur backend est démarré
- Socket.IO est connecté (indicateur "En ligne" visible)
- L'accusé de réception a bien été envoyé (vérifier les logs)

### L'animation ne se déclenche pas

**Solution** : Vérifiez que :
- Le composant `BurnAnimation` est bien importé
- L'état `burningMessages` est correctement géré
- L'événement `message_burned` est bien reçu via Socket.IO

### Le message n'est pas détruit après le délai

**Solution** : Vérifiez que :
- Le `BurnScheduler` est bien initialisé au démarrage du serveur
- Les logs backend montrent "Message burn scheduled"
- La base de données contient bien `scheduled_burn_at`

## Commandes utiles

### Vérifier les messages en base de données

```bash
# SQLite
sqlite3 apps/bridge/data/cipher-pulse.db
SELECT id, scheduled_burn_at, is_burned FROM messages WHERE scheduled_burn_at IS NOT NULL;
```

### Vérifier les statistiques du BurnScheduler

Ajoutez temporairement un endpoint dans `apps/bridge/src/index.ts` :

```typescript
app.get('/api/debug/burn-stats', async (request, reply) => {
  const { burnScheduler } = await import('./services/burn-scheduler.js');
  return burnScheduler.getStats();
});
```

Puis :

```bash
curl http://localhost:4000/api/debug/burn-stats
```

## Conclusion

Si tous les tests passent, le système Burn After Reading est **100% fonctionnel** ! 🎉

En cas de problème, vérifiez :
1. Les logs backend et frontend
2. La connexion Socket.IO
3. La base de données SQLite
4. Les erreurs dans la console navigateur
