# Stripe — local testing guide

Walks through the loop "trigger an event from the Stripe CLI → see your bridge handle it → see the row in the local `donations` table".

For the **production** webhook (already wired to `https://cipher-bridge.fly.dev/api/public/stripe/webhook`), see the bottom of this doc.

## Why local testing matters

The webhook handler in `apps/bridge/src/routes/stripe.ts` does three things:
1. Verifies the Stripe-issued signature on every event (mandatory, otherwise the route 400s).
2. Upserts a row into the `donations` table.
3. Updates that row on `payment_intent.succeeded` / `.payment_failed` / `charge.refunded`.

The only safe way to exercise (1) is with a real Stripe-signed payload. That's what the Stripe CLI's `stripe listen` + `stripe trigger` flow gives you, in test mode, with a throwaway test webhook secret.

## One-time setup

### 1. Install Stripe CLI

```powershell
winget install --id Stripe.StripeCli
# OR download a release: https://github.com/stripe/stripe-cli/releases/latest
```

After install, **open a fresh PowerShell** (the PATH only loads new entries on shell start) and check:

```powershell
stripe version
```

### 2. Pair the CLI with your Stripe account

```powershell
stripe login
```

A browser window opens, you confirm the pairing code displayed in the terminal. Done — the CLI now uses your test-mode account by default.

### 3. Get a `sk_test_*` for the bridge

1. Stripe Dashboard → toggle **Test mode** ON (top-right)
2. https://dashboard.stripe.com/test/apikeys
3. Reveal the **Secret key** (starts with `sk_test_`)
4. Paste it into `apps/bridge/.env`:
   ```
   STRIPE_SECRET_KEY=sk_test_***
   ```

You'll fill `STRIPE_WEBHOOK_SECRET` in the next step (it's CLI-generated, not Dashboard-generated).

## The dev loop

You'll need three terminals open at once.

### Terminal 1 — Bridge

```bash
cd apps/bridge
npm run dev
```

Wait until you see `Bridge server listening on port 4000`.

### Terminal 2 — Stripe CLI listener

```powershell
stripe listen --forward-to localhost:4000/api/public/stripe/webhook
```

The CLI prints a line like:
```
> Ready! Your webhook signing secret is whsec_test_abc123def456 (^C to quit)
```

**Copy that `whsec_test_*`** into `apps/bridge/.env` as `STRIPE_WEBHOOK_SECRET=whsec_test_***`, then restart the bridge (Terminal 1) so it picks up the new env.

The listener now relays every Stripe test event to your bridge, signed with that secret.

### Terminal 3 — Trigger events

```powershell
# Simulate a successful donation
stripe trigger checkout.session.completed

# Simulate a failed payment
stripe trigger payment_intent.payment_failed

# Simulate a refund
stripe trigger charge.refunded
```

You should see, in order:
- **Terminal 3** confirms the event was created
- **Terminal 2** shows `--> checkout.session.completed [evt_test_*]` then `<-- [200] POST http://localhost:4000/...`
- **Terminal 1** logs `Stripe webhook received` with the event ID

### Verify the DB write

```bash
docker exec cipher-pg psql -U postgres -d cipher_dev -c \
  "SELECT id, stripe_session_id, status, amount_cents, currency FROM donations ORDER BY created_at DESC LIMIT 5"
```

You should see one row per `checkout.session.completed` you triggered, with `status = 'succeeded'`.

## Known caveats

- `stripe trigger checkout.session.completed` fabricates a synthetic session with a small amount (typically $20.00 USD). The metadata won't include your `source: contribution` tag — that's only set by the real `/create-checkout-session` route. Filtering by metadata in the handler must therefore be loose.
- The `whsec_test_*` from `stripe listen` is **session-scoped**: every time you restart `stripe listen`, you get a new secret. Update `.env` and restart the bridge whenever this happens.
- If the bridge logs `Webhook signature verification failed`, the CLI secret in `stripe listen` doesn't match the `STRIPE_WEBHOOK_SECRET` in `.env` — re-paste and restart.

## Production webhook (Fly)

The production webhook destination on Stripe Dashboard points to `https://cipher-bridge.fly.dev/api/public/stripe/webhook`. Its `whsec_*` lives ONLY in `fly secrets`:

```powershell
fly secrets list --app cipher-bridge
# Look for STRIPE_WEBHOOK_SECRET
```

To rotate it (e.g. after a leak):
1. Stripe Dashboard → Workbench → Webhooks → click the destination → "Roll secret"
2. Push the new value to Fly using a Read-Host so it never enters the shell history:
   ```powershell
   $key = Read-Host "Paste new whsec" -AsSecureString
   $plainKey = [System.Net.NetworkCredential]::new("", $key).Password
   fly secrets set "STRIPE_WEBHOOK_SECRET=$plainKey" --app cipher-bridge
   Remove-Variable key, plainKey
   ```
3. Verify with `fly secrets list --app cipher-bridge` — the DIGEST should have changed.

To smoke-test the prod webhook:
1. Wake the Fly machine (`fly machines start --app cipher-bridge` then `fly logs --app cipher-bridge`).
2. Stripe Dashboard → the webhook destination → "Send test event".
3. Watch for `Stripe webhook received` in `fly logs`.
