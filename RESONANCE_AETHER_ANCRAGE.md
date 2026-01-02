# Résonance, Aether, Ancrage (Stake) — Principes & Implémentation

Ce document décrit le **prototype client-side** actuellement en place dans `apps/frontend`.

- **Résonance (ρ)** : score dynamique `[0..1]` représentant la qualité/fiabilité du comportement d’interaction.
- **Aether** : jeton/métrique interne mintée en fonction de la qualité d’interaction, soumise à **vesting**.
- **Ancrage (Stake)** : mise en jeu d’Aether qui sert de **preuve économique**.
  - Sans stake : état **Sauvage**.
  - Avec stake : état **Ancré**.

L’objectif est de **ne jamais restreindre l’accès à l’app** (l’utilisateur peut discuter), tout en différenciant :
- le **plafond de Résonance** atteignable,
- le **type de sanction** en cas de comportement suspect.

---

## 1) Sources de vérité (code)

- **Moteur principal** : `apps/frontend/src/core/resonance/ResonanceCore.ts`
- **Moteur d’ancrage** : `apps/frontend/src/core/resonance/AnchoringEngine.ts`
- **Hook React** (state par utilisateur, persisté localement) : `apps/frontend/src/hooks/useResonance.ts`
- **UI** :
  - Widget 3D : `apps/frontend/src/components/resonance/QuantumNodeWidget.tsx`
  - Widget 2D : `apps/frontend/src/components/resonance/AetherWidget.tsx`
  - Panel d’ancrage : `apps/frontend/src/components/resonance/StakingPanel.tsx`

---

## 2) Modèle de données

### 2.1 Persisted state (localStorage)
Stockage par utilisateur via la clé :
- `cipher-pulse-resonance:${userId}`

Type : `ResonancePersistedState` (dans `ResonanceCore.ts`) :
- `rho: number`
- `lastMessageAt: number | null`
- `lockedUntil: number | null`
- `aether: { available: number; vesting: {amount:number; unlockAt:number}[]; staked: number }`
- `peerRho: Record<string, number>`
- `peerLastSeenAt: Record<string, number>`

### 2.2 Snapshot (pour l’UI)
Type : `ResonanceSnapshot` :
- `rho` (déjà hardcap)
- `baselineRho`
- `lockedUntil`
- `aether: { available; vested; staked; vesting[] }`
- `peerRho`

`vested` est une **vue** : somme des entrées `vesting` encore non débloquées.

---

## 3) Résonance (ρ)

### 3.1 Domaine et baseline
- ρ est borné dans `[0..1]`.
- Une baseline `baselineRho = 0.1` sert de plancher.

### 3.2 Gain de Résonance (après envoi effectif)
Dans `commitOutgoingMessage()` :

1) **Entropy gate** : estimation de qualité du message via `estimateMessageEntropyScore(text)`.
- Entropie de Shannon normalisée, puis pondérée par la longueur (les messages courts ne « trichent » pas).

2) **Rhythm factor** : facteur gaussien centré sur un intervalle cible.
- `targetIntervalMs = 12_000`
- `rhythmSigmaMs = 7_000`

3) Gain final :
- `gain = entropyGate * rhythmFactor`
- `rhoAfter = max(baselineRho, rhoBefore + 0.12 * gain)`

4) **Hardcap stake** appliqué ensuite (voir §5).

### 3.3 Damping (retour vers baseline)
Dans `tick(now)` et `applyDamping(now)` :
- Décroissance exponentielle vers la baseline avec demi-vie : `dampingHalfLifeMs = 6h`.
- Après damping, on réapplique le hardcap stake.

---

## 4) Anti-bot / Anti-spam (Proof of Rhythm + heuristiques)

### 4.1 Signal “cognitif” (rythme de frappe)
Le moteur stocke **en mémoire uniquement** les intervalles entre frappes (jamais persistés).
- `recordKeystroke(now)` alimente `composerIntervalsMs`.

Avant un envoi : `validateSendAttempt()` calcule :
- moyenne, variance, écart-type, coefficient de variation (CV).

Si le rythme est trop régulier (robotique) :
- erreur `COGNITIVE_MISMATCH`
- sanction (voir §6)

### 4.2 Rate limit
Fenêtre anti-spam :
- `spamWindowMs = 10s`
- `spamMaxCount = 50`

Si dépassé : erreur `RATE_LIMITED` + sanction.

### 4.3 ZK “Proof of Rhythm” (prototype)
`ZKProver.ts` implémente un **placeholder** :
- quantification des timings (`DEFAULT_QUANTIZATION_MS = 25`)
- hash SHA-256 sur les buckets quantifiés + nonce

But : simuler une preuve qui **ne révèle pas les timings bruts**.

---

## 5) Aether : mint + vesting + liquidité

### 5.1 Mint
Dans `commitOutgoingMessage()` :
- Mint uniquement si `peerRho(peerId) > rhoAfter` (**gating Web-of-Trust local**) 
- `mintedAether = round(maxAetherPerEvent * gain)` avec `maxAetherPerEvent = 15`

### 5.2 Vesting
Si `mintedAether > 0` :
- entrée `vestingEntry = { amount, unlockAt: now + unlockDelayMs }`

Le vesting est **settle** dans `snapshot(now)` et `tick(now)` :
- toute entrée dont `unlockAt <= now` est transférée vers `aether.available`.

### 5.3 Délai de déblocage (liquidité)
`computeUnlockDelayMs(rho)` :
- délai diminue quand ρ augmente
- forme : `BASE * ((1 - rho) / max(rho, MIN_RHO))^2`
- cap à `180 jours`.

---

## 6) Ancrage (Stake)

### 6.1 États
- **Sauvage** : `stakedAmount == 0`
- **Ancré** : `stakedAmount > 0`

Définition logique dans `AnchoringEngine.ts` :
- `getAnchoringStatus(stakedAmount)` → `SAUVAGE | ANCRE`

### 6.2 Plafond dynamique (hardcap)
Le plafond dépend du stake :
- si `stake == 0` : `rhoMaxStake = 0.35`
- si `stake > 0` : `rhoMaxStake = 0.35 + 0.65 * (stake / stakeTarget)`
  - `stakeTarget = 1000` (prototype)
  - plafonné à `1.0`

Appliqué via :
- `applyStakeHardcap(rhoCalculated, stakedAmount)`
- Intégré dans `ResonanceCore` (constructor, tick, damping, commit).

Effet UX :
- sans stake, impossible d’atteindre les états “or/blanc” à ρ élevé.

### 6.3 Niveau d’ancrage (UI)
Helper : `computeAnchoringLevel(stakedAmount)`
- retourne `0` si sauvage
- sinon un niveau `1..5` en fonction de `stake/stakeTarget` (cap à 5).

---

## 7) Sanctions : lockout vs slashing

Le point clé est : **on ne peut pas slasher quelqu’un sans stake**.

La logique de sanction est centralisée dans :
- `applyAnchoringPenalty({ now, rhoBefore, stakedAmount })`

### 7.1 Cas Sauvage (sans stake)
- `rhoAfter = 0`
- `lockedUntil = now + 30 minutes` (prototype)
- `slashedAmount = 0`

Conséquence : l’utilisateur peut continuer d’utiliser l’app mais l’envoi est temporairement bloqué par le lock.

### 7.2 Cas Ancré (avec stake)
- `slashedAmount = floor(stakedAmount * 10%)`
- `stakedAfter = stakedAmount - slashedAmount`
- `rhoAfter = 0`
- `lockedUntil = null`

Conséquence : pas de “bannissement” UX, mais une perte économique.

---

## 8) Unstake (retrait)

Implémentation dans `ResonanceCore.requestUnstake(amount)` :
- retire immédiatement `amount` de `aether.staked`
- ajoute une entrée `vesting` avec `unlockAt = now + 7 jours`

Effet UX :
- perte immédiate du statut **Ancré** et donc du **cap élevé**.

---

## 9) Intégration UI (boucle de rétroaction)

### 9.1 Widget header (Conversations)
Dans `Conversations.tsx` :
- Affiche `QuantumNodeWidget` (3D)
- Bouton `🛡️` (Ancrer / Identité Ancrée (Niveau X))
- Ouvre une modale (`Dialog`) contenant `StakingPanel`.

### 9.2 Feedback visuel Sauvage vs Ancré
Dans `QuantumNodeWidget.tsx` :
- prop `stakedAmount`
- si `stakedAmount == 0` :
  - matériau plus rugueux (aspect « pierreux/terne »)
  - transmission réduite
  - particules plus instables

---

## 10) Hypothèses & limites du prototype

- Tout est **local client-side** (persisté dans le navigateur), donc :
  - le stake n’est pas “on-chain”
  - le slashing est une mutation locale de `aether.staked`
  - les signaux `peerRho` sont locaux et non vérifiables globalement

Ce design sert à valider :
- la boucle UX (feedback → action → amélioration)
- la cohérence des états Sauvage/Ancré
- la stabilité des règles hardcap/penalty

---

## 11) Checklist de lecture rapide

- ρ monte : messages de meilleure qualité + rythme proche de l’intervalle cible.
- ρ baisse : inactivité (damping) et pénalités.
- Aether : mint si gating peer OK, puis vesting vers available.
- Stake : augmente le cap ρ (hardcap), protège par slashing (au lieu de lockout long).
- Unstake : perte immédiate du statut Ancré + déblocage sous 7 jours.
