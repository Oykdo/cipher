# Azure Trusted Signing — setup procedure for Cipher Windows builds

When this is in place, the `release.yml` workflow signs every `.exe` it
produces with a Microsoft-issued certificate. SmartScreen stops nagging
users with "Unrecognized app" warnings and most antivirus heuristics
calm down.

The integration is **already wired** in `.github/workflows/release.yml`
(see the "Sign Windows installer (Azure Trusted Signing)" step). It is
gated behind the repo variable `AZURE_SIGNING_ENABLED` — until that
variable is set to `'true'`, the signing step is silently skipped and
the build still produces an unsigned `.exe` (current behavior). So this
file is the runbook for the day you go provision the account.

---

## 1. Provision the Azure side (one-time, ~30 min)

1. **Open Azure** at https://portal.azure.com (sign in with a Microsoft
   account; create one if needed — no Azure subscription on file is
   required to start).
2. **Create a Trusted Signing account.** Search "Trusted Signing" in
   the portal, click "Create". Pick a region close to GitHub Actions
   runners (East US is a safe default). Account name e.g.
   `cipher-trusted-signing`.
3. **Create an Identity Validation request.** Trusted Signing → your
   account → Identity validation → New. Pick "Individual" (cheapest at
   ~$10/mo for a solo dev) or "Public" (organization). Submit the form;
   Microsoft asks for a passport scan + selfie. **Approval takes 1-3
   business days.**
4. **Once validated, create a Certificate Profile.** Trusted Signing →
   Certificate profiles → New. Pick the validated identity. Profile
   name e.g. `cipher-installer-signing`.
5. **Create a service principal** (so GitHub Actions can authenticate
   without storing your personal credentials):
   ```bash
   az login
   az ad sp create-for-rbac \
     --name "cipher-github-actions" \
     --role "Trusted Signing Certificate Profile Signer" \
     --scopes /subscriptions/<sub-id>/resourceGroups/<rg>/providers/Microsoft.CodeSigning/codeSigningAccounts/<account>
   ```
   This prints `appId`, `password`, `tenant`. Copy them — `password` is
   shown only once.

## 2. Wire up GitHub (one-time, ~5 min)

Go to https://github.com/Oykdo/cipher/settings → Secrets and variables
→ Actions, then add:

### Secrets (encrypted, hidden in logs)
| Name | Value |
|---|---|
| `AZURE_TENANT_ID` | `tenant` from step 5 |
| `AZURE_CLIENT_ID` | `appId` from step 5 |
| `AZURE_CLIENT_SECRET` | `password` from step 5 |

### Variables (visible — these are not secrets)
| Name | Value | Notes |
|---|---|---|
| `AZURE_SIGNING_ENABLED` | `true` | Master switch. Set to `false` to disable signing without removing secrets. |
| `AZURE_TRUSTED_SIGNING_ENDPOINT` | `https://eus.codesigning.azure.net` | Match the region of your account (e.g. `weu` for West Europe). |
| `AZURE_TRUSTED_SIGNING_ACCOUNT` | `cipher-trusted-signing` | The account name from step 2. |
| `AZURE_TRUSTED_SIGNING_PROFILE` | `cipher-installer-signing` | The profile name from step 4. |

## 3. Trigger a release

Just push a tag as usual:
```bash
git tag -a v1.2.3 -m "..."
git push origin v1.2.3
```

The workflow will:
1. Build the unsigned `.exe` with electron-builder (`--publish never`).
2. Call the Azure Trusted Signing action to sign the `.exe` in place
   (Windows job only).
3. Upload the signed `.exe` (+ the Linux `.AppImage` / `.deb`) to the
   GitHub Release via `softprops/action-gh-release`.

If signing fails (bad credentials, expired identity), the Windows job
fails — you can re-run it after fixing without re-tagging.

## 4. Verify the signature locally

After download:
```powershell
# PowerShell on the user's machine (or yours)
Get-AuthenticodeSignature .\Cipher-Setup-1.2.3.exe
```
Expect:
```
Status     : Valid
SignerCertificate : Microsoft Identity Verification CA, ...
```

In Explorer: right-click → Properties → "Digital Signatures" tab.
SmartScreen should now show "Cipher Verified Publisher: <your validated
identity>" instead of the orange "Unrecognized" warning.

## 5. Reputation note

- **Individual identity** (~$10/mo): SmartScreen reputation builds
  over the first ~500-2000 installs across ~2 weeks. During that
  window, some users may still see a one-time prompt. After that,
  zero warnings.
- **Public / Organization identity**: instant reputation, no warm-up.

For Cipher's current alpha (~tens of installs), Individual is fine and
the warm-up is faster than the EV-cert physical-token alternative.

## 6. Cost reality check

- Trusted Signing Individual: **$9.99 / month** (USD), billed monthly.
- No yearly commitment, can be cancelled.
- Unlimited signatures, unlimited file sizes.
- No HSM token to lose / break / replace.

For comparison: a traditional EV cert (DigiCert, Sectigo, SSL.com) runs
$400-700 / year + a mandatory HSM USB token (~$80) since the
CA/Browser Forum 2023 rule change. Trusted Signing is the modern path.

## 7. Disabling signing temporarily

If signing breaks (Azure outage, rotated secret, expired identity) and
you need to ship an unsigned build right now:
- Set the repo variable `AZURE_SIGNING_ENABLED` to `false` (or delete
  it). The workflow will skip the sign step and ship an unsigned .exe.
- Re-tag and push. SmartScreen warnings come back, but the build ships.

## 8. Related — what is NOT signed by this setup

- `.AppImage` / `.deb` (Linux). Linux package signing is a different
  problem (GPG-based, distro-specific). Not in scope here.
- macOS `.dmg` / `.app`. Apple has its own notarization + Developer ID.
  Cipher waits on the CipherMobile launch to subscribe to the
  $99/year Apple Developer Program (one ticket = Mac + iOS).
- The bridge Docker image on Fly. Container signing (cosign / Notary
  v2) is a separate concern; out of scope for the desktop release.
