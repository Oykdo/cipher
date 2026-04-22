# 🔐 Cipher Desktop

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)

**Secure end-to-end encrypted messenger with blockchain-anchored time-lock and advanced privacy features**

[Features](#-features) • [Installation](#-installation) • [Architecture](#-architecture) • [Security](#-security) • [Contributing](#-contributing)

</div>

<p align="center"><sub><i>Earlier contact addresses were no longer reachable; the emails in this README have been updated.</i></sub></p>

---

## 📖 About

**Cipher Desktop** (formerly Dead Drop / Cipher Pulse) is a next-generation secure messaging application that combines military-grade encryption with innovative privacy features. Built on the Signal Protocol's Double Ratchet algorithm, it ensures perfect forward secrecy while offering unique features like blockchain-anchored time-locked messages and burn-after-reading capabilities.

### 🎯 Core Philosophy

- **Zero-Trust Architecture**: Your keys never leave your device
- **End-to-End Encryption**: Only you and your recipient can read messages
- **Privacy by Design**: No metadata collection, no tracking
- **Decentralization Ready**: P2P communication with relay fallback

---

## 🔮 What's Next — Eidolon Connect

This release is a **preview**. Cipher Desktop is the first public build of a broader vault-based identity product. A future milestone will integrate **Eidolon Connect** — a post-quantum, zero-knowledge authentication protocol where your cryptographic vault is the root of trust, replacing passwords and stored sessions.

Key ideas in preparation:
- **Vault-file login** — no password, no server-held session
- **Zero-knowledge Schnorr proof** of vault possession
- **Post-quantum primitives** (lattice-based signatures)
- **Open-standard SDK** and REST API — designed for third-party integration

Tracked as the v1.2 milestone. Details and public endpoint will be announced separately.

> Cipher Desktop in its current form is the messaging UX testbed. The vault authentication flow will be wired in during the Eidolon Connect integration phase.

---

## ✨ Features

### 🔒 **Advanced Encryption**

- **Double Ratchet Protocol** (Signal Protocol) - Perfect forward secrecy & post-compromise security
- **X3DH Key Agreement** - Extended Triple Diffie-Hellman for secure session establishment
- **AES-256-GCM** - Symmetric encryption for message payloads
- **Ed25519/X25519** - Modern elliptic curve cryptography
- **Argon2id** - Memory-hard password hashing (backend)
- **PBKDF2** - Client-side key derivation

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

Internal security reviews are ongoing. A public audit report will be published once third-party review is completed.

**Known improvement areas (tracked for v1.1):**
- ⚠️ WebSocket / Socket.IO auth hardening
- ⚠️ Key storage migration to IndexedDB
- ⚠️ CSP/CORS tightening
- ⚠️ Client KDF upgrade to Argon2id

### Vulnerability Reporting

If you discover a security vulnerability, please email **[jrzg7f2k@proton.me](mailto:jrzg7f2k@proton.me)** (or create a private security advisory on GitHub). Do not create public issues for security vulnerabilities.

---

## 🛣️ Roadmap

Dates are estimates and may shift as we prioritize security, stability, and shipping.

### v1.0 — Foundation (current, April 2026)
- [x] E2EE v2 (X3DH + Double Ratchet)
- [x] E2EE attachments + burn-after-reading lifecycle
- [x] Blockchain time-lock (block height)
- [x] P2P / WebRTC data channels with LAN discovery + store-and-forward
- [x] Multi-language UI (6 languages)
- [x] Electron desktop builds (Windows / macOS / Linux)

### v1.1 — Stability & security hardening (Q3 2026)
- [ ] KeyVault migration to IndexedDB (reduce local storage risk)
- [ ] WebSocket / Socket.IO hardening (auth + access control + rate limits)
- [ ] CSP / CORS tightening
- [ ] Client KDF upgrade to Argon2id (with migration path)
- [ ] Production observability (actionable logs, health, error reporting)

### v1.2 — Eidolon Connect integration (Q4 2026)
- [ ] Replace password login with vault-based authentication
- [ ] Zero-knowledge Schnorr sign-in via Eidolon Connect
- [ ] Cross-device session handoff (QR-based)
- [ ] Session-less identity — no server-held tokens

### v1.3 — Mobile, UX & collaboration (Q1–Q2 2027)
- [ ] **Cipher Mobile** — iOS + Android companion app (React Native / Expo)
- [ ] Group conversations (initial implementation; MLS research in parallel)
- [ ] Read receipts + typing indicators (opt-in)
- [ ] Better attachment UX (quotas, cleanup, retries)

### v2.0 — Research / advanced features (H2 2027+)
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
| 📧 **Email** | [jrzg7f2k@proton.me](mailto:jrzg7f2k@proton.me) |
| 🐙 **GitHub** | [@Oykdo](https://github.com/Oykdo) |
| 📦 **Repository** | [github.com/Oykdo/cipher](https://github.com/Oykdo/cipher) |
| 🐛 **Issues** | [Report a Bug](https://github.com/Oykdo/cipher/issues) |
| 🔒 **Security** | [jrzg7f2k@proton.me](mailto:jrzg7f2k@proton.me) (use PGP if possible) |

> **Response Time**: We aim to respond within 48 hours for general inquiries and 24 hours for security-related reports.

---

<div align="center">

**Built with ❤️ for privacy and security**

*Your messages, your keys, your control.*

</div>
