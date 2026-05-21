# Cipher v1.3.2 — Release Notes

**Date:** 2026-05-16
**Tag:** `v1.3.2`
**Platforms:** Windows (.exe), Linux (.AppImage + .deb)

---

## Context

Cipher is the first client to integrate Eidolon's post-quantum vault identity system. This release fixes the critical path that was blocking Eidolon keybundle authentication against the remote bridge. Without these fixes, importing a vault keybundle into Cipher would systematically fail with a 401 error.

---

## What changed

### Eidolon keybundle import — fixed end-to-end

The previous flow was broken at three points:

1. **The Electron client sent a local Windows file path (`C:\Users\...\.psnx`) to the remote Fly.io bridge.** The bridge tried to read the file from its own disk → file not found → 401 "Cannot verify PSNX file". The client now uploads the `.psnx` file content (base64) so the bridge can compute the SHA-256 hash itself. The bridge stores only the hash (64 hex chars), never the file bytes.

2. **The Eidolon Connect session flow returned "invalid signature" on every attempt.** The `probeEidolonConnect` IPC handler treated the `POST /connect/apps/register` HMAC rejection as fatal. It now falls through gracefully, matching the frontend's `eidolonConnect.ts` behavior. More importantly, the Electron client no longer needs Eidolon Connect at all for vault authentication — it uses direct PSNX hash proof instead.

3. **The bridge's Path B verification checked `psnxPath` (local file) before `psnxFileBase64` (upload).** When both were present, it hit the local-file branch first and failed. The priority is now: stored hash → uploaded file → local file read.

### Bundled Python venv — keybundle CLI works out of the box

The `keybundle_cli.py` Eidolon script requires `numpy` and `cryptography`. Previously, these had to be installed globally on the user's machine. The build now bundles a minimal Python venv with these dependencies inside the Electron package (`resources/Eidolon/venv/`). The `resolveEidolonPython()` function prefers this venv when available.

### Bridge deployed

The Fly.io bridge (`cipher-bridge.fly.dev`) is updated with all auth changes. No action needed on your end.

---

## What works now

| Flow | Status |
|---|---|
| Import `.eidolon_keybundle` in Cipher (Electron) | Works |
| Authenticate with remote bridge via PSNX hash proof | Works |
| First registration: client uploads `.psnx`, bridge computes hash | Works |
| Return visits: bridge verifies against stored hash | Works |
| Local bridge: bridge reads `.psnx` from disk (unchanged) | Works |
| Quick Unlock with password (BIP-39 accounts) | Works |
| 1-to-1 E2EE messages | Works |
| Group conversations (2–10, e2ee-v2) | Works |

---

## What does NOT work yet

| Flow | Status | Why |
|---|---|---|
| Eidolon Connect session flow | Broken (HMAC secret not configured on bridge) | Bypassed — PSNX hash proof is used instead |
| macOS packaged build | Not shipped | CI matrix removed — no test capacity |
| Code signing (Windows/macOS) | Not active | Azure Trusted Signing not yet provisioned |
| Mobile (CipherMobile) | In design | React Native + Expo, same crypto core |

---

## How to test

### If you already have an Eidolon vault

1. Open Eidolon, export your vault as a `.eidolon_keybundle` file.
2. Open Cipher v1.3.1. On the login screen, choose **"Import keybundle"**.
3. Select the `.eidolon_keybundle` file.
4. Cipher extracts the `.psnx` + `.blend_data`, derives your vault key, registers the vault, and authenticates with the bridge.
5. You should land on the conversations screen with your Eidolon-linked username.

If something fails, note the exact error message and the step where it happens. Open an issue at https://github.com/Oykdo/cipher/issues with:
- OS + Cipher version
- The error text
- Whether your vault was created with Eidolon's GUI or CLI
- Whether PQ was enabled during key generation

### If you don't have an Eidolon vault yet

1. Clone the Eidolon repo (`../Eidolon` from the Cipher checkout, or `https://github.com/Oykdo/eidolon`).
2. Install Python 3.10+ and `pip install -r requirements.txt`.
3. Run the key generator:
   ```
   python -m src.cli genesis --name <your-name> --surface granite
   ```
   This creates a `.psnx` + `.blend_data` pair in `%LOCALAPPDATA%\Eidolon\keys\`.
4. (Optional) Create a keybundle for portability:
   ```
   python scripts/public/keybundle_cli.py export --vault-id <your-vault-id>
   ```
5. Import the keybundle into Cipher as above.

### Edge cases worth testing

- **Vault file moved after import.** Move or rename the `.psnx` file, then restart Cipher and try to log in. The stored hash should still authenticate — the bridge doesn't need the file again.
- **Re-import the same keybundle on a second device.** The machine-lock rule prevents a second registration — Cipher should surface the existing vault identity and still authenticate.
- **Bridge fallback.** If the Fly.io bridge is temporarily down, the Electron app should show a clear connection error, not a silent hang.

---

## Architecture note

The PSNX hash proof flow:

```
First registration:
  Client                          Bridge (Fly.io)
  ──────                          ───────────────
  reads .psnx from disk
  computes SHA-256
  sends file bytes (base64)  ───► computes SHA-256 itself
                                  stores hash in user_settings
                                  discards file bytes
  receives session tokens    ◄─── returns JWT + refresh token

Return visits:
  Client                          Bridge (Fly.io)
  ──────                          ───────────────
  reads .psnx from disk
  computes SHA-256
  sends hash only            ───► compares against stored hash
                                  if match → authenticate
  receives session tokens    ◄─── returns JWT + refresh token
```

The bridge never stores the `.psnx` file content. Only the SHA-256 hash is persisted. The file upload is ephemeral and exists only to prove possession on first registration (no trust-on-first-use).

---

## For the next release

- Eidolon Connect HMAC secret provisioning (eliminates the bypass)
- Azure Trusted Signing for Windows binaries
- macOS build + Apple Developer signing
- CipherMobile alpha
