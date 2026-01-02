# 🚀 CIPHER PULSE - NOUVELLES FONCTIONNALITÉS

> Document récapitulatif des systèmes Résonance, Aether et Social Echo  
> Version: 1.0 | Date: Janvier 2026

---

## 📋 Table des Matières

1. [Vue d'Ensemble](#-vue-densemble)
2. [Système de Résonance (ρ)](#-système-de-résonance-ρ)
3. [Économie Aether](#-économie-aether)
4. [Social Echo (Lovebomb)](#-social-echo-lovebomb)
5. [Couche Anti-Triche](#-couche-anti-triche)
6. [Tokenomics & Paramètres](#-tokenomics--paramètres)
7. [Composants UI](#-composants-ui)
8. [Architecture Technique](#-architecture-technique)

---

## 🎯 Vue d'Ensemble

Cipher Pulse intègre désormais un **système économique de réputation** basé sur trois piliers :

```
┌─────────────────────────────────────────────────────────────┐
│                    CIPHER PULSE ECONOMY                      │
├─────────────────┬─────────────────┬─────────────────────────┤
│   RÉSONANCE ρ   │     AETHER      │     SOCIAL ECHO         │
│   (Réputation)  │    (Monnaie)    │    (Validation P2P)     │
├─────────────────┼─────────────────┼─────────────────────────┤
│ • Score 0-100%  │ • Minting       │ • Lovebombs             │
│ • Anti-bot      │ • Burning       │ • Proof of Impact       │
│ • Decay naturel │ • Vesting       │ • Diversité validateurs │
│ • Hardcap stake │ • Gas fees      │ • Anti-Sybil            │
└─────────────────┴─────────────────┴─────────────────────────┘
```

---

## 🔮 Système de Résonance (ρ)

### Concept

La **Résonance** (ρ) est un score de réputation entre 0 et 1 (affiché 0-100%) qui mesure la "qualité" d'un utilisateur basée sur son comportement de messagerie.

### Mécanismes

#### 1. Gain de Résonance
```
Δρ = GAIN_SCALE × (entropyScore × rhythmScore)
```

| Facteur | Description | Calcul |
|---------|-------------|--------|
| **Entropy Score** | Diversité des caractères du message | Shannon entropy normalisée |
| **Rhythm Score** | Naturel du rythme de frappe | Gaussienne autour de l'intervalle attendu |

#### 2. Decay (Décroissance)
```
ρ(t) = baseline + (ρ₀ - baseline) × e^(-λt)
```

- **Demi-vie**: 48 heures
- **Baseline**: 0.1 (10%)
- Sans activité, ρ tend vers 10%

#### 3. Protection Anti-Bot

| Vérification | Seuil | Conséquence |
|--------------|-------|-------------|
| Variance keystrokes | < 25ms² | COGNITIVE_MISMATCH → Lock |
| Burst rate | > 12 msg/10s | SPAM_RATE_LIMIT → Lock |
| Intervalle min | < 350ms | Score réduit × 0.1 |

#### 4. Lockout Progressif

```javascript
lockDuration = LOCK_BASE_MS × (1 + 0.5 × (offenseCount - 1))
// Max: LOCK_BASE_MS × 3 (après 5 offenses)
```

Pendant un lockout:
- ρ = 0
- Impossible d'envoyer des messages
- Countdown affiché dans l'UI

---

## 💎 Économie Aether

### Vue d'Ensemble

L'**Aether** est la monnaie interne de Cipher Pulse, utilisée pour les fonctionnalités premium et la validation sociale.

```
┌─────────────────────────────────────────────────┐
│              FLUX AETHER                         │
│                                                  │
│   [MINTING]  ──→  [VESTING]  ──→  [AVAILABLE]   │
│       ↑              │                 │        │
│       │              │                 ↓        │
│   Messages      Temps basé        [BURNING]     │
│   qualité       sur ρ             Gas fees      │
│                                   Lovebombs     │
└─────────────────────────────────────────────────┘
```

### 1. Minting (Création)

**Condition Anti-Sybil**: `ρ_peer > ρ_user`

```javascript
// Vous ne gagnez de l'Aether que si votre interlocuteur a un ρ supérieur
if (peerResonance > userResonance) {
    mintedAether = 15 × quality; // quality = entropy × rhythm
}
```

| Quality Score | Aether Minté |
|---------------|--------------|
| < 0.85 | 0 |
| 0.85 - 1.0 | 1 - 15 |

### 2. Vesting (Déblocage Différé)

L'Aether minté n'est pas immédiatement disponible :

```javascript
vestingDelay = MAX_VESTING_MS × (1 - ρ)^EXPONENT
// Exemple: ρ = 0.8 → delay ≈ 1.4 jours
// Exemple: ρ = 0.2 → delay ≈ 51 jours
```

| ρ | Délai de Vesting |
|---|------------------|
| 0.9 | ~1 heure |
| 0.7 | ~7 jours |
| 0.5 | ~22 jours |
| 0.3 | ~52 jours |
| 0.1 | ~81 jours |

### 3. Burning (Destruction)

L'Aether est brûlé dans plusieurs cas :

| Action | Coût (Aether) |
|--------|---------------|
| Message standard | 0.1 + 0.01/100 chars |
| Pièce jointe | 0.03 |
| Time-Lock | 0.02 |
| Burn After Reading | 0.025 |
| Lovebomb (20% du poids) | Variable |

### 4. Gas Validation

Avant chaque message :
```javascript
gasCost = BASE_COST + (messageLength / 100) × LENGTH_COST;
if (aether.available < gasCost) {
    return { code: 'INSUFFICIENT_AETHER' };
}
```

---

## ⚡ Social Echo (Lovebomb)

### Concept

Le système **Social Echo** permet aux utilisateurs de "valider" les messages des autres via des **Lovebombs**, créant un mécanisme de Proof of Impact.

### Flux Lovebomb

```
┌──────────────┐                    ┌──────────────┐
│  VALIDATEUR  │                    │   CRÉATEUR   │
│   (Sender)   │                    │  (Receiver)  │
├──────────────┤                    ├──────────────┤
│ ρ = 0.7      │   ──── ⚡ ────→   │ ρ = 0.4      │
│              │                    │              │
│ Burn: 1.4 Æ  │                    │ Reçoit: 5.6 Æ│
│ (20% de 7)   │                    │ (80% de 7)   │
└──────────────┘                    └──────────────┘
       │                                   │
       └───────────────┬───────────────────┘
                       │
              Weight = ρ × 10 = 7
```

### Calcul du Poids

```javascript
weight = validatorRho × 10;
// ρ = 0.7 → weight = 7 Aether

burned = weight × 0.2;      // 20% détruit
transferred = weight × 0.8; // 80% au créateur
```

### Conditions de Validation

| Règle | Seuil | Raison |
|-------|-------|--------|
| ρ minimum | ≥ 0.3 | Protection anti-bot |
| ρ validateur > ρ créateur | Strictement | Anti-Sybil |
| Signature Ed25519 | Valide | Preuve de propriété |
| Pas de self-validation | fromUser ≠ toUser | Anti-gaming |
| Une validation/message | Unique | Anti-spam |

### Bonus de Diversité

Pour qu'un message reçoive le bonus complet :
- **≥ 2 validateurs à haut ρ** (≥ 0.7)
- **Score de diversité > 0.5** (validateurs variés)

```javascript
diversityScore = (uniquenessScore × 0.6) + (varianceScore × 0.4);
isEligibleForBonus = (highRhoCount >= 2) && (diversityScore >= 0.5);
```

### UI du Bouton Lovebomb

| État | Apparence | Action |
|------|-----------|--------|
| ρ < 30% | ⚡ grisé | Alert explicative |
| Aether insuffisant | ⚡ grisé | Alert explicative |
| Éligible | ⚡ cyan | Envoie Lovebomb |
| En cours | ⚡ disabled | Loading |

---

## 🛡️ Couche Anti-Triche

### Architecture Event Sourcing

```
┌─────────────────────────────────────────────────────────────┐
│                    INTEGRITY LAYER                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   localStorage  →  EventStore  →  StakeGuard  →  UI         │
│        │              │              │                       │
│        │         [Signature]    [Validation]                 │
│        │          Ed25519        Chain                       │
│        │              │              │                       │
│        └──────────────┴──────────────┘                       │
│                       │                                      │
│              État CALCULÉ, pas STOCKÉ                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Principes de Sécurité

1. **Event Sourcing**: L'état (ρ, Aether) est RECALCULÉ depuis l'historique des événements signés
2. **Chain of Custody**: Chaque événement inclut le hash de l'événement précédent
3. **Signatures Ed25519**: Chaque mutation est signée par la clé privée de l'utilisateur
4. **Détection de tampering**: Modification de localStorage = chaîne invalide

### Types d'Événements

```typescript
type ResonanceEventType =
  | 'GENESIS'           // Création de la chaîne
  | 'MESSAGE_SENT'      // Message envoyé (gain ρ)
  | 'MESSAGE_BLOCKED'   // Message bloqué (lockout)
  | 'LOVEBOMB_SENT'     // Lovebomb envoyé (burn)
  | 'LOVEBOMB_RECEIVED' // Lovebomb reçu (vesting)
  | 'AETHER_MINTED'     // Aether créé
  | 'AETHER_BURNED'     // Aether détruit
  | 'AETHER_UNLOCKED'   // Vesting débloqué
  | 'LOCK_TRIGGERED'    // Lockout déclenché
  | 'LOCK_RELEASED';    // Lockout terminé
```

### Mutex Anti-Race Condition

```javascript
// Protection contre les appels concurrents
if (this.isCommitting) {
    throw new Error('Race condition blocked');
}
this.isCommitting = true;
try {
    // ... opération atomique
} finally {
    this.isCommitting = false;
}
```

---

## 📊 Tokenomics & Paramètres

### Configuration Optimale (V1 Launch)

```json
{
  "rewards": {
    "BASE_REWARD_PER_MESSAGE": 0.08,
    "PIONEER_MULTIPLIER": 3.0,
    "DECAY_DURATION_DAYS": 90,
    "POST_PIONEER_MULTIPLIER": 0.4,
    "MIN_RHO_FOR_EARNING": 0.1,
    "HIGH_RHO_BONUS": 0.3
  },
  "costs": {
    "GAS_COST_PER_MESSAGE": 0.05,
    "GAS_COST_ATTACHMENT": 0.03,
    "GAS_COST_TIME_LOCK": 0.02,
    "GAS_COST_BURN_AFTER_READING": 0.025
  }
}
```

### Programme Pioneer

Les premiers utilisateurs bénéficient d'un multiplicateur de récompenses :

```
Day | Multiplier
----|----------
  0 | 3.0x  ████████████████████████████████
 30 | 2.0x  █████████████████████
 60 | 1.2x  ████████████
 90 | 1.0x  ██████████
180 | 0.6x  ██████
365 | 0.4x  ████
```

### Métriques Cibles

| Métrique | Cible | Description |
|----------|-------|-------------|
| Health Ratio | 1.1 - 1.5 | Minted / Burned (légère inflation) |
| Pioneer Benefit | 3-5x | Avantage des early adopters |
| File Viability | < 5% | Coût fichier / gain journalier |

---

## 🎨 Composants UI

### AetherWidget

Affiche l'état de résonance et le solde Aether dans le header.

```tsx
<AetherWidget
  resonance={0.65}        // Score ρ (0-1)
  resonancePct={65}       // Score affiché (0-100)
  locked={false}          // État de lockout
  lockedUntil={null}      // Timestamp fin lockout
  aetherAvailable={42.5}  // Solde disponible
  aetherVesting={15.2}    // Solde en vesting
/>
```

**Comportement visuel:**
- **Sphère pulsante**: Intensité basée sur ρ
- **Couleur**: Rouge (lock) → Bleu (normal) → Or (high ρ)
- **Countdown**: Affiché si lockedUntil

### ResonanceHalo

Effet visuel autour des messages validés.

```tsx
<ResonanceHalo intensity={0.7}>
  <MessageBubble ... />
</ResonanceHalo>
```

**Apparence:**
- `intensity = 0`: Pas de halo
- `intensity = 0.5`: Halo bleu subtil
- `intensity = 1.0`: Halo violet intense (bonus eligible)

### Bouton Lovebomb (⚡)

Intégré dans `MessageList.tsx`, apparaît au survol des messages reçus.

```tsx
<button
  className={canAmplify ? 'text-quantum-cyan' : 'text-muted-grey'}
  title={canAmplify ? `Coût: ${cost} Æ` : 'ρ insuffisant'}
  onClick={handleAmplify}
>
  ⚡
</button>
```

---

## 🏗️ Architecture Technique

### Structure des Fichiers

```
apps/frontend/src/
├── core/resonance/           # Système legacy
│   ├── ResonanceCore.ts      # Moteur principal
│   ├── AnchoringEngine.ts    # Staking
│   └── ZKProver.ts           # Preuves ZK (placeholder)
│
├── lib/resonance/            # Nouveau système Event Sourcing
│   ├── ResonanceCore.ts      # Version améliorée
│   ├── IntegrityLayer.ts     # Signatures Ed25519
│   ├── ResonanceEventStore.ts # Event Sourcing
│   ├── StakeGuard.ts         # Validation intégrité
│   ├── SocialEcho.ts         # Logique Lovebomb
│   └── ZKProver.ts           # Preuves d'état
│
├── hooks/
│   ├── useResonance.ts       # Hook principal
│   └── useSocialInteractions.ts # Hook Lovebomb
│
├── components/resonance/
│   ├── AetherWidget.tsx      # Widget header
│   ├── ResonanceHalo.tsx     # Effet visuel
│   └── AmplifyButton.tsx     # Bouton Lovebomb
│
└── services/
    └── SocialEcho.ts         # Utilitaires validation
```

### Flux de Données

```
User Action
    │
    ▼
┌─────────────────┐
│  useResonance   │ ←── Hook React
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  ResonanceCore  │ ←── Logique métier
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   EventStore    │ ←── Persistance événements
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  IntegrityLayer │ ←── Signatures Ed25519
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  localStorage   │ ←── Stockage local
└─────────────────┘
```

---

## 📝 Changelog

### v1.0.0 (Janvier 2026)

**Nouvelles fonctionnalités:**
- ✅ Système de Résonance (ρ) avec decay et anti-bot
- ✅ Économie Aether (minting, vesting, burning)
- ✅ Social Echo / Lovebomb (validation P2P)
- ✅ Anti-Cheat Layer (Event Sourcing + Ed25519)
- ✅ Programme Pioneer avec multiplicateur décroissant
- ✅ Gas validation avant envoi de message
- ✅ UI: AetherWidget, ResonanceHalo, Bouton ⚡

**Sécurité:**
- ✅ Mutex sur opérations critiques (race conditions)
- ✅ Signature Ed25519 pour Lovebombs
- ✅ Règle anti-Sybil (ρ_peer > ρ_user)
- ✅ Chain of Custody pour événements
- ✅ Détection de tampering localStorage

**Optimisations:**
- ✅ IntersectionObserver pour animation RAF
- ✅ Paramètres tokenomics optimisés via simulation

---

## 🔗 Références

- **Audit de Sécurité**: `AUDIT_REPORT.md`
- **Architecture Résonance**: `RESONANCE_ARCHITECTURE.md`
- **Ancrage Aether**: `RESONANCE_AETHER_ANCRAGE.md`
- **Configuration Launch**: `apps/frontend/src/lib/resonance/launch-config.json`

---

*Document généré le 2 Janvier 2026 - Cipher Pulse Team*
