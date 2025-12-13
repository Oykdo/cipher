# 🔐 Cipher Pulse (Dead Drop)

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)

**Secure end-to-end encrypted messenger with blockchain-anchored time-lock and advanced privacy features**

[Features](#-features) • [Installation](#-installation) • [Architecture](#-architecture) • [Security](#-security) • [Contributing](#-contributing)

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
- **Electron 35** - Cross-platform desktop application

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
- ❌ Quantum computers (future threat - see the Post-Quantum section below)
- ❌ Social engineering
- ❌ Screen capturing / keyloggers

### Post-Quantum Security (PQS)

Large-scale quantum computers would change the security landscape for widely-used public-key cryptography:

- **Shor’s algorithm** can break the math behind most **RSA/ECC** systems. In practice, that puts **X25519/Ed25519-style** primitives at risk once a sufficiently capable quantum computer exists.
- This enables the **“store now, decrypt later”** threat: an adversary can record encrypted traffic today and decrypt it in the future.
- **Grover’s algorithm** reduces the effective strength of symmetric primitives, which is why we already use **AES-256**-class parameters and conservative KDF settings.

Why we’re working on PQS now:

1. **Migration takes time** (protocol design, interoperability, testing, and rollout).
2. We want a **backwards-compatible** path that doesn’t break existing users.
3. We want to keep the current security properties (E2EE, PFS, post-compromise security) while adding post-quantum resistance.

Our approach is a **hybrid** handshake and identity scheme:

- **Hybrid key establishment**: classical X25519 + **ML-KEM (Kyber)**
- **Hybrid signatures**: classical Ed25519 + **ML-DSA (Dilithium)**

As long as *either* side of the hybrid remains unbroken, the resulting session remains secure.

Design notes and integration plan: **[`PQC_HYBRID_PLAN.md`](./PQC_HYBRID_PLAN.md)**.

### Security Audit

A comprehensive security audit report is available in [`SECURITY_AUDIT_REPORT.md`](./SECURITY_AUDIT_REPORT.md).

**Key Findings:**
- ✅ Strong cryptographic implementation
- ⚠️ WebSocket access control improvements needed (addressed in v1.0)
- ⚠️ Key storage migration to IndexedDB recommended (planned for v1.1)

### Vulnerability Reporting

If you discover a security vulnerability, please email **[security@cipherpulse.io]** (or create a private security advisory on GitHub). Do not create public issues for security vulnerabilities.

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

### Version 1.1 (Q1 2025)
- [ ] Post-quantum cryptography (CRYSTALS-Kyber)
- [ ] WebAssembly crypto acceleration
- [ ] Mobile applications (iOS/Android)
- [ ] Federation support (interoperability with other servers)
- [ ] Voice & video calls (encrypted)

### Version 1.2 (Q2 2025)
- [ ] Group conversations (Signal MLS protocol)
- [ ] File attachments with E2EE
- [ ] Disappearing messages (auto-delete after X days)
- [ ] Read receipts (optional)
- [ ] Typing indicators (optional)

### Version 2.0 (Q3 2025)
- [ ] Decentralized identity (DID)
- [ ] Zero-knowledge proofs for metadata privacy
- [ ] Tor integration
- [ ] Hardware security module (HSM) support

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
| **Bitcoin (BTC)** | `[YOUR_BTC_ADDRESS]` |
| **Ethereum (ETH)** | `[YOUR_ETH_ADDRESS]` |
| **Monero (XMR)** | `[YOUR_XMR_ADDRESS]` |
| **Solana (SOL)** | `[YOUR_SOL_ADDRESS]` |

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

## 📞 Contact

- **GitHub**: [@Oykdo](https://github.com/Oykdo)
- **Repository**: [https://github.com/Oykdo/cipher](https://github.com/Oykdo/cipher)
- **Issues**: [https://github.com/Oykdo/cipher/issues](https://github.com/Oykdo/cipher/issues)

---

<div align="center">

**Built with ❤️ for privacy and security**

*Your messages, your keys, zero trust.*

</div>
