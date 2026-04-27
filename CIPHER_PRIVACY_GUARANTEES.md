# Cipher — Privacy Guarantees

> **Contract with the user.** This document describes what the Cipher server stores, what it does not store, and how anyone can verify the promise holds. Any pull request that contradicts this contract must be rejected.

**Status**: v1.0 — target of the "L1 strict" refactor (April 2026 sprint). Sections marked **[TARGET]** are not yet implemented in the code as of this document; see `## Current scope vs target` at the end of the page.

---

## The three pillars

1. **Decentralized.** The server is not an authority that knows everything. It is an ephemeral relay that routes opaque envelopes between recipients identified by their public keys. In the long term, bridges are federable — a user can change bridges without losing their identity.

2. **Personal data portability.** The user **owns** their data. Their mnemonic, keys, history, and conversations live on their devices, not on the server. They can export everything, restore everything, migrate everything. If Cipher disappears tomorrow, the user keeps it all.

3. **Hardened security.** No "UX shortcuts" that store plaintext server-side. No PII (IP, user-agent, geolocation) in logs or in the database. No history server-side — messages are deleted after delivery. No metadata that maps who talks to whom.

---

## What the server stores — exhaustive list

The Cipher server stores **only** the items listed below. Any data not listed here is not supposed to exist server-side.

### Public identity (key directory)

| Data | Type | Why it is needed |
|---|---|---|
| `users.username` | Unique text | Lets a recipient address a known username |
| `users.id` | UUID | Stable internal identifier |
| `users.security_tier` | Enum (`standard` / `dice-key`) | Determines the expected key format for this account |
| `users.discoverable` | Boolean | The user opted in to appear in search |
| `users.created_at` | Timestamp | Basic anti-spam |
| `users.srp_salt`, `users.srp_verifier` | Text | Zero-knowledge login — the verifier does not reveal the password |
| `identity_keys` | X25519 public keys | Public key directory for X3DH initiation |
| `signature_keys` | Ed25519 public keys | Signature verification |
| `signed_pre_keys` | Signed public keys | X3DH bootstrap (Signal protocol) |
| `one_time_pre_keys` | Single-use public keys | X3DH bootstrap with reinforced forward secrecy |

### Pending state (ephemeral transit)

| Data | Type | TTL |
|---|---|---|
| `messages.body` | Opaque E2E ciphertext | **Dual TTL** [TARGET]: 7 days after `delivered_at` (post-pickup grace) **OR** 30 days after `created_at` if never delivered (safety net) |
| `messages.delivered_at` [TARGET] | Delivery timestamp | Set by the worker when all recipients have acked |
| `attachments.path` | Ciphertext file on disk | Same policy as messages [TARGET] |
| `refresh_tokens.token_hash` | SHA-256 of the refresh token | 7-day expiration |
| `conversation_requests` | pending/accepted status | Transient, removed after acceptance |

### Configuration

| Data | Type |
|---|---|
| `metadata.schema_version` | DB schema version |

---

## What the device stores

On the user side (the "personal data portability" pillar), the device keeps **locally** everything it needs to operate. This is explicitly the design target — the user owns the data, the server does not. If Cipher disappears, the user keeps everything; if they switch device, they replay their mnemonic to reconstitute the identity.

| Data | Where | Protection |
|---|---|---|
| BIP-39 mnemonic phrase | `KeyVault` (encrypted IndexedDB) under the key `mnemonic:<username>` | Sealed by password (PBKDF2-SHA256 600k of the user's password) |
| Master key (BIP-39 seed) | `KeyVault` under the key `masterKey:<username>` | Same sealed-by-password protection |
| Local password hash | `localStorage` under the key `pwd_<username>` | PBKDF2-SHA256 600k (one-way) |
| Double Ratchet state (active E2EE sessions) | Encrypted `IndexedDB` | Master key |
| Decrypted messages cache | Encrypted `IndexedDB` | Master key |
| Known accounts list on this device | `localStorage` | Unencrypted (non-sensitive metadata: just usernames) |

**Threat model note.** An attacker who obtains (a) physical access to the device + (b) the user's password can extract everything. This is the same model as any crypto wallet (Sparrow, Electrum, Ledger Live). The defense is: do not lose the device, do not share the password, and — as a reminder — the mnemonic is the ultimate authority, not the device.

---

## What the server does NOT store

Explicit commitment. If any of these appears server-side one day, it is a **critical privacy bug** to fix immediately.

### User secrets

- ❌ The BIP-39 mnemonic phrase (12-24 words). It never leaves the device.
- ❌ The master key (DiceKey or derived). Same.
- ❌ The DiceKey checksums, even encrypted.
- ❌ The quick-unlock password — neither in clear nor hashed. It lives only in each device's local KeyVault.
- ❌ Any private key whatsoever.

### Conversation content

- ❌ No message plaintext, sender or recipient side (the historical `sender_plaintext` is removed).
- ❌ No conversation history. Messages delivered and acked by all recipients are **deleted within 7 days** [TARGET]; never-delivered messages are dropped after 30 days.
- ❌ No preview, snippet, or `last_message_text` in clear.
- ❌ No attached file in clear. Attachments are E2E-encrypted before upload.

### Personal metadata (PII)

- ❌ No IP address in persistent logs [TARGET].
- ❌ No user-agent in persistent logs [TARGET].
- ❌ No geolocation, no device fingerprint.
- ❌ No analytics tracking, no third-party Sentry/Datadog, no telemetry.
- ❌ No persistent audit logs of any kind. The `audit_logs` table was dropped (migration 004); operational visibility on active incidents comes from a bounded **in-memory ring buffer** that does not survive a bridge restart and never holds IP / user-agent. See `apps/bridge/src/services/security-events.ts`.

### Social graph

- ❌ No persistent "who talked to whom" beyond active conversations.
- ❌ No persistent presence history (online/offline log).
- ❌ No centralized contact graph — the contact list lives on the user's device.

---

## Multi-device

Cipher is **device-centric** by design: each device holds its own copy of the conversation history. The server does not synchronize between devices — it only routes messages in transit.

| Scenario | Behavior |
|---|---|
| Same device, app closed and reopened | Full history remains visible (local cache). The server is not required for display. |
| New device, first connection | Sees only the messages still pending server-side or delivered within the grace window (≤ 7 days). No automatic restoration of older history. |
| User offline > 30 days | On reconnection, messages whose `created_at < now − 30d` have been purged server-side and are lost. The offline tolerance window is 30 days. |
| History transfer between devices | **Manual.** Export from device A via `Settings → Backup → Export`, password-encrypted file, import on device B. See `apps/frontend/src/lib/dataExport.ts`. |

This is the "portability" pillar in practice: you own your history on your device, you can take it with you, but the server is never the owner and does not synchronize on your behalf. Aligned with SimpleX. Stricter than Signal (which retains ~30d as relay) or WhatsApp (which persists indefinitely).

---

## Time-lock and TTL

Time-lock messages (decryptable only after a future date) use **tlock + drand**: the ciphertext is mathematically unreadable until the drand network publishes the round corresponding to the unlock time. The lock is **cryptographic, client-side**, not a server policy.

Consequence: **the server TTL does not constrain the unlock time**.

| Phase | On the server | On the device |
|---|---|---|
| Send | Stores the drand-locked blob | (nothing yet) |
| Pickup by recipient | Marks `delivered_at` | Downloads and stores the blob locally |
| Post-pickup grace (≤ 7d) | Keeps the blob (recent multi-device tolerance) | Blob available locally |
| After server TTL | **Purges the blob** | Blob still present, not yet decryptable |
| Drand publishes the round | (no longer involved) | Decrypts **locally** with the drand key |

The sender can set a time-lock for 1 day, 1 month, or 100 years in the future — the server does not care. The only real risk is: **the recipient must pick the message up before `created_at + 30 days` (max-pending)**, otherwise the server purges and the message is lost despite the future unlock time.

The UI must warn the sender at send time if `unlockTime > 30 days` AND the recipient has not been seen recently, so the sender knows that delivery depends on the recipient's activity within the next 30 days.

---

## Testable invariants

These properties must always be true. An E2E test enforces them in CI.

### Invariant 1 — No message history

```
Setup    : 2 accounts (alice, bob)
Action   : alice sends 5 messages to bob
           bob acks the 5 messages
           wait 7 days + 1 hour (purge worker runs)
Verify   : SELECT count(*) FROM messages WHERE conversation_id = $alice_bob = 0
```

### Invariant 2 — No server plaintext

```
Setup    : 1 account alice with her public keys published
Action   : intercept the INSERT payload of every sent message
Verify   : no persisted field decodes to readable UTF-8 with the known
           public keys. Everything must be opaque ciphertext.
```

### Invariant 3 — No PII in the DB

```
Action   : SELECT * FROM all_tables
Verify   : grep -E '([0-9]{1,3}\.){3}[0-9]{1,3}|Mozilla|Chrome|Safari|Linux'
           returns no rows (excluding documentation/seed data).
```

### Invariant 4 — No user secret in the DB

```
Action   : SELECT column_name FROM information_schema.columns
Verify   : no column named mnemonic, master_key%, password%,
           private_key%, seed%, sender_plaintext.
```

---

## How to verify yourself

The user or an independent auditor can verify the guarantees:

1. **Read the SQL schema**: `apps/bridge/scripts/schema_postgresql.sql` is public in the repo. No secret tables.
2. **Read the route code**: `apps/bridge/src/routes/` is public. No secret INSERT.
3. **Run the invariants**: `cd apps/bridge && npm run test:invariants` [TARGET].
4. **Inspect your own DB** if you self-host the bridge: `psql -c "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public'"`.
5. **Reproduce the installer build**: check out the git tag, `npm run build:win`, compare the binary hash with the distributed one.

---

## Current scope vs target

As of this document, **the code is not yet conformant**. The 2026-04-26 audit revealed that the DB stored:

- `users.mnemonic` in clear (the entire BIP-39 phrase)
- `users.master_key_hex` in clear (DiceKey master key)
- `users.dicekey_checksums` (to be clarified)
- `messages.sender_plaintext` (sender plaintext copy)
- Message history without TTL
- IP + user-agent in `refresh_tokens` and `audit_logs`
- Local JSON backups containing all of the above

The "L1 strict" refactor sprint (April 2026) fixes these. **The Neon production DB will be entirely wiped** when the migrations are applied — no soft migration is possible because the columns to drop hold secrets that should never have existed.

This document describes the **target** post-sprint. The **[TARGET]** sections indicate items that depend on the in-flight refactor. Once the refactor is merged, this paragraph is removed.

---

## Legal posture

This design is **compatible with the regulations Cipher operates under** and, in most cases, makes compliance easier rather than harder.

- **GDPR (EU)**: Article 5.1.c (data minimization) is satisfied by storing nothing beyond the strict minimum needed to route messages. Article 17 (right to erasure) is trivial when there is nothing to erase. Article 5.2 (accountability) is demonstrated by the public source code and the CI invariants tests, not by activity logs.
- **Connection-data retention (France LCEN, EU equivalents)**: post-CJEU rulings (*La Quadrature du Net*, 2020; *SpaceNet*, 2022) generalised retention is unlawful. OTT messengers like Cipher are not under a general retention duty.
- **Anti-terrorism / law-enforcement cooperation**: a subpoena receives what we have. After privacy-l1 we have, per user, only `id`, `username`, `created_at`, `discoverable`, the SRP verifier (a non-secret challenge), and the published public keys. No message history, no IP, no login log, no contact graph. This is the same posture Signal has held since 2013 and publishes in its semi-annual "subpoena report".
- **KYC / AML**: not applicable — Cipher is not a financial service. Pseudonymous accounts are allowed.
- **Section 230 / e-Commerce Directive**: hosting-provider liability shield does not require audit logs.
- **Encryption "back-door" debates** (UK Online Safety Act, EU "Chat Control" CSAM scanning): Cipher's design is *compatible* with most current proposals because the server has no plaintext to scan or hand over. A future client-side scanning mandate, if enacted, would be a build-time addition — the contract reserves the right to reject any such addition that contradicts the three pillars.

In short: **dropping audit logs reduces our legal surface**, it does not increase it.

---

## Governance commitment

- Any PR that adds a column / a log / a file that contradicts this document must be rejected.
- Any exception requires an explicit amendment to this document, justified, signed, and published in the CHANGELOG.
- A privacy review is mandatory at every release.
- The CI invariants result must be public (badge in the README).

---

*Document v1.0 — created 2026-04-27 as part of the privacy L1 sprint.*
