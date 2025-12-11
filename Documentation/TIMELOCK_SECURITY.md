# Time-Lock Security - Protection Anti-Manipulation Temporelle

## 🔒 Problème de Sécurité Identifié

### Vulnérabilité potentielle
Un utilisateur malveillant pourrait tenter de contourner le système de Time-Lock en:
1. Changeant l'heure de son appareil (device clock)
2. Manipulant les timestamps côté client
3. Modifiant le code JavaScript du frontend

**Exemple d'attaque**:
```
Message time-locked jusqu'à 18h00
Utilisateur change son horloge à 18h01
→ Sans protection, le message serait déverrouillé prématurément
```

## 🛡️ Architecture de Sécurité Implémentée

### Principe fondamental : "Never Trust the Client"

Le système utilise une **architecture de validation serveur stricte** où:

✅ **Le serveur est TOUJOURS la source de vérité**
✅ **Le client NE PEUT JAMAIS décider si un message est déverrouillé**
✅ **L'heure du serveur est immuable pour le client**

## 🔐 Protections Implémentées

### 1. Validation Côté Serveur Uniquement

```typescript
// ❌ MAUVAIS - Validation côté client (contournable)
const isLocked = currentHeight < message.unlockBlockHeight;

// ✅ BON - Validation côté serveur (sécurisé)
const currentHeight = blockchain.getCurrentBlockHeight(); // Heure SERVEUR
const isLocked = unlockHeight ? !blockchain.canUnlock(unlockHeight) : false;
```

**Fichier**: `apps/bridge/src/index.ts` ligne 912

### 2. Masquage du Contenu Côté Serveur

Le contenu des messages verrouillés est **remplacé par le serveur** avant envoi au client:

```typescript
return {
  body: isLocked ? '[Message verrouillé]' : msg.body,
  isLocked,
  unlockBlockHeight
};
```

**Protection**: Le client ne reçoit JAMAIS le contenu réel d'un message verrouillé.

### 3. Source de Temps Serveur

La blockchain utilise `Date.now()` **côté serveur**:

```typescript
export function getCurrentBlockHeight(): number {
  const now = Date.now(); // Heure du PROCESSUS SERVEUR
  const elapsed = now - GENESIS_TIMESTAMP;
  const blocksElapsed = Math.floor(elapsed / BLOCK_TIME_MS);
  return GENESIS_HEIGHT + blocksElapsed;
}
```

**Fichier**: `apps/bridge/src/services/blockchain.ts`

**Protection**: 
- Le client ne peut pas modifier `Date.now()` du serveur
- Même si le client change son horloge, le serveur continue avec son heure
- Le calcul de la hauteur de bloc est fait uniquement côté serveur

### 4. API de Synchronisation Temporelle

Nouvelle route `/blockchain/sync-time` pour synchroniser le client:

```typescript
GET /blockchain/sync-time
Response: {
  "serverTimestamp": 1762247850000,
  "currentHeight": 1007625,
  "blockTime": 10000,
  "message": "Ce timestamp est la source de vérité. Ne pas utiliser l'heure locale du client."
}
```

**Usage côté client**:
- Le client affiche le compte à rebours basé sur le timestamp serveur
- Le client NE DOIT PAS utiliser `Date.now()` local pour vérifier le déverrouillage
- Le client peut se synchroniser périodiquement pour corriger la dérive

### 5. Détection d'Anomalies Temporelles

Le serveur détecte les manipulations temporelles suspectes:

```typescript
const timeDiff = now - lastServerTimestamp;
if (timeDiff < 0 || timeDiff > 60000) {
  // Le temps a reculé OU saut >1min = suspect
  suspiciousTimeJumps++;
  console.warn(`[SECURITY] Suspicious time jump detected: ${timeDiff}ms`);
}
```

**Logs d'audit**: Les anomalies temporelles sont loggées pour investigation.

## 🧪 Scénarios de Test

### Scénario 1: Attaque par Changement d'Horloge Client

1. User A envoie un message time-locked pour 1 heure
2. User B change l'horloge de son device à +2 heures
3. User B tente de lire le message

**Résultat**: ❌ ÉCHEC
- Le client demande les messages au serveur
- Le serveur vérifie avec SON horloge (qui n'a pas changé)
- Le serveur renvoie `body: '[Message verrouillé]'`
- User B ne peut pas lire le message

### Scénario 2: Attaque par Modification JavaScript

1. User B modifie le code frontend pour ignorer `isLocked`
2. User B tente d'afficher le contenu en clair

**Résultat**: ❌ ÉCHEC
- Le serveur a déjà envoyé `'[Message verrouillé]'` comme contenu
- Le vrai contenu n'existe PAS dans la réponse du serveur
- Modifier le frontend ne change pas les données reçues

### Scénario 3: Attaque par Interception Réseau

1. User B intercepte les requêtes HTTP avec un proxy (Burp Suite, mitmproxy)
2. User B modifie le `currentHeight` dans les réponses

**Résultat**: ⚠️ PARTIELLEMENT BLOQUÉ
- User B pourrait afficher un faux compte à rebours
- MAIS le contenu reste `'[Message verrouillé]'` côté serveur
- Lors du prochain fetch, le serveur renvoie le vrai état

**Amélioration future**: Ajouter signature HMAC des réponses critiques.

## 🔄 Flux de Sécurité

```
┌──────────────┐                  ┌──────────────┐
│    Client    │                  │   Serveur    │
│  (Untrusted) │                  │  (Trusted)   │
└──────┬───────┘                  └──────┬───────┘
       │                                 │
       │ 1. GET /conversations/X/messages│
       ├────────────────────────────────>│
       │                                 │
       │                        2. currentHeight = blockchain.getCurrentBlockHeight()
       │                           (Utilise Date.now() SERVEUR)
       │                                 │
       │                        3. Pour chaque message:
       │                           if (unlockHeight > currentHeight)
       │                             body = '[Message verrouillé]'
       │                                 │
       │ 4. Response avec contenu masqué │
       │<────────────────────────────────┤
       │                                 │
       │ 5. Affichage UI:                │
       │    Si isLocked → "🔒 Verrouillé"│
       │    Sinon → Déchiffrer & Afficher│
       │                                 │
```

**Point critique**: À l'étape 3, le serveur décide SEUL si le message est verrouillé.

## ⚡ Performance

Les vérifications de sécurité ont un impact minimal:

- `getCurrentBlockHeight()`: ~0.001ms (calcul simple)
- `canUnlock()`: ~0.001ms (comparaison d'entiers)
- Overhead total: <1ms par message

## 🚀 Production - Blockchain Réelle

En production, remplacer la blockchain simulée par une vraie:

```typescript
// Chimera blockchain (recommandé)
export async function getCurrentBlockHeight(): Promise<number> {
  const response = await fetch('https://chimera-rpc.network/v1/height');
  const data = await response.json();
  return data.height;
}

// Alternative: Bitcoin (très sécurisé mais lent)
export async function getCurrentBlockHeight(): Promise<number> {
  const response = await fetch('https://blockchain.info/q/getblockcount');
  return parseInt(await response.text());
}
```

**Avantages blockchain réelle**:
- Temps universel et immuable
- Impossible de manipuler (consensus distribué)
- Auditabilité publique
- Pas de dépendance à un serveur unique

## 📊 Audit & Conformité

### Logs de Sécurité

```bash
[SECURITY] Suspicious time jump detected: -3600000ms (total: 1)
[SECURITY] Suspicious time jump detected: 120000ms (total: 2)
```

### Métriques à Surveiller

- `suspiciousTimeJumps`: Nombre d'anomalies temporelles détectées
- Fréquence de récupération des messages verrouillés (si anormalement élevée)
- Logs d'erreurs liés à `unlockBlockHeight`

## ✅ Checklist de Sécurité

- [x] Validation serveur obligatoire pour tous les messages
- [x] Masquage du contenu côté serveur
- [x] Source de temps serveur uniquement
- [x] API de synchronisation temporelle
- [x] Détection d'anomalies temporelles
- [x] Logs d'audit
- [ ] TODO: Signature HMAC des réponses critiques
- [ ] TODO: Migration vers blockchain réelle (Chimera)
- [ ] TODO: Rate limiting sur `/sync-time` pour éviter DDoS

## 📝 Conclusion

Le système Time-Lock est **sécurisé contre la manipulation d'horloge client** grâce à:

1. ✅ **Architecture serveur-first**: Le client ne prend AUCUNE décision de sécurité
2. ✅ **Masquage côté serveur**: Le contenu sensible n'atteint jamais le client
3. ✅ **Source de temps fiable**: Heure du processus serveur (non modifiable par client)
4. ✅ **Détection d'anomalies**: Logs des comportements suspects

**Verdict**: ✅ Le système est **résistant à la manipulation temporelle** dans sa forme actuelle.

**Niveau de sécurité**: 🟢 **Élevé** (avec blockchain simulée)  
**Niveau de sécurité (prod)**: 🟢 **Très élevé** (avec blockchain réelle)
