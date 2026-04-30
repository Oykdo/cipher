# Changelog

## v1.2.1 — i18n top-up

### Changed

- **Translations for `conversations.group.*` in 6 locales**: German,
  Spanish, Italian, Portuguese, Russian, Chinese (Simplified). v1.2.0
  shipped EN + FR complete and the other 6 falling back to EN values;
  this release replaces them with native translations across all 27
  group-related strings (modal labels, member count format, owner /
  you badges, leave / remove / delete confirmations, and the 6 error
  messages). Placeholders (`{{count}}`, `{{users}}`, `{{more}}`,
  `{{username}}`) preserved across every locale.

## v1.2.0 — Group conversations

Direct (1:1) conversations remain unchanged. The new surface is group
conversations, sized 2-10 members with a single owner per group.

### Added

- **Group conversations (2-10 members, owner-only governance).**
  - DB migration `007_add_groups.sql` adds `conversations.type`,
    `conversations.created_by`, `conversations.encrypted_title`, and the
    new `message_deliveries` junction table for per-recipient ack of
    group messages. Existing rows are tagged `type='direct'`; no data
    migration required (conversation IDs were already UUID v4).
  - `markMessagesDeliveredFor()` becomes a dispatcher: direct keeps the
    coarse-grained `messages.delivered_at`, group writes per-recipient
    rows in `message_deliveries` and only promotes
    `messages.delivered_at` once every non-sender member has fetched.
  - REST: `POST /api/v2/groups`, `POST /api/v2/groups/:id/members`,
    `DELETE /api/v2/groups/:id/members/:userId`,
    `POST /api/v2/groups/:id/leave`, `PATCH /api/v2/groups/:id`,
    `DELETE /api/v2/groups/:id`. Response shape of
    `GET /api/v2/conversations` is augmented with `type`, `members`,
    `memberCount`, `createdBy`, `encryptedTitle`; `otherParticipant` is
    preserved for direct conversations as a transitional convenience.
- **End-to-end encrypted group titles** via the existing e2ee-v2
  envelope (`encryptSelfEncryptingMessage`). The server stores opaque
  ciphertext only.
- **`GroupConversationModal`** for multi-select group creation,
  **`GroupDetailsPanel`** for member management (add / remove / leave /
  delete). When the owner adds a member, the title is re-wrapped with
  the new keys-map in the same request (`newEncryptedTitle`).
- **Backup format v3** — adds `type`, `members`, `createdBy`,
  `encryptedTitle`, `decryptedTitle` to `BackupConversation`. v2
  backups continue to import (the loader reconstructs members from
  `peerUsername` + self).
- i18n sub-namespace `conversations.group.*` in the 8 locales (EN + FR
  full, others use EN values pending 1.2.1 translation).
- Test suites: `groups.test.ts` (bridge, 19 cases — entity validation +
  DB-gated scenarios), `encryptionDispatch.test.ts` (frontend, 11 cases
  pinning the no-fallback-for-groups invariant),
  `helpers.test.ts` (frontend conversation helpers, 13 cases), plus 2
  new cases on `selfEncryptingMessage.test.ts` for the 10-member upper
  bound and the forward-security-after-removal property.

### Security

- **Removed two `else { legacy }` branches in `Conversations.tsx`** that
  previously sent masterKey-encrypted blobs to the server when no
  `peerUsername` was available. These paths could not have produced
  E2E-encrypted output. Every outgoing message now goes through
  `lib/messaging/encryptionDispatch.ts`, which throws a typed
  `GroupEncryptionError` rather than ever falling back to e2ee-v1 for a
  group conversation. e2ee-v1 remains valid for direct (it is keyed by
  peer identity and cannot represent N recipients).
- Defense in depth: bridge `messages.ts` rejects any incoming envelope
  whose JSON `version` is `e2ee-v1` when the conversation
  `type === 'group'` (HTTP 400). The body is otherwise opaque, so this
  catches buggy clients without inspecting plaintext.
- **`JoinRoomSchema` simplified** in `socketServer.ts` from a stale
  73-character `uuid:uuid` regex to a single 36-char UUID v4. The old
  pattern was inconsistent with `ConversationIdSchema` everywhere else
  and would have rejected legitimate group room joins.

### Changed

- `Conversation` domain entity gains `type`, `createdBy`,
  `encryptedTitle`, factories `createDirect()` / `createGroup()`, and
  per-type validation. Legacy `Conversation.create(p1, p2)` is
  preserved as an alias of `createDirect()`.
- `database.js` `createConversation(id, members, opts)` accepts
  `{ type, createdBy, encryptedTitle }` and inserts N members instead
  of two; `restoreUserData` no longer caps imports at 2 members.
- New `ConversationSummaryV3` shape; `ConversationSummaryV2` is kept as
  a deprecated alias for one release.
- `ChatHeader` and `ConversationList` consume the new helpers
  (`isGroupConversation`, `getDirectPeer`, `getConversationTitle`).
  Audio / video call buttons are hidden for groups (call support
  deferred to 1.3 — group calling needs a SFU).

### Out of scope (tracked for 1.3+)

- Audio / video group calls.
- P2P direct media path for groups (groups force the server relay).
- Roles / co-admins / ownership transfer.
- Detailed read receipts in the UI (the `message_deliveries.read_at`
  column is in place but not surfaced).

## v1.1.2

See `git log --oneline ae1768c~..ae1768c`.
