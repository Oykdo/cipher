# 🔐 Cipher Pulse (Dead Drop)

<div align="center">

![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)

**Secure end-to-end encrypted messenger with blockchain-anchored time-lock, dynamic reputation system, and advanced privacy features**

[Features](#-features) • [Aether & Resonance](#-aether--resonance-system-v1) • [Installation](#-installation) • [Architecture](#-architecture) • [Security](#-security) • [Contributing](#-contributing)

</div>

---

## 📖 About

**Cipher Pulse** (formerly Dead Drop) is a next-generation secure messaging application that combines military-grade encryption with innovative privacy features. Built on the Signal Protocol's Double Ratchet algorithm, it ensures perfect forward secrecy while offering unique features like blockchain-anchored time-locked messages and burn-after-reading capabilities.

### 🎯 Core Philosophy

- **Zero-Trust Architecture**: Your keys never leave your device
- **End-to-End Encryption**: Only you and your recipient can read messages
- **Privacy by Design**: No metadata collection, no tracking
- **Decentralization Ready**: P2P communication with relay fallback

---

## ✨ Features

### 🔒 **Advanced Encryption**

- **Double Ratchet Protocol** (Signal Protocol) - Perfect forward secrecy & post-compromise security
- **X3DH Key Agreement** - Extended Triple Diffie-Hellman for secure session establishment
- **AES-256-GCM** - Symmetric encryption for message payloads
- **Ed25519/X25519** - Modern elliptic curve cryptography
- **Argon2id** - Memory-hard password hashing (backend)
- **PBKDF2** - Client-side key derivation with 100,000 iterations

### ⏰ **Time-Lock Messages**

Messages can be locked until a specific time using **blockchain anchoring**:
- Bitcoin integration for tamper-proof timestamps
- Cryptographic proof of time-lock validity
- Impossible to unlock before scheduled time (even by you!)
- Use cases: scheduled announcements, posthumous messages, time capsules

### 🔥 **Burn After Reading**

Self-destructing messages with configurable timers:
- **5 seconds** - Ultra-sensitive information
- **30 seconds** - Quick verification codes
- **1 minute** - Temporary instructions
- **5 minutes** - Short-lived conversations

Messages are permanently deleted from all devices after being read once.

### 🎲 **DiceKey Authentication**

Physical security key authentication using the [DiceKey system](https://dicekeys.com):
- **775 bits of entropy** (vs 256 bits for standard 24-word seeds)
- Hardware-based seed generation
- Immune to keyloggers and shoulder surfing
- Compatible with BIP-39 standard (6-word recovery phrase)

### 🌐 **Peer-to-Peer Communication**

Direct device-to-device messaging:
- **WebRTC** data channels for low-latency communication
- **LAN discovery** - Automatic peer detection on local networks
- **DHT bootstrap** - Decentralized peer discovery
- **Store & Forward** - Relay messages when recipient is offline
- **NAT traversal** - Works behind firewalls and routers

### 🌍 **Multi-Language Support**

Full internationalization with native translations:
- 🇬🇧 English
- 🇫🇷 Français
- 🇩🇪 Deutsch
- 🇪🇸 Español
- 🇮🇹 Italiano
- 🇨🇳 中文 (简体)

### 🛡️ **Privacy & Security**

- **SRP Authentication** (Secure Remote Password) - Zero-knowledge password protocol
- **JWT with Refresh Tokens** - Secure session management
- **CSRF Protection** - Cross-site request forgery prevention
- **Rate Limiting** - Protection against brute-force attacks
- **Content Security Policy** - XSS mitigation
- **HTTPS Enforcement** - Encrypted transport layer
- **Audit Logging** - Security event tracking

### 🔍 **Trust Star**

Visual representation of your trust network:
- 3D interactive graph of connections
- Trust levels visualization
- Network analysis for security awareness

---

## ⚡ Aether & Resonance System (V1)

> *"Your reputation is earned through action, not claimed through identity."*

Cipher Pulse introduces a revolutionary **Cognitive Proof-of-Work** economic model that rewards meaningful interactions while protecting against bots and Sybil attacks.

### 🌊 **Resonance (ρ)**

Your **Resonance** is a dynamic reputation score ranging from `0.0` to `1.0`, computed locally from your messaging behavior:

| Factor | Description |
|--------|-------------|
| **Message Entropy** | Diversity and complexity of your communications |
| **Rhythm Analysis** | Consistency of your activity patterns over time |
| **Peer Validation** | Social proof from other high-ρ users (Lovebombs) |

```
ρ_new = ρ_old × decay + Δ_message × entropy_weight
```

**Key Properties:**
- 🔒 **Locally Computed** — Your ρ never leaves your device unencrypted
- 📉 **Natural Decay** — Inactivity gradually reduces your score
- 🛡️ **Anti-Bot** — Low-entropy spam is heavily penalized
- 🔗 **Verifiable** — ZK-proofs attest your ρ without revealing history

### 💎 **Aether (Æ)**

**Aether** is the internal energy token that powers advanced privacy features:

| Action | Aether Cost |
|--------|-------------|
| Standard Message | Free |
| Time-Lock Encryption | ~0.05 Æ |
| Burn-After-Reading | ~0.03 Æ |
| File Attachment (encrypted) | ~0.03 Æ |
| High-Priority Relay | ~0.10 Æ |

**Earning Aether:**
- 📨 **Quality Messages** — High-entropy interactions mint new Æ
- 🎁 **Pioneer Program** — Early adopters receive a 3× multiplier (decays over 90 days)
- ⚡ **Lovebomb Validation** — Receive Æ when peers validate your messages

**Economic Balance:**
- Health Ratio target: **1.4–1.5** (slight inflation encourages activity)
- 20% of Lovebomb Æ is burned (deflationary pressure)
- Gas fees create natural scarcity

### ⚓ **Staking (Anchoring)**

**Anchor** your identity by staking Aether to gain enhanced capabilities:

| Benefit | Requirement |
|---------|-------------|
| Raise ρ_max cap | Stake ≥ 10 Æ |
| Sybil Protection | Stake ≥ 50 Æ |
| Priority P2P Routing | Stake ≥ 100 Æ |
| Governance Weight | Proportional to stake |

Staking creates **economic skin-in-the-game**, making account farming economically irrational.

### 🌌 **The Quantum Node**

A real-time **3D visualization** (Three.js) representing your current state:

- **Core Glow** — Brightness = current Resonance level
- **Orbital Rings** — Aether balance & vesting schedule
- **Particle Field** — Recent activity & peer connections
- **Pulse Animation** — Heartbeat synced to message rhythm

The Quantum Node transforms abstract metrics into an intuitive, cyberpunk-inspired interface.

### 📊 **Social Echo (Lovebombs)**

Peer-to-peer validation system:

1. **Send Lovebomb** — Validate another user's message (costs 0.02 Æ)
2. **Receive Validation** — Creator gets 80% of the Æ, 20% is burned
3. **Resonance Boost** — Validated messages increase ρ faster
4. **Visual Halo** — Validated messages glow with a resonance aura

**Anti-Sybil Rules:**
- Validator must have higher ρ than creator
- Minimum diversity requirement (≥2 unique validators)
- Low-ρ validators (<0.3) are rejected

> 📖 For technical deep-dive, see [**RESONANCE_ARCHITECTURE.md**](./RESONANCE_ARCHITECTURE.md)

---

## 🚀 Installation

### Prerequisites

- **Node.js** 22.x LTS or higher
- **PostgreSQL** 15+ (or cloud PostgreSQL like Neon/Supabase)
- **Git**

### Quick Start (Development)

```bash
# Clone the repository
git clone https://github.com/Oykdo/cipher.git
cd cipher

# Install dependencies
npm install

# Set up environment variables
cp apps/bridge/.env.example apps/bridge/.env
# Edit apps/bridge/.env with your configuration

# Run database migrations
cd apps/bridge
npm run db:migrate
cd ../..

# Start development servers (Backend + Frontend + Electron)
npm run dev
```

The application will automatically open in Electron. The web interface is available at:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:4000

### Desktop Application Build

```bash
# Build for your platform
npm run build:win      # Windows (NSIS installer)
npm run build:mac      # macOS (DMG + ZIP)
npm run build:linux    # Linux (AppImage + DEB)
```

---

## 🏗️ Architecture

### Tech Stack

#### Frontend
- **React 19** with TypeScript
- **Vite** - Lightning-fast build tool
- **Zustand** - Lightweight state management
- **Framer Motion** - Smooth animations
- **i18next** - Internationalization
- **libsodium-wrappers** - Cryptographic operations
- **Socket.IO Client** - Real-time communication

#### Backend
- **Node.js 22** with TypeScript
- **Fastify** - High-performance HTTP framework
- **PostgreSQL** - Primary database
- **Socket.IO** - WebSocket server
- **Argon2** - Password hashing
- **JWT** - Authentication tokens
- **Zod** - Runtime type validation

#### Desktop
- **Electron 30** - Cross-platform desktop application

### Project Structure

```
cipher-pulse/
├── apps/
│   ├── bridge/              # Backend API
│   │   ├── src/
│   │   │   ├── routes/      # API endpoints
│   │   │   ├── services/    # Business logic
│   │   │   ├── db/          # Database layer
│   │   │   ├── websocket/   # WebSocket handlers
│   │   │   └── middleware/  # Security & validation
│   │   └── package.json
│   │
│   └── frontend/            # React frontend
│       ├── src/
│       │   ├── screens/     # Main pages
│       │   ├── components/  # Reusable UI components
│       │   ├── lib/         # Core libraries
│       │   │   ├── e2ee/    # E2EE implementation
│       │   │   ├── p2p/     # P2P networking
│       │   │   └── backup/  # Backup & recovery
│       │   ├── hooks/       # React hooks
│       │   ├── services/    # API clients
│       │   └── store/       # State management
│       └── package.json
│
├── main.js                  # Electron main process
├── preload.cjs              # Electron preload script
└── package.json             # Root package
```

### Security Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION FLOW                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Client                           Server                    │
│    │                                │                       │
│    │──── SRP Init (A) ─────────────►│                       │
│    │◄─── salt, B, sessionId ────────│                       │
│    │                                │                       │
│    │──── SRP Verify (M1) ──────────►│                       │
│    │◄─── M2, JWT tokens ────────────│                       │
│    │                                │                       │
│  masterKey stays LOCAL (never sent to server)               │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    E2EE MESSAGE FLOW                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Alice                            Bob                       │
│    │                                │                       │
│    │──── KeyBundle (prekeys) ──────►│                       │
│    │◄─── KeyBundle (prekeys) ───────│                       │
│    │                                │                       │
│    │     Double Ratchet Session     │                       │
│    │◄──────────────────────────────►│                       │
│    │                                │                       │
│    │──── Encrypted Message ────────►│                       │
│    │     (Server can't decrypt)     │                       │
│    │◄─── Encrypted Response ────────│                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Database Schema (PostgreSQL)

| Table | Purpose |
|-------|---------|
| `users` | User accounts (email, passwordHash, publicKeys) |
| `conversations` | Conversation metadata |
| `messages` | Encrypted message payloads |
| `conversation_members` | Many-to-many relationship |
| `conversation_requests` | Pending conversation invitations |
| `key_bundles` | E2EE public key bundles (X3DH) |
| `x3dh_sessions` | Active E2EE sessions |
| `settings` | User preferences |
| `attachments` | File metadata |
| `refresh_tokens` | JWT refresh tokens |
| `audit_logs` | Security events |

---

## 🔒 Security

### Cryptographic Primitives

| Algorithm | Usage | Key Size |
|-----------|-------|----------|
| **Ed25519** | Digital signatures | 256 bits |
| **X25519** | Key exchange (ECDH) | 256 bits |
| **AES-256-GCM** | Message encryption | 256 bits |
| **Argon2id** | Password hashing | N/A |
| **PBKDF2-SHA512** | Key derivation | N/A |
| **SHA-512** | Hashing | N/A |
| **HKDF-SHA256** | Key expansion | N/A |

### Threat Model

**Protected Against:**
- ✅ Man-in-the-middle attacks (E2EE)
- ✅ Server compromise (Zero-knowledge architecture)
- ✅ Network eavesdropping (TLS + E2EE)
- ✅ Brute-force attacks (Rate limiting + Argon2id)
- ✅ Replay attacks (Nonces + timestamps)
- ✅ Key compromise (Perfect forward secrecy)
- ✅ XSS attacks (CSP + DOMPurify)
- ✅ CSRF attacks (CSRF tokens)
- ✅ SQL injection (Parameterized queries)

**Not Protected Against:**
- ❌ Device compromise (malware, physical access)
- ❌ Quantum computers (future threat - post-quantum crypto planned)
- ❌ Social engineering
- ❌ Screen capturing / keyloggers

### Security Audit

A comprehensive security audit report is available in [`SECURITY_AUDIT_REPORT.md`](./SECURITY_AUDIT_REPORT.md).

**Key Findings:**
- ✅ Strong cryptographic implementation
- ⚠️ WebSocket access control improvements needed (addressed in v1.0)
- ⚠️ Key storage migration to IndexedDB recommended (planned for v1.1)

### Vulnerability Reporting

If you discover a security vulnerability, please email **[therealcipherpulse@proton.me](mailto:therealcipherpulse@proton.me)** (or create a private security advisory on GitHub). Do not create public issues for security vulnerabilities.

---

## 🎨 Screenshots

_Coming soon_

---

## 📚 Documentation

- [**Deployment Guide**](./DEPLOYMENT_GUIDE.md) - Production deployment instructions
- [**Components Overview**](./COMPONENTS_OVERVIEW.md) - Detailed architecture documentation
- [**Security Audit**](./SECURITY_AUDIT_REPORT.md) - Security analysis and recommendations
- [**DiceKey POC**](./POC_DICEKEY.md) - DiceKey authentication implementation
- [**Time-Lock POC**](./POC_TIMELOCK_BLOCKCHAIN.md) - Blockchain time-lock implementation
- [**X3DH + Double Ratchet**](./X3DH_DOUBLE_RATCHET_IMPLEMENTATION_PLAN.md) - E2EE protocol details

---

## 🛣️ Roadmap

Dates are estimates and may shift as we prioritize security, stability, and shipping.

### Version 1.0 (Dec 2025) — Foundation
- [x] Web deployment (Bridge + Frontend)
- [x] E2EE v2 foundation (X3DH + Double Ratchet)
- [x] E2EE attachments + burn-after-reading lifecycle
- [x] Blockchain time-lock (block height)

### Version 1.1 (Jan 2026) — Aether & Resonance ✨ **CURRENT**
- [x] **Resonance (ρ)** — Dynamic reputation system with Cognitive PoW
- [x] **Aether (Æ)** — Internal token economy (minting, vesting, burning)
- [x] **Social Echo** — Peer-to-peer Lovebomb validation system
- [x] **Quantum Node** — Real-time 3D visualization (Three.js)
- [x] **Pioneer Program** — 3× multiplier for early adopters
- [x] **Anti-Cheat Layer** — Event Sourcing with Ed25519 signatures
- [x] **Gas System** — Privacy features cost Aether

### Version 1.2 (Q1 2026) — Stability & security hardening
- [ ] KeyVault migration to IndexedDB (reduce local storage risk)
- [ ] WebSocket/Socket.IO hardening (auth + access control + rate limits)
- [ ] CSP/CORS hardening pass (reduce false positives, keep strict scripts)
- [ ] Production observability (actionable logs, health, error reporting)

### Version 1.3 (Q2 2026) — UX & collaboration
- [ ] Group conversations (initial implementation; MLS research in parallel)
- [ ] Read receipts + typing indicators (opt-in)
- [ ] Better attachment UX (quotas, cleanup, retries)

### Version 2.0 (H2 2026+) — Research / advanced features
- [ ] PQC hybrid key exchange (Kyber) behind a feature flag
- [ ] Federation / interoperability (server-to-server)
- [ ] Tor support (onion endpoint option)
- [ ] DID / ZK privacy exploration
- [ ] Voice & video calls (encrypted)

---

## 🤝 Contributing

We welcome contributions! Please see our [**Contributing Guide**](./CONTRIBUTING.md) for details.

### Development Setup

```bash
# Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/cipher.git
cd cipher

# Create a feature branch
git checkout -b feature/your-feature-name

# Install dependencies
npm install

# Run tests
npm test

# Make your changes and commit
git commit -m "feat: add amazing feature"

# Push to your fork
git push origin feature/your-feature-name

# Create a Pull Request
```

### Code of Conduct

This project adheres to the Contributor Covenant [Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

---

## 💖 Support the Project

If you find Cipher Pulse useful, consider supporting its development:

### Cryptocurrency Donations

| Currency | Address |
|----------|---------|
| **Bitcoin (BTC)** | `bc1pqu5zya672tma8q36ww9c6mzk7uryq6cuavqn04jqka43qjm6nxtqs8am6t` |
| **EVM (0x)** | `0x979a6093d3a1662054b89667e6dbfac001fa2617` |
| **Solana (SOL)** | `HshrizaXzs6i6yse3YjkpDsQ4S7WjRoDALeVr6tN1yM8` |
| **XRP (XRP)** | `rspbrWJkPr8jSyz9wVVLwpxuSfosBM8ocM` |
| **Pi** | `GCUGVJDK4TY6KTVWFYXTDH2OXRSTTFQUYPLU2CH523AHCZOPWUVEVDC6` |

### Other Ways to Support

- ⭐ Star this repository
- 🐛 Report bugs and issues
- 📖 Improve documentation
- 💻 Contribute code
- 🌍 Translate to your language
- 📢 Spread the word

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](./LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Signal Foundation** - For the Double Ratchet protocol specification
- **libsodium** - For excellent cryptographic primitives
- **The Diceware Project** - For human-memorable passphrases
- **Bitcoin Core** - For blockchain time-locking inspiration
- All contributors who have helped make this project possible

---

## 📞 Contact & Support

We'd love to hear from you! Whether you have feedback, feature requests, or want to report a bug:

| Channel | Details |
|---------|---------|
| 📧 **Email** | [therealcipherpulse@proton.me](mailto:therealcipherpulse@proton.me) |
| 🐙 **GitHub** | [@Oykdo](https://github.com/Oykdo) |
| 📦 **Repository** | [github.com/Oykdo/cipher](https://github.com/Oykdo/cipher) |
| 🐛 **Issues** | [Report a Bug](https://github.com/Oykdo/cipher/issues) |
| 🔒 **Security** | [therealcipherpulse@proton.me](mailto:therealcipherpulse@proton.me) (use PGP if possible) |

> **Response Time**: We aim to respond within 48 hours for general inquiries and 24 hours for security-related reports.

---

<div align="center">

**Built with ❤️ for privacy and security**

*Your messages, your keys, zero trust.*

</div>
