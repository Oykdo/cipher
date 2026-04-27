# Infrastructure notes

Operational follow-ups that are not blocking the current sprint but
should be revisited once the L1 launch is stable. Keep this list
short — items belong here only if they affect production posture or
user-perceptible behavior.

---

## Region mismatch: Fly (Paris) ↔ Neon (US East 1, N. Virginia)

**Status**: known, accepted for L1 launch.

**Discovered**: 2026-04-27 during DESK-2 (Fly.io bridge deployment).

### Symptoms

Each query the bridge issues against PostgreSQL crosses the Atlantic
(Paris → Virginia, ~80–100 ms RTT). For a single message send (typical
flow: SELECT user → INSERT message → SELECT conversation_members →
UPDATE conversation last_message_at), this stacks 4–6 round trips,
adding ~400–600 ms of perceived latency before the WebSocket broadcast
fires.

For a messenger this is **noticeable but not broken** — Signal,
WhatsApp, etc. typically deliver under 200 ms in steady state.
Acceptable for the initial L1 ship; not acceptable long-term.

### Why it happened

The Neon project was created in November 2025 (pre-Cipher dev), default
region `aws-us-east-1`. The Fly app was created in April 2026 with
`primary_region = "cdg"` (Paris) to optimize for likely-EU users. The
two were never co-located.

### Two ways to fix (V1+)

| Option | What it changes | Effort | Trade-off |
|---|---|---|---|
| **A** — Migrate Neon project to `aws-eu-central-1` (Frankfurt) | Wipe + recreate schema on a new Neon project in Frankfurt; update `DATABASE_URL` in Fly secrets | ~15 min (schema is L1-clean and idempotent) | Loses the existing `metadata.schema_version` row; requires forced re-signup of any users created in the meantime |
| **B** — Migrate Fly app to `iad` (US East 1) | `fly regions set iad` + redeploy | ~5 min | Worse latency for European users; better for US/global |

**Recommendation**: Option A once we have ≥10 real users in EU OR if a
user reports perceptible slowness. The L1 wipe has just happened, so
the cost of doing it again is near zero — if we want to be proactive,
do it before any production users sign up.

### Decision triggers (when to act)

- A user complains that messages "lag" or feel slow.
- The Fly logs show `[MESSAGES] DB query took >200ms` on average.
- Before a public launch / press cycle (latency is part of first
  impression).

### Notes for whoever picks this up

- Neon project regions cannot be changed in place — you create a new
  project in the target region, get a new connection string, run
  `psql -f apps/bridge/scripts/schema_postgresql.sql` on it, then
  swap the `DATABASE_URL` Fly secret. Old project can be archived
  afterward.
- The privacy invariant tests must pass against the new DB before
  swapping. Run `cd apps/bridge && DATABASE_URL_TEST=<new_neon_url>
  npm run test:invariants` first.
- Consider running both projects in parallel for an hour to compare
  latency in `fly logs` before the switch — Neon free tier allows
  multiple small projects.

---

*Document maintained by the privacy-l1 sprint. Append new entries with
a Status / Discovered / Symptoms / Why / Fix structure so future
contributors can triage at a glance.*
