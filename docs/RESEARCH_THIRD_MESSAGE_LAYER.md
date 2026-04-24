# Research brief — Troisième couche de contrôle de message

**Destinataire** : agent (droïde) qui va concevoir et implémenter la fonctionnalité.
**Auteur** : Claude (4.7 1M) pour le dév solo de Cipher.
**Date** : 2026-04-24.
**Statut** : brief, pas de code ; pas de décision finale à ce stade.

---

## 1. Contexte — ce qui existe déjà

Cipher a aujourd'hui deux couches de contrôle de message côté destinataire, toutes deux combinables :

| Couche | Mécanique | Modèle de menace | Clé côté UI |
|---|---|---|---|
| **Timelock** | Chiffrement de la clé symétrique du message vers un *round drand* futur (tlock/drand sur BLS12-381). Le serveur laisse passer, le texte reste cryptographiquement illisible tant que le beacon drand n'a pas publié la signature du round. | Protéger un message pour qu'il ne soit pas lisible avant date X, **même par un serveur compromis ou un client modifié**. | 🔒 + compte à rebours, puis révélation du texte. |
| **Burn-After-Reading** | Mode de cycle de vie : after-read, side-server scheduler supprime le contenu en base, broadcast `message_burned` à tous les clients de la conversation. Durée configurable 1s–7j. | Forcer la disparition d'un message après que le destinataire l'a lu (ou après un délai max). Confiance dans le serveur pour supprimer. | 🔥 tap-to-reveal, puis countdown de destruction. |

**Les deux couches peuvent se stacker** (correctif récent `9666c49`) : un document time-locked jusqu'à lundi 14h qui s'auto-détruit 20s après lecture, par exemple.

**Points de vérité techniques à respecter** :
- Tout le chiffrement est côté client (X3DH + Double Ratchet, via `apps/frontend/src/lib/e2ee/`).
- Le serveur ne voit que des enveloppes opaques (sauf les métadonnées : `scheduledBurnAt`, `unlockBlockHeight`, `senderId`, timestamps).
- Tlock utilise `tlock-js` (drand *quicknet*, genesis 1692803367, période 3s).
- Burn utilise un champ `is_burned` + broadcast WebSocket. Scheduler côté bridge dans `services/burn-scheduler.js`.
- Le backup (fichier .cipherbackup) inclut le `unlockBlockHeight` pour préserver la gate tlock à l'import (`feat(backup)` commit `88eb64a`). Les messages brûlés ne sont **pas** exportés (garantie de destruction).

---

## 2. Demande — lucidité nécessaire

**Ce que l'utilisateur a dit** : « une 3e fonctionnalité pour innover ».

**Ce qu'il faut faire avant de proposer** :

1. **Ne pas empiler un gadget de plus**. Une feature supplémentaire à ce stade doit soit :
   - combler un trou du modèle de menace actuel (pas juste un "cool thing to have"),
   - ou anticiper une demande qui va arriver dans 3–6 mois (voir §3),
   - ou déverrouiller une utilisation métier crédible (voir §5).
2. **Respecter l'invariant Cipher** : tout contrôle doit être *cryptographiquement* enforce si l'utilisateur s'attend à une garantie, pas *contractuellement* (c.-à-d. pas une règle que le client respecte mais qu'un client modifié pourrait contourner). Sinon le placer explicitement comme "policy UI" et pas "sécurité".
3. **Ne pas dupliquer**. Si la proposition est un sur-ensemble de Timelock ou Burn, les fusionner plutôt qu'en rajouter une troisième.

---

## 3. Pistes sérieuses — à évaluer, pas à choisir

Classement **par valeur utilisateur réelle / originalité** décroissante. L'agent doit **challenger chacune**, pas toutes les implémenter.

### A. **Unlock-by-presence (quorum de lecture)**
Le message ne se déchiffre que si *N* destinataires sur *M* sont présents simultanément (ou au moins ont ack dans une fenêtre glissante de T secondes).
- **Mécanique crypto** : partage de Shamir (2-of-3, 3-of-5…) de la clé symétrique, chaque part distribuée aux participants via X3DH. Un client ne peut reconstituer la clé qu'avec les parts des autres.
- **Serveur** : relais uniquement, ne voit jamais les parts.
- **Modèle** : secrets partagés pour équipes, pacte de silence, décisions de groupe. *Aucun destinataire ne peut lire seul.*
- **Originalité** : rare dans les messageries grand public ; Signal ne l'a pas, WhatsApp encore moins.
- **Risques** : UX complexe à expliquer ("ce message est disponible à 2 autres personnes, il s'ouvrira quand 2 seront en ligne"). Risque de messages zombies si un destinataire disparaît définitivement (→ expiration).
- **Effort** : moyen–élevé. Nécessite Shamir dans `lib/e2ee`, synchro de présence, timeout UI.
- **Verdict** : **la plus "Cipher-spirit"** — crypto-enforced, différenciante, modèle de menace concret.

### B. **View-once strict (image/doc ouvert une seule fois, jamais re-chiffré localement)**
Comme Burn, mais avec garantie plus forte : le client efface la clé dès la première lecture et le contenu chiffré ne peut plus être re-déchiffré, même en gardant le fichier.
- **Mécanique** : clé symétrique stockée en RAM uniquement, jamais persistée. Un "seed counter" du Double Ratchet s'avance d'une étape après read, rendant la clé précédente irrécupérable (déjà le principe, mais Cipher cache actuellement le plaintext).
- **Différence avec Burn** : Burn fait confiance au serveur pour supprimer le contenu ; View-once le rend mathématiquement irrécupérable côté destinataire.
- **Originalité** : WhatsApp l'a, Signal aussi — pas révolutionnaire, mais comble un *manque* réel si un user screen-shot a lieu (voir §C).
- **Effort** : faible–moyen. Intégration propre dans la Double Ratchet existante.
- **Verdict** : **le plus facile à marketer** ("ce message ne s'ouvre qu'une fois, point."), utile en pratique.

### C. **Screenshot-aware metadata (Protected View)**
Pas de la crypto, mais un signal de confiance : le destinataire voit l'indicateur "screenshot pris" dans la conv, comme Snapchat/Instagram. Côté iOS/Android faisable ; côté desktop Electron, *difficile à détecter* (c'est l'OS qui gère). Option accessible : watermark rotatif sur les messages view-once (nom + timestamp du destinataire imprimé en filigrane dans le rendu) — un screenshot serait traçable.
- **Mécanique** : watermark CSS/canvas sur les messages flaggés.
- **Originalité** : classique mais attendu.
- **Effort** : faible côté frontend, nul côté protocole.
- **Verdict** : **feature de confiance sociale**, pas de sécurité. À combiner avec B.

### D. **Geofence / "attach this message to a location"**
Le message ne se déchiffre que si le destinataire est dans un rayon X d'un point GPS.
- **Mécanique crypto** : impossible à enforce cryptographiquement sans oracle de localisation, et tout oracle est corruptible. Donc *policy UI only* — pas Cipher-spirit.
- **Verdict** : **à rejeter** pour Cipher, trop facilement cassable, promet une garantie que la crypto ne peut pas tenir.

### E. **Ephemeral group channel (salon qui expire)**
Un salon temporaire qui se détruit lui-même au bout de X. Les messages *et* la conversation disparaissent.
- **Mécanique** : combinaison de Timelock (invite limitée dans le temps) + Burn (tous les messages du salon expirent). Peut déjà être fait en chaînant les deux.
- **Verdict** : **pas une nouvelle couche** — c'est un *preset* qui combine les deux existantes. Utile côté UI, à envisager comme "templates" plutôt que feature.

### F. **Proof-of-read cryptographique (dead drop inversé)**
L'expéditeur peut prouver que le destinataire a *vraiment* lu le message (signature cryptographique, pas juste un ack client). Utile pour contexte légal, contrats, NDA.
- **Mécanique** : le destinataire signe un ACK avec sa clé d'identité sur le `messageId + readAt`, signature renvoyée au sender, stockée dans le backup des deux côtés.
- **Originalité** : exploite la crypto déjà en place, répond à un cas d'usage B2B.
- **Effort** : faible–moyen. Juste un nouveau type de socket event + persistance dans l'export.
- **Verdict** : **unique en son genre** parmi les messageries grand public. Aligne avec la narrative post-quantique zero-knowledge de Cipher.

### G. **Meta-burn — auto-suppression des métadonnées de conversation**
Même le *fait qu'une conversation ait eu lieu* disparaît après X. Actuellement Cipher garde `conversations` et `conversation_members` indéfiniment côté serveur.
- **Mécanique** : scheduler serveur qui purge la row `conversations` après la dernière activité + délai. Clients invalident leurs caches via un event.
- **Modèle de menace** : contre la *saisie* côté serveur (« qui parle à qui ? »). Timelock/Burn cachent le contenu, pas la relation.
- **Originalité** : la plupart des messageries gardent les métadonnées *à vie* (c'est leur goldmine). Cipher peut en faire un argument fort.
- **Effort** : moyen. Touche DB + scheduler + clients.
- **Verdict** : **aligne parfaitement avec "zero-knowledge"**, différenciante.

---

## 4. Ma recommandation pour l'agent

**Shortlist à débattre avec l'utilisateur avant de coder** :

1. **A (quorum N-of-M)** — le plus Cipher-spirit, cryptographiquement novatrice.
2. **F (proof-of-read crypto-signée)** — cas d'usage B2B crédible, effort modeste.
3. **G (meta-burn)** — aligne sur la promesse zero-knowledge, protège ce que Timelock/Burn ne protègent pas (la *relation*, pas le contenu).

**À écarter d'emblée** (expliquer pourquoi à l'utilisateur) :
- D (geofence) — contredit l'invariant crypto-enforced.
- E (salon éphémère) — déjà faisable en composant les deux existantes, plutôt en faire un *preset* UI.

**À proposer éventuellement en Phase 2** (après l'une des trois ci-dessus) :
- B (view-once strict) + C (watermark) en tandem, quand la surface utilisateur mobile sera prête (iOS/Android capture l'événement screenshot nativement).

---

## 5. Questions à poser à l'utilisateur avant de coder

1. **Qui est l'utilisateur cible ?** Grand public ou pro / équipe ? (oriente fortement le choix : A & F pour pro, G pour grand public vie-privée.)
2. **Quelle garantie doit-elle offrir** cryptographique ou de politique ? (si l'utilisateur ne sait pas, expliquer la différence — c'est un invariant de Cipher).
3. **Budget d'UX** : simple toggle à côté de Timelock/Burn, ou vraie étape avec explication ? (quorum demande de l'explication, proof-of-read est un simple opt-in côté sender.)
4. **Roadmap** : veut-on livrer *une* couche maintenant et itérer, ou prévoir un framework de "policies" générique qui accueille les futures ? (le framework est plus robuste mais ralentit la première livraison.)

---

## 6. Contraintes techniques dont l'agent doit partir

- **E2EE** : ne jamais envoyer la clé symétrique en clair au serveur. Tout nouveau partage de clé passe par X3DH ou un dérivé.
- **i18n** : les 6 locales de `apps/frontend/src/locales/` doivent être mises à jour dans le même commit que l'UI.
- **Backup** : toute métadonnée de contrôle doit survivre au round-trip export → import (cf. le fix `88eb64a` sur `unlockBlockHeight`).
- **Socket events** : nouveaux events à documenter dans `apps/bridge/src/websocket/socketServer.ts` avec la même protection signature Ed25519 que `call:invite` et `burn_message`.
- **UI existants à respecter** : `TlockGate.tsx`, `BurnMessage.tsx`, `MessageList.tsx`. Ne pas dupliquer la logique de composition — les deux couches actuelles se *stackent* déjà, la 3e doit s'intégrer dans ce même modèle de composition.
- **CLAUDE.md (racine workspace)** contient la roadmap actuelle. Le MAJ à chaque livraison.

---

## 7. Livrables attendus de l'agent

1. **Design doc court** (≤ 2 pages) présentant la feature choisie, le modèle de menace précis, et le flow UI en 3–5 écrans.
2. **Implémentation** côté `lib/` (crypto si besoin), `components/conversations/` (UI), `routes/messages.ts` et `socketServer.ts` (si relais serveur nécessaire).
3. **Tests** dans le style existant (vitest). Au minimum : test d'intégration du chiffrement, test de l'UI en 2 états (avant/après condition remplie).
4. **i18n 6 locales** dans le même commit.
5. **Mise à jour backup** : si la feature ajoute une métadonnée, mettre à jour `apps/frontend/src/lib/backup/types.ts` et `backupService.ts` (round-trip garanti).
6. **Entrée dans `CLAUDE.md`** sous Key Conventions.

---

## 8. Anti-brief — ce que l'agent ne doit PAS faire

- Pas de LLM-side crypto rolling-your-own. Utiliser libsodium / tlock-js / secure-remote-password, qui sont déjà présents.
- Pas de nouvelle dépendance lourde (> 100 KB gzip) sans justifier.
- Pas de breaking change sur le format de message (enveloppes de `messages` en base). Ajout additif seulement.
- Pas de "feature flag temporaire" qui traîne — soit derrière un flag config explicite (comme `TIMELOCK_ENABLED`), soit live.
- Pas de stockage de plaintext côté serveur, jamais, sous aucun prétexte.

---

## 9. Signaux de "c'est prêt"

- Un utilisateur peut activer la nouvelle couche depuis l'UI en moins de 3 clics.
- Le destinataire voit un indicateur clair de ce qui se passe (pas d'état silencieux).
- Un export → import préserve l'état et la garantie cryptographique (même avant que la condition soit remplie).
- Les tests passent. Les 6 locales ont les textes.
- Le CLAUDE.md a une section sous Key Conventions.

---

*Fin du brief. L'agent doit revenir à l'utilisateur avec sa shortlist (parmi A/F/G, ou une 4e qu'il justifie) avant de coder.*
