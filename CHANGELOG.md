# Changelog

## v1.2.9 — DiceKey copy retired + console-noise fix

### Changed

- **`logout_warning` no longer mentions DiceKey** (8 locales). The
  dialog now reads "you'll need your recovery phrase to log back
  in" instead of "recovery phrase or DiceKey". DiceKey login was
  definitively retired pending Eidolon Connect — surfacing it as
  a return path was misleading. Code-level DiceKey vestiges
  (~28 files: auth store, KDF helpers, signup screens, locale
  strings) remain dormant and will be swept in a follow-up; this
  release is a UI-copy fix only.
- **`CIPHER_PRIVACY_GUARANTEES.md` cleaned of DiceKey references.**
  Dropped the `users.security_tier` row from the public-identity
  table (its only purpose was DiceKey/standard discrimination),
  removed the "DiceKey checksums" non-storage commitment, and
  rephrased the historical audit list. Doc bumped to v1.1.2.
  The doc itself stays public — the transparency contract is
  the product's differentiator vs Signal/WhatsApp.

### Fixed

- **`emergencyWipe` no longer logs at `console.warn` level.** The
  `🔴 [KeyStore] Emergency wipe completed` and
  `[SecureKeyAccess] Emergency wipe completed` lines were warn-level
  remnants from when the wipe only ran on security incidents. Since
  v1.2.8 the same path runs on every user-initiated logout, so a
  yellow console warning is misleading. Downgraded to `console.info`
  in `lib/keyStore.ts:354` and `lib/secureKeyAccess.ts:160`.

## v1.2.8 — UX polish: cosmic dialogs, dynamic Stripe currency, full logout

### Changed

- **Logout in Danger Zone** now uses a cosmic Dialog (replaces the
  native browser confirm) and properly clears the local fingerprint
  (`pwd_<username>` + known-account entry). Quick Unlock no longer
  offers the device after a real logout — the previous behaviour
  left the password hash in `localStorage`, so the bandeau on
  Landing.tsx kept resurrecting the account.
- **All native `window.confirm` (×5) and `alert()` (×6) replaced.**
  Group destructive actions (remove member / leave / delete),
  recovery flow, Quick Unlock cache reset, and the safety-number
  verification revoke now go through the new ConfirmDialog
  primitive. Send-failure errors and the E2EE init warning surface
  via inline banners. Fingerprint copy uses an inline "Copied!"
  pattern (2 s).
- **Tray-behavior settings text rewritten across 8 locales.** The
  previous wording leaned on jargon ("system tray / barre des
  tâches / Infobereich") and a GNOME/AppIndicator footnote that
  was noise for >99 % of users. Replaced with a one-liner that
  explains the *why* ("Cipher stays active so you don't miss
  messages") and a one-liner pointer ("reopen from the icon near
  the clock").
- **Stripe contribution: currency dropdown** (EUR / USD / GBP / CHF
  / CAD / AUD) instead of a hard-coded EUR span. The bridge already
  accepted the `currency` field; the frontend now actually exposes
  the choice, and the server-side cap message reflects the picked
  currency (e.g. *"Amount must be at most 10000 USD"*) instead of
  always saying EUR.

### Added

- `components/ui/ConfirmDialog.tsx` — reusable Radix-based confirm
  primitive with `destructive` (red) and `hideCancel`
  (acknowledgment-only) variants. Wraps the existing Dialog
  component for a11y / focus-trap.
- `components/conversations/InvitationSentModal.tsx` — cosmic-styled
  feedback modal shown after sending a conversation request
  (animated check icon, halo glow, framer-motion spring entrance).

### Internal

- `SafetyNumberVerification.tsx` flagged inactive in its file
  header. The component is in the codebase since the initial
  commit but has never been imported anywhere; the polish in this
  release is intended as a design reference for a future
  "verify this contact" screen (desktop or mobile).

## v1.2.7 — Stripe donation cap raised + actionable error messages

### Changed

- **Donation cap raised from 2 500 EUR to 10 000 EUR per
  transaction.** `apps/bridge/src/routes/stripe.ts` Zod schema for
  `amountCents` had `max(250_000)` which was a tighter guardrail
  than necessary — donors trying to give 3 000 EUR or more were
  silently bounced with a generic "Invalid request". Bumped to
  `max(1_000_000)` (= 10 000 EUR). Anyone wanting more can split
  the payment or contact the project, which is probably someone
  worth knowing personally anyway.

### Fixed

- **Stripe checkout error message now explains what is wrong.**
  The bridge previously returned `"error": "Invalid request",
  "code": "INVALID_REQUEST"` for every Zod failure, leaving the
  donor staring at a generic message. The handler now surfaces the
  first Zod issue's `message`, so the frontend renders the actual
  cause — e.g. *"Amount must be at most 10000 EUR — for larger
  donations, please make multiple payments or contact the project"*
  instead of *"Invalid request (INVALID_REQUEST)"*. Same change
  also covers the floor (1 EUR minimum).

### Notes

- Bridge **must be re-deployed on Fly** for v1.2.7 to take effect
  (`cd apps/bridge && fly deploy --remote-only`). The frontend
  binary `.exe` from v1.2.6 will pick up the new error message
  automatically because the wording lives server-side.

## v1.2.6 — Tray icon really fixed + Stripe layout + SHA256SUMS

Hotfix release covering three small but visible regressions, plus
re-instating SHA256 verification metadata on the GitHub release page
that I quietly dropped in v1.2.3 when the publish flow was rewired.

### Fixed

- **Windows tray icon: actually packaged this time.** v1.2.5 switched
  the runtime tray icon path from `assets/icon.png` to `assets/icon.ico`,
  but the electron-builder `files` array in the root `package.json`
  was never updated to include `assets/`. Inside the packaged `.exe`,
  `path.join(__dirname, 'assets', 'icon.ico')` resolved to a path
  that did not exist, so `nativeImage.createFromPath()` returned an
  empty image and the tray rendered as a clickable-but-invisible
  ghost slot — the same symptom v1.2.5 was supposed to fix. Added
  `assets/icon.ico`, `assets/icon.png`, and `assets/icon.icns` to
  the build files allowlist.
- **Settings → Contribution: Stripe amount input squeezed to the
  number-spinner only.** v1.2.3 fixed the cursor-positioning bug
  with `cosmic-input-plain`, but the surrounding flex layout still
  starved the input. Root cause: the `.cosmic-cta` button class
  declares `width: 100%`, which in a flex-row context becomes
  `flex-basis: 100%` and steals all the available width from the
  sibling `flex-1` input wrapper. Override with `sm:!w-auto` on the
  button (auto width at sm+ breakpoint, full width on mobile
  flex-col) and pin a `sm:min-w-[200px]` on the input wrapper as a
  defense-in-depth.

### Added

- **`SHA256SUMS.txt` published next to the binaries on every
  release.** A new `Generate SHA256SUMS.txt` step in `release.yml`
  runs `sha256sum` (Linux native + Git Bash on windows-latest) over
  the freshly built artifacts and emits a standard one-line-per-file
  manifest, then includes it in the upload glob alongside the .exe
  / .AppImage / .deb. Closes the gap created in v1.2.3 when
  electron-builder's `--publish always` (which used to publish
  `latest.yml` with SHA512 hashes) was replaced by a manual upload
  glob that did not pick those files up. Restores the
  `Get-FileHash` / `sha256sum -c` verification path the README
  promised.

### Changed

- **README.fr — `DiceKey` mention removed from the auth section.**
  The active flow is mnemonic + KeyVault password; DiceKey was
  documented as a fallback alternative but the project plan is to
  replace that secondary path with the **Eidolon vault** (when
  CipherMobile lands). Demoting the DiceKey paragraph and
  pointing forward keeps the doc honest without naming an
  ecosystem that is not yet shipped.
- **`LISEZ-MOI.txt`** — removed the "DiceKey : Clé physique
  Dice-Key (6 mots)" line from the auth quickstart.

## v1.2.5 — Real-world WebRTC reliability

A tester running v1.1.3 reported audio/video calls failing across
networks on 2026-05-01. The audit found that the call stack worked
locally but had no path to traverse symmetric NAT, no permission
plumbing on Electron 28+, and a signature freshness window too tight
for slow accept-on-ring on real mobile networks. None of these are
visible when both peers sit on the same LAN, which is why the
regression had survived to v1.2.4.

### Fixed

- **Cross-NAT calls** — `apps/frontend/src/lib/calls/CallManager.ts`
  and `apps/frontend/src/lib/p2p/webrtc.ts` listed only Google STUN
  servers. Behind symmetric NAT, corporate firewalls, or 4G/5G with
  carrier-grade NAT, ICE silently failed and the call hung on
  "connecting". Centralised the ICE configuration in
  `apps/frontend/src/lib/calls/iceConfig.ts` with a public Open
  Relay TURN fallback (Metered) and `VITE_TURN_URL` /
  `VITE_TURN_USERNAME` / `VITE_TURN_CREDENTIAL` env overrides for
  production deployments that want a dedicated relay (coturn,
  Twilio NTS, Metered paid).
- **Signaling latency on restricted networks** —
  `apps/frontend/src/hooks/useSocket.ts` opened Socket.IO with
  `transports: ['polling', 'websocket']`, doubling round-trip time
  on networks that allow WS upgrades. Flipped to websocket-first;
  polling kept as the fallback.
- **Stale call signatures on slow accept** —
  `apps/frontend/src/lib/calls/callSecurity.ts` capped signature
  freshness at 120s, which was too tight when the callee took a
  while to pick up on a high-RTT mobile network. Bumped to 600s;
  the `ReplayProtectionCache` TTL follows the same constant.
- **Silent getUserMedia denial on Electron 28+** — `main.js` had no
  `setPermissionRequestHandler` for `media`, so Chromium rejected
  the mic/camera prompt without surfacing it to the renderer. Added
  an allowlist scoped to the project's own origins (Vite dev,
  `file://` packaged build, `https://cipher-bridge.fly.dev`).
- **Invisible (but clickable) Windows tray icon** — `main.js` was
  loading the 512×512 `assets/icon.png` for the tray, which the
  Windows shell couldn't downscale cleanly and left a "ghost slot"
  in the system tray (visible space, no glyph). Switched to the
  multi-resolution `assets/icon.ico` on Windows so the shell picks
  the right size for the current DPI; Linux keeps the PNG but now
  resized to 22 px before being passed to `Tray()`.

### Changed

- **`apps/frontend/.env.production` gains optional `VITE_TURN_*`
  variables.** Operators can point Cipher at their own TURN relay
  by setting these three values; the public Open Relay fallback
  applies when they are unset. This is the recommended path for any
  deployment expecting more than a handful of concurrent calls —
  the public relay is shared with the entire WebRTC ecosystem and
  saturates under load.

### Internal

- Removed the unused `checksums` placeholder in
  `apps/frontend/src/components/settings/BackupSettings.tsx`. The
  DiceKey export path it was reserved for throws before reaching
  it (L1-T13 refactor pending). The unused declaration was the
  only remaining `tsc --noEmit` failure on master.

### Notes for testers

- The v1.2.5 installer must be redistributed to existing testers —
  the call fix is entirely in the frontend bundle baked into the
  `.exe` / `.AppImage`, so v1.1.3 testers will not pick it up
  automatically. The bridge on `cipher-bridge.fly.dev` is
  unchanged and does **not** need redeployment.
- Fly.io deployment of the bridge remains a manual `flyctl deploy`
  step (no GitHub Action wires it up). Skip it for v1.2.5.

## v1.2.4 — Time-Lock activated (drand/tlock)

The drand/tlock client integration that has been sitting dark since
v1.1 is now lit. Time-locked messages encrypt their plaintext with
identity-based encryption (BLS12-381) towards a future drand round
on the League of Entropy mainnet beacon. The lock is **cryptographic,
not server-enforced** — neither a modified client nor a compromised
server can serve the message early. Recipients see a countdown and
the ciphertext decrypts itself the moment drand publishes the round
signature.

### Changed

- **`TIMELOCK_ENABLED` feature flag retired.** Removed from
  `apps/frontend/src/config.ts`, `apps/bridge/src/config.ts`,
  `apps/frontend/src/components/conversations/MessageInput.tsx`
  (the Time-Lock pill is now permanent in the composer),
  `apps/frontend/src/screens/Conversations.tsx`, and the bridge
  message-send route. The corresponding env vars
  (`TIMELOCK_ENABLED` server-side, `VITE_TIMELOCK_ENABLED`
  client-side) and the `fly.toml` env entry were dropped.
- **Bridge server-side gate removed.** `apps/bridge/src/routes/messages.ts`
  no longer rejects `unlockBlockHeight` with HTTP 403. The field
  (still named `unlockBlockHeight` for backwards-compat with the
  DB column `unlock_block_height` — semantically a drand round
  number) is shape-validated and stored opaquely.
- **`docs/azure-trusted-signing.md` stays the only un-shipped piece
  of the alpha release pipeline** — Azure account provisioning is
  still pending (ETA next week per the v1.2.3 note); when active,
  the v1.2.4 `.exe` and onwards will be Microsoft-signed.

### Notes

- The drand/tlock decryption side (`TlockGate` component, `lib/tlock.ts`,
  `tlock-js` dependency, `looksLikeTlockCiphertext` heuristic) was
  already shipped in earlier versions, just gated behind the now-removed
  flag. No behaviour change for messages received without
  `unlock_block_height`.
- DB schema unchanged: the `unlock_block_height` column still exists
  and now holds a drand round number. No migration needed.

## v1.2.3 — UI polish + Windows code-signing scaffold

Three small UI fixes plus opt-in scaffolding for Microsoft-validated
code signing of the Windows installer. No behavior change for the
backend or the protocol.

### Fixed

- **Group creation modal — search input icon overlap.** The 🔍 icon
  was rendered on top of the placeholder text. Root cause: `.input`
  in `fluidCrypto.css:601` uses the shorthand `padding: 0.875rem 1rem`,
  which has the same CSS specificity as Tailwind's `pl-12` and won
  the cascade because it loads later. Forced Tailwind's padding-left
  to win with `!pl-12` in `GroupConversationModal.tsx`.
- **Settings → Contribution — Stripe amount input felt non-editable.**
  The input used `cosmic-input` alone, which reserves `padding-left:
  2.75rem` for an icon that does not exist on this field. The cursor
  appeared 44 px to the right of the visible left edge, making it
  look like the input was disabled. Added `cosmic-input-plain` to
  cancel the reserved padding.

### Changed

- **Settings → Security — "Détails techniques" section.** Title
  shortened to a single word per locale (`Détails` / `Details` /
  `Detalles` / `Dettagli` / `Detalhes` / `Детали` / `详情` /
  `Details`). Removed the dismissive description "Pour les curieux.
  Rien à faire ici." in all 8 locales (`details_desc` key dropped
  with the `<p>` that rendered it).

### Added

- **`.github/workflows/release.yml` — opt-in Azure Trusted Signing
  for the Windows installer.** A new `Sign Windows installer` step
  signs every `.exe` produced by electron-builder before upload to
  the GitHub Release. Gated behind the repo variable
  `AZURE_SIGNING_ENABLED='true'` so the workflow keeps running
  unsigned until an Azure Trusted Signing account is provisioned.
  electron-builder switched to `--publish never` and a separate
  `softprops/action-gh-release@v2` step publishes the (now signed)
  artifacts on tag push. See `docs/azure-trusted-signing.md` for
  the full setup procedure (~30 min one-time).
- **`docs/azure-trusted-signing.md`** — runbook covering Azure
  account provisioning, identity validation, service-principal
  creation, the exact list of GitHub secrets / variables to add,
  signature verification on the user's machine, SmartScreen
  reputation behavior, cost reality (~$10/month USD), and the
  emergency disable switch.

## v1.2.2 — System tray + group classification fix

Polish pass on the 1.2.x line: a system-tray entry-point on the Electron
desktop, a fix for legacy group conversations being misclassified as
1:1, and a perf pass on the chat scroll. No protocol or wire-format
change — direct (1:1) and group conversations remain compatible with
1.2.0 / 1.2.1 clients.

### Added

- **System tray support** (Electron). Closing the window minimizes
  Cipher to the system tray instead of quitting; the tray icon offers
  Open / Quit. New toggle in Settings → General → "Window behavior"
  (`minimize_to_tray`, persisted in userData by the main process).
  Tray menu locale is mirrored from the renderer at startup and on
  every `i18n.languageChanged`. New IPC surface
  `window.electron.tray.{getPref, setPref, setLocale, quitNow}`
  exposed via `preload.cjs`.
- **`db:migrate:fix-group-type`** npm script + migration
  `008_fix_legacy_group_type.sql`. Promotes any `conversations` row
  with a group-only signal (`created_by IS NOT NULL`,
  `encrypted_title IS NOT NULL`, or `> 2` members) back to
  `type='group'`. Idempotent. Bumps `schema_version` to `2.5.1`.

### Fixed

- **Group conversations rendered under "1:1 CONVERSATIONS"** with the
  fallback title "Untitled group" / "Groupe sans nom". Root cause:
  rows whose `type` column was left at the DEFAULT `'direct'` despite
  carrying group-only fields. `lib/conversations/helpers.ts` now
  infers an `effectiveType()` from `createdBy`, `encryptedTitle`, and
  `memberCount > 2`. All call-sites
  (`isGroupConversation`, `isDirectConversation`, `isConversationOwner`,
  `getDirectPeer`, `getConversationTitle`) route through this helper.
  Migration 008 fixes the same rows server-side.
- **Forced-reflow violation (~38–44 ms) on every message arrival.**
  Auto-scroll in `Conversations.tsx` rewritten: replaced
  `scrollIntoView({ behavior: 'smooth' })` (whose per-frame layout
  reads were the dominant cost) with a single direct write
  `container.scrollTop = container.scrollHeight`, deferred to
  `requestAnimationFrame`. Force-pins to the bottom on conversation
  switch; otherwise only when the user is already within 200 px of
  the bottom — no longer yanks them out of an upward read.
- **Logout flow on Settings → Security**. Replaced
  `window.location.href = '/'` (which crashed under a Zustand
  re-render race against a null session) with the same
  flush-cache → wipe-keys → clear-session → navigate sequence used in
  `Conversations.tsx`.

### Changed

- **Sidebar conversation list** (`ConversationList.tsx`). Each section
  now carries an icon (👤 / 👥), a count pill, and a horizontal
  separator between the 1:1 and Group sections. Visual disambiguation
  no longer relies on text alone.
- **i18n**: added `conversations.direct_section` and
  `conversations.group.section_title` to all 8 locales (en, fr, de,
  es, it, pt, ru, zh-CN). Native translations, not EN-mirror.

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
