# Cipher

> An end-to-end encrypted messenger where the server stores nothing it doesn't have to.

[![Status: alpha](https://img.shields.io/badge/status-alpha-orange.svg)](#status)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Privacy contract](https://img.shields.io/badge/privacy-contract-green.svg)](CIPHER_PRIVACY_GUARANTEES.md)

Cipher is a desktop messenger built around a privacy contract — a public document that says, line by line, what the server stores, what it does NOT store, and how anyone can verify the promise. Every claim is enforced by code and checked by automated tests in CI.

If you've ever wondered *"how do I know my messenger isn't lying about end-to-end encryption?"*, this repository is the answer for Cipher: read [`CIPHER_PRIVACY_GUARANTEES.md`](CIPHER_PRIVACY_GUARANTEES.md), then check the schema, then run the invariants.

---

## What makes Cipher different

| Property | WhatsApp | Signal | SimpleX | **Cipher** |
|---|---|---|---|---|
| Public privacy contract | ✗ | ✗ | partial | ✓ |
| CI-enforced privacy invariants | ✗ | ✗ | ✗ | ✓ |
| Server retains zero plaintext | ✓ | ✓ | ✓ | ✓ |
| Server retains zero IP / user-agent | ✗ | partial | ✓ | ✓ |
| Server retains zero auth log | ✗ | partial | ✓ | ✓ |
| Server-side message history | indefinite | ~30 days | none | **7 days max post-pickup** |
| User owns and exports their data | partial | partial | ✓ | ✓ |
| Federated / self-hostable | ✗ | ✗ | ✓ | planned (post-1.0) |

---

## Install

### Windows (available now)

1. Download `Cipher-Setup-1.1.0.exe` from the [latest release](../../releases/latest).
2. Run it. Windows SmartScreen will warn you (the binary is unsigned during alpha) — click "More info" → "Run anyway".
3. Pick an install directory and finish.

### macOS / Linux

Coming during the alpha via a GitHub Actions CI matrix (Linux runner for `.AppImage` + `.deb`, macOS runner for `.dmg`). The current Windows-only ship is because the maintainer's dev machine is Windows and `mksquashfs` / `hdiutil` aren't available cross-platform — the build itself produces correct output, just needs the right OS to package.

Until then, build from source on your own OS using the instructions below.

---

## Build from source

For paranoid users who want to verify the binary matches the source.

### Prerequisites

- Node.js ≥ 22
- `npm` (bundled with Node)
- A working internet connection (for fetching deps)

### Build

```bash
git clone https://github.com/Oykdo/Project_Logos.git cipher
cd cipher
npm install --workspaces
cd apps/frontend && npm install
cd ../bridge && npm install
cd ../..

# Windows installer
npm run build:win

# macOS DMG (requires macOS to run; produces unsigned binary on other OSes)
npm run build:mac

# Linux AppImage + .deb
npm run build:linux
```

The installer lands in `release/`. Compare its SHA-256 with the value published on the GitHub release page.

---

## How it works (30-second version)

```
┌────────────┐                         ┌────────────┐                         ┌────────────┐
│  Cipher    │   E2E ciphertext envelope   │  Bridge    │   E2E ciphertext envelope   │  Cipher    │
│  (Alice)   │ ◀────────────────────▶ │  (Fastify  │ ◀────────────────────▶ │  (Bob)     │
│            │                         │   on Fly)  │                         │            │
└─────┬──────┘                         └─────┬──────┘                         └─────┬──────┘
      │                                      │                                      │
      │                                      ▼                                      │
      │                             ┌────────────────┐                              │
      │                             │  PostgreSQL    │                              │
      │                             │  (ciphertext   │                              │
      │                             │   only, TTL 7d)│                              │
      │                             └────────────────┘                              │
      │                                                                             │
      ▼                                                                             ▼
KeyVault sealed                                                          KeyVault sealed
by user password                                                         by user password
(mnemonic, master                                                        (mnemonic, master
 key, history,                                                            key, history,
 decrypted cache)                                                         decrypted cache)
```

- The server (`apps/bridge`) is a routing relay. It sees opaque ciphertext envelopes and a recipient ID, nothing else.
- The browser-grade frontend (`apps/frontend`) does all the cryptography in the user's process: BIP-39 mnemonic generation, X3DH + Double Ratchet sessions, attachment encryption, time-lock via tlock/drand.
- All long-term secrets (mnemonic, master key, decrypted message cache) live in an encrypted IndexedDB sealed by the user's password (PBKDF2-SHA256, 600k iterations).
- Messages are deleted server-side **7 days after delivery** (configurable). Never-picked-up messages are dropped after 30 days.
- The user can export their full history at any time (`Settings → Backup → Export`), bring it to a new device, and the server is never the source of truth.

The full picture is in [`Documentation/internal/MESSAGE_WORKFLOW.md`](Documentation/internal/MESSAGE_WORKFLOW.md).

---

## Verify the privacy contract yourself

The four invariants from [`CIPHER_PRIVACY_GUARANTEES.md`](CIPHER_PRIVACY_GUARANTEES.md) are enforced in CI by `apps/bridge/src/__tests__/privacy-invariants.test.ts`. To run them yourself:

```bash
cd apps/bridge
DATABASE_URL_TEST=postgresql://user:pass@your-test-db npm run test:invariants
```

Each invariant has a one-line failure message that names the offending column, table, or row. Any regression breaks the build.

If you self-host the bridge, you can also inspect your own database directly:

```sql
-- Should list: attachments, conversation_members, conversation_requests,
-- conversations, identity_keys, messages, metadata, one_time_pre_keys,
-- refresh_tokens, signature_keys, signed_pre_keys, users.
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';

-- Should return zero rows.
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public'
  AND (column_name = 'mnemonic'
    OR column_name = 'sender_plaintext'
    OR column_name LIKE 'master_key%'
    OR column_name LIKE 'password%');
```

---

## Status

Cipher is **alpha**. It works end-to-end (we shipped the privacy-l1 milestone on 2026-04-27 with all invariants passing in production), but you're early. Specifically:

- **Windows is the only pre-built download today.** macOS and Linux are blocked on a CI runner setup (electron-builder needs native Linux tools to package `.AppImage` and macOS to sign `.dmg`); both can be built locally from source on the matching OS — see [Build from source](#build-from-source).
- **Mobile is in design.** See [`CipherMobile/ARCHITECTURE.md`](../CipherMobile/ARCHITECTURE.md) for the target architecture (React Native + Expo, same crypto core as desktop). Implementation starts after the desktop alpha gets feedback.
- **Group chats are not yet wired.** 1-to-1 conversations work; group plumbing exists in the schema but the per-recipient delivery acks are deferred until groups are a real product surface.
- **No code signing yet.** The `.exe` is unsigned during alpha; SmartScreen will scream. Mac signing requires an Apple developer account, Windows signing a code-signing cert — both planned for the 1.0 release.
- **No mobile push.** That's blocked on the mobile companion app being built first.

What works today:
- Mnemonic-based account creation, locally generated, never sent to the server
- Quick-unlock via password (PBKDF2 600k, byte-compatible across devices)
- 1-to-1 E2E encrypted text messages (Double Ratchet + sender re-read via self-encrypting envelope)
- Attachment encryption + upload + download
- Burn-after-reading (server-side scheduler, true DELETE)
- Time-lock via drand (cryptographic, no server enforcement)
- Local export of full history to a password-encrypted file

---

## Looking for testers

If you can spare 20 minutes to install Cipher, create an account, send a few messages, and tell me what surprised you (good or bad), please open an issue or send me an email. The privacy story only matters if it's defensible to actual users — your honest reactions are worth more than another feature in this repo.

---

## Architecture

This repository is a monorepo:

```
Cipher/
├── main.js, preload.cjs    — Electron entry
├── apps/
│   ├── frontend/           — React + Vite (the UI + crypto)
│   └── bridge/             — Fastify + Postgres (the relay)
├── scripts/                — Build + ops scripts
├── Documentation/internal/ — Design docs (workflow, audits)
├── CIPHER_PRIVACY_GUARANTEES.md  — The contract (read this first)
├── INFRA_NOTES.md                — Operational follow-ups
└── README.md               — You are here
```

Sister projects in the same Chimera ecosystem (separate repos):
- **CipherMobile** — React Native + Expo companion (in design).
- **Eidolon** — Post-quantum vault identity system (used as Cipher's auth root in the long term).

---

## Contributing

If you've read [`CIPHER_PRIVACY_GUARANTEES.md`](CIPHER_PRIVACY_GUARANTEES.md) and have a PR that respects the three pillars (decentralized, personal data portability, hardened security), please open it. Any PR that contradicts the contract — even with good intent — must be rejected per the contract's own governance section.

Bug reports are very welcome at this stage. Be specific: which OS, which build, what you did, what happened, what you expected.

---

## License

[MIT](LICENSE) — do whatever you want with the code, just keep the notice.

---

*This README describes Cipher as of the privacy-l1 ship (2026-04-27). The French version
([`README.fr.md`](README.fr.md)) is the historical dev-focused doc and predates this
rewrite — it is being kept while it remains useful but the canonical product description
is here.*
