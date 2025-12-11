# 🌐 Task Plan: Décentralisation de Cipher Pulse

> **Objectif:** Améliorer la décentralisation de l'application tout en restant conforme aux lois internationales.
> 
> **Score actuel:** 38/100 → **Objectif:** 75/100

---

## ⚖️ Cadre Légal International

### ✅ Ce qui est LÉGAL et PERMIS

- **Chiffrement E2EE** : Légal dans la majorité des pays (USA, UE, etc.)
- **P2P/WebRTC** : Technologie standard du web, entièrement légale
- **DHT (Kademlia)** : Utilisé par BitTorrent, IPFS - légal
- **Tor** : Légal dans la plupart des pays occidentaux
- **Zero-Knowledge** : Architecture cryptographique légale

### ⚠️ Obligations à Respecter

| Juridiction | Obligation | Impact sur l'architecture |
|-------------|-----------|---------------------------|
| **UE (RGPD)** | Droit à l'effacement | ✅ Burn-after-read déjà implémenté |
| **UE (DSA)** | Modération contenu illégal | ⚠️ Impossible en E2EE - **Prévoir signalement utilisateur** |
| **USA (CALEA)** | Interception légale | ❌ N/A pour app non-télécom |
| **Global** | Pas de facilitation crime | ✅ Limiter fonctions d'anonymat extrême |

### 🚫 À ÉVITER

- Serveurs dans pays sous sanctions (Iran, Corée du Nord, etc.)
- Promotion explicite pour activités illégales
- Contournement de modération judiciaire

---

## Phase 1: Quick Wins (Score: 38 → 50)

### Task 1.1: Activer P2P WebRTC par défaut
**Fichiers:** `apps/frontend/src/screens/Conversations.tsx`, `apps/frontend/src/hooks/useP2P.ts`

```
[ ] Intégrer useP2P dans le flux de messagerie principal
[ ] Fallback automatique vers WebSocket si P2P échoue
[ ] Ajouter indicateur UI "P2P" vs "Relayed" dans les conversations
[ ] Tests: Vérifier que les messages passent en P2P entre 2 navigateurs
```

**Critères d'acceptation:**
- Messages envoyés en P2P quand les deux utilisateurs sont en ligne
- Fallback silencieux vers serveur si P2P impossible
- Aucune dégradation de l'UX

---

### Task 1.2: Multi-serveurs de Signaling
**Fichiers:** `apps/frontend/src/config.ts`, `apps/frontend/src/lib/p2p/signaling-client.ts`

```
[ ] Ajouter liste de serveurs de signaling dans config.ts
[ ] Implémenter failover automatique vers serveur secondaire
[ ] Ajouter health-check des serveurs
[ ] Documenter comment auto-héberger un serveur de signaling
```

**Configuration cible:**
```typescript
export const SIGNALING_SERVERS = [
  'wss://signaling1.cipherpulse.io',
  'wss://signaling2.cipherpulse.io',
  'wss://community.signal.example.com', // Communautaire
];
```

---

### Task 1.3: Export/Import de données complet
**Fichiers:** `apps/frontend/src/components/settings/BackupSettings.tsx`, `apps/bridge/src/routes/backup.ts`

```
[ ] Permettre export de TOUTES les données utilisateur (conversations, messages, contacts)
[ ] Format JSON portable standard
[ ] Import sur nouvelle instance (self-hosted)
[ ] Chiffrement du fichier d'export avec mot de passe utilisateur
```

**Objectif légal:** Conformité RGPD - Droit à la portabilité des données

---

## Phase 2: P2P Avancé (Score: 50 → 65)

### Task 2.1: Store & Forward pour messages offline
**Fichiers:** Nouveaux fichiers dans `apps/frontend/src/lib/p2p/`

```
[ ] Créer store-forward.ts - Queue de messages pour pairs offline
[ ] Stocker messages chiffrés en IndexedDB local
[ ] Retry automatique quand pair revient en ligne
[ ] Expiration configurable (7 jours par défaut)
[ ] Synchronisation avec serveur en dernier recours
```

**Architecture:**
```
Pair A (online) → Queue locale → Pair B revient online → Envoi P2P
                      ↓
              (après 24h) → Serveur relay (optionnel)
```

---

### Task 2.2: Indicateurs de présence décentralisés
**Fichiers:** `apps/frontend/src/lib/p2p/presence.ts`

```
[ ] Heartbeat P2P entre contacts (sans passer par serveur)
[ ] Broadcast présence via DataChannel actifs
[ ] Cache local du statut des contacts
[ ] Fallback serveur pour découverte initiale uniquement
```

---

### Task 2.3: Échange de clés P2P
**Fichiers:** `apps/frontend/src/lib/e2ee/`, `apps/frontend/src/lib/p2p/`

```
[ ] Permettre échange de key bundles directement en P2P
[ ] Vérification des fingerprints via QR code / mot de passe partagé
[ ] Réduire dépendance au serveur pour /api/v2/e2ee/keys
[ ] Garder serveur comme backup pour utilisateurs jamais en ligne simultanément
```

---

## Phase 3: DHT & Fédération (Score: 65 → 75)

### Task 3.1: Intégration libp2p (DHT Kademlia)
**Fichiers:** Nouveau module `apps/frontend/src/lib/p2p/dht/`

```
[ ] Ajouter dépendance libp2p-js
[ ] Implémenter découverte de pairs via DHT
[ ] Bootstrap nodes hardcodés + découverte dynamique
[ ] Tests: 3+ utilisateurs se trouvent sans serveur central
```

**Dépendances npm:**
```json
{
  "libp2p": "^1.x",
  "@libp2p/kad-dht": "^12.x",
  "@libp2p/webrtc": "^4.x"
}
```

**⚠️ Légal:** La DHT est publique - Ne PAS exposer d'identifiants personnels

---

### Task 3.2: Fédération de serveurs (optionnel)
**Fichiers:** Nouveaux endpoints dans `apps/bridge/src/routes/federation.ts`

```
[ ] Protocole de fédération inter-serveurs (inspiré Matrix/ActivityPub)
[ ] Chaque serveur garde ses utilisateurs mais peut router vers autres serveurs
[ ] Pas de base de données centralisée unique
[ ] Documentation pour auto-héberger une instance fédérée
```

**⚠️ Légal:** Chaque opérateur de nœud est responsable de sa juridiction

---

### Task 3.3: Mode Mesh local (LAN)
**Fichiers:** `apps/frontend/src/lib/p2p/mdns.ts`

```
[ ] Découverte de pairs sur réseau local (mDNS/Bonjour)
[ ] Fonctionnement sans accès Internet
[ ] Cas d'usage: bureaux, écoles, zones sans connectivité
```

---

## Phase 4: Anonymat Avancé (Score: 75 → 85+)

### Task 4.1: Support Tor (optionnel)
**Fichiers:** Configuration serveur, documentation

```
[ ] Documenter déploiement du signaling server en .onion
[ ] Option frontend pour router via Tor (extension navigateur)
[ ] Avertissement utilisateur sur les implications
```

**⚠️ Légal:** Tor est légal mais peut être bloqué dans certains pays. Rendre OPTIONNEL.

---

### Task 4.2: IPFS pour pièces jointes
**Fichiers:** `apps/frontend/src/lib/storage/ipfs.ts`, `apps/bridge/src/routes/attachments.ts`

```
[ ] Upload fichiers vers IPFS (chiffrés E2E avant upload)
[ ] Partager CID via P2P/message
[ ] Fallback serveur local si IPFS indisponible
[ ] Épinglage optionnel sur pinning service
```

---

## 📋 Checklist Légale par Phase

### Phase 1 ✅
- [x] Pas de contenu stocké en clair
- [x] Logs minimaux (pas d'IP, pas de contenu)
- [ ] Ajouter page "Legal" / CGU mentionnant E2EE

### Phase 2 ✅
- [ ] Documenter que l'opérateur serveur ne peut pas lire les messages
- [ ] Mécanisme de signalement utilisateur (abuse report)
- [ ] Répondre aux demandes légales avec: "Données chiffrées, pas de clé"

### Phase 3 ⚠️
- [ ] Avertissement: DHT expose hash de votre identité publique
- [ ] Option de participation DHT OFF par défaut (opt-in)
- [ ] Vérifier légalité DHT/P2P dans pays cible (Chine, Russie: restreint)

### Phase 4 ⚠️
- [ ] Tor optionnel, pas par défaut
- [ ] Disclaimer légal visible
- [ ] Pas de promotion comme "outil anti-gouvernement"

---

## 🚀 Ordre d'exécution recommandé

```
Semaine 1-2:  Task 1.1 (P2P par défaut)
Semaine 3:    Task 1.2 (Multi-signaling)
Semaine 4:    Task 1.3 (Export/Import)
Semaine 5-6:  Task 2.1 (Store & Forward)
Semaine 7:    Task 2.2 + 2.3 (Présence + Clés P2P)
Semaine 8-10: Task 3.1 (DHT libp2p) - COMPLEXE
Semaine 11+:  Phase 4 (optionnel selon besoins)
```

---

## 📚 Ressources

- **libp2p docs:** https://docs.libp2p.io/
- **WebRTC security:** https://webrtc-security.github.io/
- **RGPD & encryption:** https://gdpr.eu/encryption/
- **Matrix Federation:** https://spec.matrix.org/latest/

---

*Plan généré le 2025-12-09 - À réviser selon évolutions légales*
