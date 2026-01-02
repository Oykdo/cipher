# 🚀 CIPHER PULSE - NEW FEATURES

> Summary document for Resonance, Aether and Social Echo systems  
> Version: 1.0 | Date: January 2026

---

## 📋 Table of Contents

1. [Overview](#-overview)
2. [Resonance System (ρ)](#-resonance-system-ρ)
3. [Aether Economy](#-aether-economy)
4. [Social Echo (Lovebomb)](#-social-echo-lovebomb)
5. [Anti-Cheat Layer](#-anti-cheat-layer)
6. [Tokenomics & Parameters](#-tokenomics--parameters)
7. [UI Components](#-ui-components)
8. [Technical Architecture](#-technical-architecture)

---

## 🎯 Overview

Cipher Pulse now integrates a **reputation-based economic system** built on three pillars:

```
┌─────────────────────────────────────────────────────────────┐
│                    CIPHER PULSE ECONOMY                      │
├─────────────────┬─────────────────┬─────────────────────────┤
│   RESONANCE ρ   │     AETHER      │     SOCIAL ECHO         │
│   (Reputation)  │    (Currency)   │    (P2P Validation)     │
├─────────────────┼─────────────────┼─────────────────────────┤
│ • Score 0-100%  │ • Minting       │ • Lovebombs             │
│ • Anti-bot      │ • Burning       │ • Proof of Impact       │
│ • Natural decay │ • Vesting       │ • Validator diversity   │
│ • Stake hardcap │ • Gas fees      │ • Anti-Sybil            │
└─────────────────┴─────────────────┴─────────────────────────┘
```

---

## 🔮 Resonance System (ρ)

### Concept

**Resonance** (ρ) is a reputation score between 0 and 1 (displayed as 0-100%) that measures a user's "quality" based on their messaging behavior.

### Mechanisms

#### 1. Resonance Gain
```
Δρ = GAIN_SCALE × (entropyScore × rhythmScore)
```

| Factor | Description | Calculation |
|--------|-------------|-------------|
| **Entropy Score** | Message character diversity | Normalized Shannon entropy |
| **Rhythm Score** | Natural typing rhythm | Gaussian around expected interval |

#### 2. Decay

```
ρ(t) = baseline + (ρ₀ - baseline) × e^(-λt)
```

- **Half-life**: 48 hours
- **Baseline**: 0.1 (10%)
- Without activity, ρ tends toward 10%

#### 3. Anti-Bot Protection

| Check | Threshold | Consequence |
|-------|-----------|-------------|
| Keystroke variance | < 25ms² | COGNITIVE_MISMATCH → Lock |
| Burst rate | > 12 msg/10s | SPAM_RATE_LIMIT → Lock |
| Minimum interval | < 350ms | Score reduced × 0.1 |

#### 4. Progressive Lockout

```javascript
lockDuration = LOCK_BASE_MS × (1 + 0.5 × (offenseCount - 1))
// Max: LOCK_BASE_MS × 3 (after 5 offenses)
```

During a lockout:
- ρ = 0
- Unable to send messages
- Countdown displayed in UI

---

## 💎 Aether Economy

### Overview

**Aether** is Cipher Pulse's internal currency, used for premium features and social validation.

```
┌─────────────────────────────────────────────────┐
│              AETHER FLOW                         │
│                                                  │
│   [MINTING]  ──→  [VESTING]  ──→  [AVAILABLE]   │
│       ↑              │                 │        │
│       │              │                 ↓        │
│   Quality       Time based        [BURNING]     │
│   messages      on ρ              Gas fees      │
│                                   Lovebombs     │
└─────────────────────────────────────────────────┘
```

### 1. Minting (Creation)

**Anti-Sybil Condition**: `ρ_peer > ρ_user`

```javascript
// You only earn Aether if your conversation partner has a higher ρ
if (peerResonance > userResonance) {
    mintedAether = 15 × quality; // quality = entropy × rhythm
}
```

| Quality Score | Aether Minted |
|---------------|---------------|
| < 0.85 | 0 |
| 0.85 - 1.0 | 1 - 15 |

### 2. Vesting (Delayed Unlock)

Minted Aether is not immediately available:

```javascript
vestingDelay = MAX_VESTING_MS × (1 - ρ)^EXPONENT
// Example: ρ = 0.8 → delay ≈ 1.4 days
// Example: ρ = 0.2 → delay ≈ 51 days
```

| ρ | Vesting Delay |
|---|---------------|
| 0.9 | ~1 hour |
| 0.7 | ~7 days |
| 0.5 | ~22 days |
| 0.3 | ~52 days |
| 0.1 | ~81 days |

### 3. Burning (Destruction)

Aether is burned in several cases:

| Action | Cost (Aether) |
|--------|---------------|
| Standard message | 0.1 + 0.01/100 chars |
| Attachment | 0.03 |
| Time-Lock | 0.02 |
| Burn After Reading | 0.025 |
| Lovebomb (20% of weight) | Variable |

### 4. Gas Validation

Before each message:
```javascript
gasCost = BASE_COST + (messageLength / 100) × LENGTH_COST;
if (aether.available < gasCost) {
    return { code: 'INSUFFICIENT_AETHER' };
}
```

---

## ⚡ Social Echo (Lovebomb)

### Concept

The **Social Echo** system allows users to "validate" others' messages via **Lovebombs**, creating a Proof of Impact mechanism.

### Lovebomb Flow

```
┌──────────────┐                    ┌──────────────┐
│  VALIDATOR   │                    │   CREATOR    │
│   (Sender)   │                    │  (Receiver)  │
├──────────────┤                    ├──────────────┤
│ ρ = 0.7      │   ──── ⚡ ────→   │ ρ = 0.4      │
│              │                    │              │
│ Burn: 1.4 Æ  │                    │ Receives:5.6Æ│
│ (20% of 7)   │                    │ (80% of 7)   │
└──────────────┘                    └──────────────┘
       │                                   │
       └───────────────┬───────────────────┘
                       │
              Weight = ρ × 10 = 7
```

### Weight Calculation

```javascript
weight = validatorRho × 10;
// ρ = 0.7 → weight = 7 Aether

burned = weight × 0.2;      // 20% destroyed
transferred = weight × 0.8; // 80% to creator
```

### Validation Conditions

| Rule | Threshold | Reason |
|------|-----------|--------|
| Minimum ρ | ≥ 0.3 | Anti-bot protection |
| Validator ρ > creator ρ | Strictly | Anti-Sybil |
| Ed25519 signature | Valid | Proof of ownership |
| No self-validation | fromUser ≠ toUser | Anti-gaming |
| One validation/message | Unique | Anti-spam |

### Diversity Bonus

For a message to receive the full bonus:
- **≥ 2 high ρ validators** (≥ 0.7)
- **Diversity score > 0.5** (varied validators)

```javascript
diversityScore = (uniquenessScore × 0.6) + (varianceScore × 0.4);
isEligibleForBonus = (highRhoCount >= 2) && (diversityScore >= 0.5);
```

### Lovebomb Button UI

| State | Appearance | Action |
|-------|------------|--------|
| ρ < 30% | ⚡ grayed | Explanatory alert |
| Insufficient Aether | ⚡ grayed | Explanatory alert |
| Eligible | ⚡ cyan | Sends Lovebomb |
| In progress | ⚡ disabled | Loading |

---

## 🛡️ Anti-Cheat Layer

### Event Sourcing Architecture

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
│              State COMPUTED, not STORED                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Security Principles

1. **Event Sourcing**: State (ρ, Aether) is RECALCULATED from signed event history
2. **Chain of Custody**: Each event includes the hash of the previous event
3. **Ed25519 Signatures**: Every mutation is signed by the user's private key
4. **Tampering Detection**: localStorage modification = invalid chain

### Event Types

```typescript
type ResonanceEventType =
  | 'GENESIS'           // Chain creation
  | 'MESSAGE_SENT'      // Message sent (ρ gain)
  | 'MESSAGE_BLOCKED'   // Message blocked (lockout)
  | 'LOVEBOMB_SENT'     // Lovebomb sent (burn)
  | 'LOVEBOMB_RECEIVED' // Lovebomb received (vesting)
  | 'AETHER_MINTED'     // Aether created
  | 'AETHER_BURNED'     // Aether destroyed
  | 'AETHER_UNLOCKED'   // Vesting unlocked
  | 'LOCK_TRIGGERED'    // Lockout triggered
  | 'LOCK_RELEASED';    // Lockout ended
```

### Anti-Race Condition Mutex

```javascript
// Protection against concurrent calls
if (this.isCommitting) {
    throw new Error('Race condition blocked');
}
this.isCommitting = true;
try {
    // ... atomic operation
} finally {
    this.isCommitting = false;
}
```

---

## 📊 Tokenomics & Parameters

### Optimal Configuration (V1 Launch)

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

### Pioneer Program

Early users benefit from a reward multiplier:

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

### Target Metrics

| Metric | Target | Description |
|--------|--------|-------------|
| Health Ratio | 1.1 - 1.5 | Minted / Burned (slight inflation) |
| Pioneer Benefit | 3-5x | Early adopter advantage |
| File Viability | < 5% | File cost / daily earnings |

---

## 🎨 UI Components

### AetherWidget

Displays resonance state and Aether balance in the header.

```tsx
<AetherWidget
  resonance={0.65}        // ρ score (0-1)
  resonancePct={65}       // Displayed score (0-100)
  locked={false}          // Lockout state
  lockedUntil={null}      // Lockout end timestamp
  aetherAvailable={42.5}  // Available balance
  aetherVesting={15.2}    // Vesting balance
/>
```

**Visual behavior:**
- **Pulsing sphere**: Intensity based on ρ
- **Color**: Red (lock) → Blue (normal) → Gold (high ρ)
- **Countdown**: Displayed if lockedUntil

### ResonanceHalo

Visual effect around validated messages.

```tsx
<ResonanceHalo intensity={0.7}>
  <MessageBubble ... />
</ResonanceHalo>
```

**Appearance:**
- `intensity = 0`: No halo
- `intensity = 0.5`: Subtle blue halo
- `intensity = 1.0`: Intense purple halo (bonus eligible)

### Lovebomb Button (⚡)

Integrated in `MessageList.tsx`, appears on hover over received messages.

```tsx
<button
  className={canAmplify ? 'text-quantum-cyan' : 'text-muted-grey'}
  title={canAmplify ? `Cost: ${cost} Æ` : 'Insufficient ρ'}
  onClick={handleAmplify}
>
  ⚡
</button>
```

---

## 🏗️ Technical Architecture

### File Structure

```
apps/frontend/src/
├── core/resonance/           # Legacy system
│   ├── ResonanceCore.ts      # Main engine
│   ├── AnchoringEngine.ts    # Staking
│   └── ZKProver.ts           # ZK proofs (placeholder)
│
├── lib/resonance/            # New Event Sourcing system
│   ├── ResonanceCore.ts      # Improved version
│   ├── IntegrityLayer.ts     # Ed25519 signatures
│   ├── ResonanceEventStore.ts # Event Sourcing
│   ├── StakeGuard.ts         # Integrity validation
│   ├── SocialEcho.ts         # Lovebomb logic
│   └── ZKProver.ts           # State proofs
│
├── hooks/
│   ├── useResonance.ts       # Main hook
│   └── useSocialInteractions.ts # Lovebomb hook
│
├── components/resonance/
│   ├── AetherWidget.tsx      # Header widget
│   ├── ResonanceHalo.tsx     # Visual effect
│   └── AmplifyButton.tsx     # Lovebomb button
│
└── services/
    └── SocialEcho.ts         # Validation utilities
```

### Data Flow

```
User Action
    │
    ▼
┌─────────────────┐
│  useResonance   │ ←── React Hook
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  ResonanceCore  │ ←── Business logic
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   EventStore    │ ←── Event persistence
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  IntegrityLayer │ ←── Ed25519 signatures
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  localStorage   │ ←── Local storage
└─────────────────┘
```

---

## 📝 Changelog

### v1.0.0 (January 2026)

**New features:**
- ✅ Resonance (ρ) system with decay and anti-bot
- ✅ Aether economy (minting, vesting, burning)
- ✅ Social Echo / Lovebomb (P2P validation)
- ✅ Anti-Cheat Layer (Event Sourcing + Ed25519)
- ✅ Pioneer program with decaying multiplier
- ✅ Gas validation before message send
- ✅ UI: AetherWidget, ResonanceHalo, ⚡ Button

**Security:**
- ✅ Mutex on critical operations (race conditions)
- ✅ Ed25519 signature for Lovebombs
- ✅ Anti-Sybil rule (ρ_peer > ρ_user)
- ✅ Chain of Custody for events
- ✅ localStorage tampering detection

**Optimizations:**
- ✅ IntersectionObserver for RAF animation
- ✅ Tokenomics parameters optimized via simulation

---

## 🔗 References

- **Security Audit**: `AUDIT_REPORT.md`
- **Resonance Architecture**: `RESONANCE_ARCHITECTURE.md`
- **Aether Anchoring**: `RESONANCE_AETHER_ANCRAGE.md`
- **Launch Configuration**: `apps/frontend/src/lib/resonance/launch-config.json`

---

*Document generated on January 2, 2026 - Cipher Pulse Team*
