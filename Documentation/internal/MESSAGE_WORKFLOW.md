# Message Workflow — Cipher (privacy-l1)

This document describes the end-to-end lifecycle of a message in Cipher
after the **privacy-l1** refactor (April 2026). The contract that
underpins every choice below is `CIPHER_PRIVACY_GUARANTEES.md` at the
repo root — read it first if you want the *why*.

---

## Table of contents

1. [Architecture overview](#architecture-overview)
2. [Message types](#message-types)
3. [Transport modes](#transport-modes)
4. [Sending a standard message](#sending-a-standard-message)
5. [Receiving a standard message](#receiving-a-standard-message)
6. [Sender self-read after device change](#sender-self-read-after-device-change)
7. [Burn-after-reading workflow](#burn-after-reading-workflow)
8. [Time-lock workflow](#time-lock-workflow)
9. [Attachments](#attachments)
10. [Server-side retention (purge worker)](#server-side-retention-purge-worker)
11. [What the server never sees](#what-the-server-never-sees)
12. [Sequence diagrams](#sequence-diagrams)

---

## Architecture overview

```
┌──────────────┐         WebSocket / HTTP             ┌──────────────┐
│              │◄────────────────────────────────────►│              │
│  Frontend A  │                                      │  Bridge      │
│  (Alice)     │         Socket.IO  +  REST           │  (Fastify +  │
│              │◄────────────────────────────────────►│   PostgreSQL)│
└──────────────┘                                      └──────────────┘
      ▲                                                       ▲
      │                                                       │
      │              WebRTC P2P (optional)                    │
      │◄──────────────────────────────────────────────────────┤
      │                                                       │
      ▼                                                       ▼
┌──────────────┐                                      ┌──────────────┐
│  Frontend B  │◄────────────────────────────────────►│  Frontend C  │
│  (Bob)       │         Socket.IO + REST             │  (Charlie)   │
└──────────────┘                                      └──────────────┘
```

### Components

- **Frontend** — React (Vite). Holds all plaintext, all keys, all history.
- **Bridge** — Fastify + Socket.IO + PostgreSQL. Pure relay: opaque
  envelopes in, opaque envelopes out, deletes them after delivery.
- **E2EE primitives** — `lib/e2ee/`:
  - `selfEncryptingMessage.ts` (e2ee-v2): one-time symmetric key wrapped
    for each recipient including the sender.
  - `messagingIntegration.ts` (e2ee-v1): NaCl-Box / Double Ratchet with
    a parallel `senderCopy` field.
- **Local cache** — `lib/e2ee/decryptedMessageCache.ts`. In-memory map
  for fast reads, persisted in the encrypted KeyVault (sealed by the
  user's password) for cross-session restoration. **Never** writes
  plaintext to `localStorage`.

### Privacy invariants enforced by the code

1. The server never holds a plaintext message body.
2. The server never holds a sender-side plaintext copy.
3. The server never holds an authentication audit log.
4. The server never holds an IP address or user-agent in any persistent
   store.
5. Delivered messages are deleted within 7 days; never-delivered
   messages are dropped after 30 days.

These invariants are enforced by `__tests__/privacy-invariants.test.ts`
and run on every PR.

---

## Message types

### Standard

Plain encrypted text. Persistent on each device, dropped server-side
once delivered + grace expires.

### Burn-after-reading (BAR)

Encrypted text + a destruction timer that starts on the recipient's
acknowledgement. The server deletes the row when the timer fires; the
clients animate the burn and remove their cached copy.

### Time-lock

Encrypted text whose ciphertext is itself locked with **tlock + drand**.
The recipient downloads the locked blob immediately; decryption only
becomes possible once the drand network publishes the round
corresponding to the unlock time. **Server-side TTL still applies**:
the recipient must pick the blob up before the 30-day max-pending
window, after which it is dropped regardless of the future unlock
time. See [Time-lock workflow](#time-lock-workflow) for details.

### Attachment

A file encrypted client-side, uploaded as ciphertext, referenced from
inside a regular encrypted message envelope. Same retention as the
parent message; the on-disk ciphertext blob is removed by the purge
worker when the parent row is deleted.

### P2P

Encrypted text sent directly via WebRTC `DataChannel`, never touches
the server (signaling only). Marked `isP2P: true` in the local model.
Storage and retention are entirely client-side.

---

## Transport modes

### Server transport (default)

```
Alice → [Encrypt envelope] → WebSocket → Bridge → PostgreSQL
                                              ↓
                                          Socket.IO push
                                              ↓
                            Bob ← [Decrypt envelope] ← WebSocket
```

### Direct P2P (opportunistic)

```
Alice → [Encrypt envelope] → WebRTC DataChannel → Bob ← [Decrypt envelope]
            ↑                                        ↑
            └─────────── Signaling via Bridge ───────┘
```

P2P is a payload optimization: the encryption envelope is identical to
the server-transport one, the route is just shorter.

---

## Sending a standard message

### Step 1 — Compose (Frontend, Alice)

```javascript
const plaintextBody = "Bonjour Bob";
const selectedConvId = "conversation-123";
const peerUsername = "bob";
```

### Step 2 — E2EE encryption

```javascript
const encryptedBody = await encryptMessageForSending(
  peerUsername,        // "bob"
  plaintextBody        // "Bonjour Bob"
);

// Result (e2ee-v1 envelope):
// {
//   "version": "e2ee-v1",
//   "encrypted":  { ciphertext for Bob },
//   "senderCopy": { ciphertext for Alice }   ← privacy-l1
// }
```

The `senderCopy` field carries a parallel ciphertext addressed to
Alice herself. **This is what allows Alice to re-read her own messages
on a fresh device** — without it, the server would have to keep a
plaintext copy (which the contract forbids). See
[Sender self-read after device change](#sender-self-read-after-device-change).

For e2ee-v2 (`selfEncryptingMessage.ts`) the same idea is expressed
more naturally: the one-time symmetric key is wrapped for every
participant, sender included, in the `keys` map.

### Step 3 — Send

```javascript
// POST /api/v2/messages
const sentMessage = await apiv2.sendMessage(
  selectedConvId,
  encryptedBody,
  {
    burnDelay: 30,          // optional — Burn-After-Reading
    unlockBlockHeight: 123  // optional — drand round number for tlock
  }
);

// Server response (no plaintext, no senderPlaintext field):
// {
//   "id": "msg-uuid-456",
//   "conversationId": "conversation-123",
//   "senderId": "alice-id",
//   "body": "{encrypted JSON envelope}",
//   "createdAt": 1234567890,
//   "burnDelay": 30,
//   "scheduledBurnAt": null
// }
```

### Step 4 — Local cache (Alice)

```javascript
// Synchronous in-memory write + async persistence to KeyVault
cacheDecryptedMessage(
  sentMessage.id,
  selectedConvId,
  plaintextBody
);
// On disk: encrypted IndexedDB entry under
//   e2ee:decrypted:msg-uuid-456
// Sealed by Alice's master key. Re-readable across sessions.
```

### Step 5 — DB persistence (Bridge)

```sql
INSERT INTO messages (
  id,
  conversation_id,
  sender_id,
  body,                     -- ciphertext envelope (opaque)
  unlock_block_height,      -- optional, drand round number
  scheduled_burn_at,        -- negative = "delay after read", positive = absolute
  created_at
  -- delivered_at left NULL — set by markMessagesDeliveredFor on first GET
) VALUES ('msg-uuid-456', 'conversation-123', 'alice-id', ..., NULL, ..., NOW());
```

Note: there is **no `sender_plaintext` column** anymore. Migration 002
dropped it.

### Step 6 — WebSocket broadcast

```javascript
io.to('conversation:conversation-123').emit('new_message', {
  conversationId: 'conversation-123',
  message: {
    id: 'msg-uuid-456',
    senderId: 'alice-id',
    body: '{encrypted JSON envelope}',
    createdAt: 1234567890,
    burnDelay: 30
  }
});
```

---

## Receiving a standard message

### Step 1 — WebSocket event (Frontend, Bob)

```javascript
socket.on('new_message', async (data) => {
  // data = { conversationId, message: { id, senderId, body, ... } }
});
```

### Step 2 — E2EE decryption

```javascript
const result = await decryptReceivedMessage(
  'alice',                // sender
  data.message.body,      // ciphertext envelope
  undefined,
  true                    // returnDetails
);
// → { text: "Bonjour Bob", encryptionType: "double-ratchet-v1" }
```

### Step 3 — Cache and display

```javascript
cacheDecryptedMessage(data.message.id, conversationId, result.text);

setMessages(prev => [...prev, {
  id: data.message.id,
  body: result.text,
  senderId: 'alice-id',
  encryptionType: 'double-ratchet-v1'
}]);
```

### Step 4 — Server-side delivery marking

When Bob's client subsequently calls `GET /api/v2/conversations/:id/messages`
(on app refresh, scroll-up, etc.), the bridge fires
`markMessagesDeliveredFor(conversationId, bobId)`. For 1-to-1
conversations (the only case currently wired) this updates
`messages.delivered_at = NOW()` for every message Bob has not yet
acknowledged. The purge worker then drops these rows 7 days later
(see [Server-side retention](#server-side-retention-purge-worker)).

Group conversations require per-recipient ack tracking; that wiring
is deferred until groups become a real product surface.

---

## Sender self-read after device change

A common UX expectation: "I sent a message yesterday, today I open
Cipher on a new laptop, I want to see what I wrote." Pre-l1 this was
implemented by the server keeping a `sender_plaintext` copy of every
sent message — which broke E2E.

Privacy-l1 replaces that mechanism with a **client-only** scheme:

1. **At send time**, the encryption layer adds a `senderCopy` (e2ee-v1)
   or includes the sender in the `keys` wrap (e2ee-v2). The server
   sees only ciphertext; it cannot tell apart the sender-addressed
   wrap from the recipient-addressed one.
2. **On the same device**, the local cache (`decryptedMessageCache.ts`)
   serves the plaintext from memory — no decryption needed.
3. **On a new device**, after login + KeyVault unlock + E2EE init,
   `hydrateCacheFromVault()` rehydrates the encrypted-IndexedDB-backed
   cache. Messages still pending server-side (within the 7-day grace)
   are fetched as ciphertext and decrypted using the user's identity
   private key — the `senderCopy` / sender-key wrap unlocks them.
4. **Older history** that has been purged server-side is not
   recoverable from a fresh device. Cross-device transfer is manual
   via `Settings → Backup → Export` (see CIPHER_PRIVACY_GUARANTEES.md
   §"Multi-device").

---

## Burn-after-reading workflow

### Send (Alice)

```javascript
await apiv2.sendMessage(convId, encryptedBody, { burnDelay: 30 }); // 30s after read
```

The bridge stores `scheduled_burn_at = -30` (negative = "30 seconds
*after* recipient acknowledges"). The body is regular ciphertext; the
burn timer is metadata, not encryption.

### Display (Bob)

Bob's client renders a `<BurnMessage>` component with a "Reveal"
button. Clicking it triggers:

```javascript
await apiv2.acknowledgeMessage(messageId, conversationId);
```

The bridge then:

```sql
UPDATE messages
SET scheduled_burn_at = $now + 30000  -- absolute timestamp
WHERE id = $messageId;
```

…and the burn scheduler picks it up.

### Destruction (Bridge `burnScheduler`)

After the timer fires:

```sql
DELETE FROM messages WHERE id = $messageId;
```

Then the bridge broadcasts `message_burned` to every conversation
participant. Each frontend then:

1. Calls `clearMessageCache(messageId)` — wipes both in-memory and
   KeyVault entry.
2. Plays the burn animation.
3. Removes the message from the UI state.

### Reload filter

If anyone refreshes mid-burn, `is_burned` filtering at the GET layer
hides the row even before the DELETE has propagated.

---

## Time-lock workflow

Time-lock is enforced **cryptographically on the client** via tlock +
drand. The server is not the oracle.

### Send (Alice)

```javascript
const drandRound = computeDrandRoundForUnlockTime(unlockDate);
await apiv2.sendMessage(convId, encryptedBody, { unlockBlockHeight: drandRound });
```

The body is a **drand-locked ciphertext** — produced by `lib/tlock.ts`
using the public drand chain parameters. The server cannot decrypt it
even if it wanted to.

### Pickup (Bob)

Bob's client downloads the locked blob the same way as a regular
message. It is stored locally as ciphertext, in the same way as any
other message, until the unlock time arrives.

### Unlock (drand network)

When the drand network publishes the round, Bob's client (or Alice's,
on her own copy) can derive the decryption key locally and reveal the
message. **No server interaction required at this stage.**

### Server retention vs unlock time

The two are **independent**: the server purges messages per the
dual-TTL retention policy (7d post-pickup, 30d max-pending),
regardless of how far in the future the unlock time is. As long as
the recipient has picked the blob up before the safety net fires, the
unlock time can be 1 day, 1 month, or 100 years away — drand will
eventually publish the round and the local copy decrypts.

If `unlockTime > 30 days` AND the recipient has not been seen recently,
the UI must warn the sender at send time: "your recipient must open
Cipher at least once within the next 30 days, otherwise this message
will not reach them."

---

## Attachments

### Send (Alice)

```javascript
const file = new File([...], "photo.jpg", { type: "image/jpeg" });

// 1. Encrypt the file client-side
const encryptedAttachment = await encryptAttachment(file, 'high', peerUsername);
// → { type: "attachment", payload: { filename, mime, size, encryptedData, nonce, securityMode } }

// 2. Wrap as a regular message
const attachmentJson = JSON.stringify(encryptedAttachment);
const encryptedBody = await encryptMessageForSending(peerUsername, attachmentJson);
await apiv2.sendMessage(convId, encryptedBody, {});
```

Server-side: the ciphertext blob lands in `apps/bridge/data/uploads/`
on disk, and an `attachments` row references it. Same retention as
the parent message — when the message row is deleted by the purge
worker, the disk blob is unlinked too.

### Receive (Bob)

```javascript
const plaintext = await decryptReceivedMessage(...);
const parsed = JSON.parse(plaintext);
if (parsed.type === 'attachment') {
  // Render <AttachmentMessage>; on click, decrypt + download
  const decryptedFile = await decryptAttachment(parsed);
  downloadFile(decryptedFile, parsed.payload.filename);
}
```

---

## Server-side retention (purge worker)

The `purge-worker.ts` service runs every hour (configurable via
`BRIDGE_PURGE_INTERVAL_MINUTES`) and applies the dual-TTL policy:

```sql
-- Step 1: delete messages past the post-pickup grace
DELETE FROM messages
WHERE delivered_at IS NOT NULL
  AND delivered_at < NOW() - INTERVAL '7 days';

-- Step 2: delete messages past the max-pending safety net
DELETE FROM messages
WHERE delivered_at IS NULL
  AND created_at < NOW() - INTERVAL '30 days';

-- Step 3: unlink any attachment files orphaned by Step 1 or 2
```

Configuration:

| Env variable | Default | Min | Max |
|---|---|---|---|
| `BRIDGE_MESSAGE_TTL_DAYS` | 7 | 1 | 30 |
| `BRIDGE_MESSAGE_MAX_PENDING_DAYS` | 30 | 7 | 90 |
| `BRIDGE_PURGE_INTERVAL_MINUTES` | 60 | 5 | 360 |

The worker is **best-effort**: failures are logged but never block the
bridge or fail message delivery. A failed purge pass simply leaves
rows for the next run to handle.

---

## What the server never sees

Verified by `__tests__/privacy-invariants.test.ts`, run in CI on
every PR:

- Plaintext message body (Invariant 2)
- BIP-39 mnemonic, master key, DiceKey checksums (Invariant 4 — the
  schema simply doesn't have those columns anymore)
- IP address, user-agent, geolocation (Invariant 3)
- Long-term audit log (the `audit_logs` table was dropped in
  migration 004; security events live in an in-memory ring buffer
  that is wiped on bridge restart)
- Conversation request introduction text (the column was dropped in
  migration 002)

---

## Sequence diagrams

### Standard message

```
Alice           Frontend A       Bridge          Frontend B          Bob
  │                  │              │                 │              │
  │──"Hi Bob"───────►│              │                 │              │
  │                  │──Encrypt────►│                 │              │
  │                  │  (envelope)  │                 │              │
  │                  │              │──INSERT───►PostgreSQL          │
  │                  │              │   (delivered_at = NULL)        │
  │                  │              │                 │              │
  │                  │              │──Socket.IO push─►              │
  │                  │              │                 │──Decrypt────►│
  │                  │              │                 │◄─"Hi Bob"────│
  │                  │              │                 │              │
  │                  │              │◄──GET messages──│              │
  │                  │              │   (markMessagesDeliveredFor)   │
  │                  │              │   delivered_at = NOW()         │
  │                  │              │                 │              │
  │            (7 days later, purge worker fires)                    │
  │                  │              │   DELETE FROM messages         │
  │                  │              │   WHERE delivered_at < ...     │
```

### Burn-after-reading

```
Alice          Frontend A      Bridge        Frontend B         Bob
  │                │              │              │              │
  │──"Secret"(30s)►│              │              │              │
  │                │──burnDelay=30─►              │              │
  │                │              │ stash -30    │              │
  │                │              │──broadcast──►│              │
  │                │              │              │──🔒 envelope►│
  │                │              │              │              │
  │                │              │◄─acknowledge─│◄─Click──────│
  │                │              │ schedule_burn_at = now+30s  │
  │                │              │ scheduler.start()           │
  │                │              │              │──Show: 30s──►│
  │                │              │              │──Show: 29s──►│
  │                │              │              │──...         │
  │                │              │ DELETE       │              │
  │◄─message_burned│◄──Socket.IO──│              │              │
  │  clearCache    │              │              │              │
  │  burn anim     │              │              │              │
  │                │              │              │              │
```

### Time-lock

```
Alice (J)         Frontend A         Bridge         Frontend B        Bob
  │                   │                 │              │              │
  │──Send (unlock J+60)►                │              │              │
  │                   │──[drand-locked]─►              │              │
  │                   │                 │──INSERT──►PG │              │
  │                   │                 │              │──pickup─────►│
  │                   │                 │              │  store local │
  │                   │                 │ delivered_at = NOW()        │
  │                   │                 │              │              │
  │            (J+7, server purges)     │              │              │
  │                   │                 │ DELETE       │              │
  │                   │                 │   (blob still local on Bob) │
  │                   │                 │              │              │
  │            (J+60, drand publishes round)          │              │
  │                   │                 │              │──Decrypt────►│
  │                   │                 │              │   locally    │
  │                   │                 │              │◄─"Secret"────│
```

---

## Related files

### Frontend

- `apps/frontend/src/screens/Conversations.tsx` — the orchestration entry point
- `apps/frontend/src/services/api-v2.ts` — REST surface (`sendMessage`, `acknowledgeMessage`, `getConversationMessages`)
- `apps/frontend/src/lib/e2ee/messagingIntegration.ts` — `encryptMessageForSending`, `decryptReceivedMessage`, `senderCopy` wrap
- `apps/frontend/src/lib/e2ee/selfEncryptingMessage.ts` — e2ee-v2 primitives (sender included in `keys`)
- `apps/frontend/src/lib/e2ee/decryptedMessageCache.ts` — in-memory cache backed by sealed KeyVault
- `apps/frontend/src/components/BurnMessage.tsx` — BAR UI component
- `apps/frontend/src/lib/tlock.ts` — drand encryption / decryption

### Bridge

- `apps/bridge/src/routes/messages.ts` — REST + WebSocket message routes
- `apps/bridge/src/routes/acknowledge.ts` — BAR acknowledge endpoint
- `apps/bridge/src/services/burn-scheduler.ts` — destruction scheduler
- `apps/bridge/src/services/purge-worker.ts` — dual-TTL retention worker
- `apps/bridge/src/db/database.js` — `createMessage`, `markMessagesDeliveredFor`, `burnMessage`
- `apps/bridge/src/websocket/socketServer.ts` — Socket.IO push layer

### Schema and migrations

- `apps/bridge/scripts/schema_postgresql.sql` — current L1-clean schema (v2.2.0)
- `apps/bridge/scripts/migrations/002_remove_plaintext_secrets.sql` — drop of `sender_plaintext`, `mnemonic`, etc.
- `apps/bridge/scripts/migrations/003_add_delivered_at.sql` — adds `delivered_at` for purge worker
- `apps/bridge/scripts/migrations/004_drop_audit_logs.sql` — drop of `audit_logs` table

### Tests

- `apps/bridge/src/__tests__/privacy-invariants.test.ts` — runs in CI, breaks the build on any regression of the four invariants

---

*Document v2.0 — rewritten 2026-04-27 in the privacy-l1 sprint.
Supersedes the December 2025 v1.0 which described the now-removed
`sender_plaintext` mechanism.*
