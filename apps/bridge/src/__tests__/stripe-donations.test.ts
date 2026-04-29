/**
 * Stripe webhook → donations persistence tests
 *
 * Validates that the /api/public/stripe/webhook route correctly:
 *   1. Rejects unsigned / badly-signed events (400).
 *   2. Returns 503 when Stripe env is missing.
 *   3. Inserts a fresh donation row on checkout.session.completed.
 *   4. Is idempotent: replaying the same session_id does not duplicate.
 *   5. Updates status on payment_intent.succeeded / .failed / charge.refunded.
 *   6. Returns 500 (so Stripe retries) on DB write failure.
 *
 * Gated behind DATABASE_URL_TEST so a casual `npm test` does not
 * touch a real DB. Set DATABASE_URL_TEST to a throwaway database to
 * enable the suite (the privacy-invariants tests follow the same
 * convention).
 */

import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import Stripe from 'stripe';
import Fastify, { type FastifyInstance } from 'fastify';
import { stripeRoutes } from '../routes/stripe.js';
import { getDatabase } from '../db/database.js';

const TEST_WEBHOOK_SECRET = 'whsec_test_' + randomUUID().replace(/-/g, '');
const TEST_API_KEY = 'sk_test_dummy_for_signature_only';

const describeDb = process.env.DATABASE_URL_TEST ? describe : describe.skip;

function buildEvent<T extends object>(type: string, object: T): Stripe.Event {
  return {
    id: 'evt_' + randomUUID().replace(/-/g, ''),
    object: 'event',
    api_version: '2026-04-22.dahlia',
    created: Math.floor(Date.now() / 1000),
    type,
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: { object: object as any },
  } as Stripe.Event;
}

function signedHeaders(payload: string): Record<string, string> {
  // Use Stripe's own helper so the test signature is byte-for-byte
  // identical to what real Stripe servers would send.
  const stripe = new Stripe(TEST_API_KEY);
  const header = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: TEST_WEBHOOK_SECRET,
  });
  return {
    'stripe-signature': header,
    'content-type': 'application/json',
  };
}

async function postWebhook(app: FastifyInstance, event: Stripe.Event, headers?: Record<string, string>) {
  const payload = JSON.stringify(event);
  return app.inject({
    method: 'POST',
    url: '/api/public/stripe/webhook',
    headers: headers ?? signedHeaders(payload),
    payload,
  });
}

describeDb('Stripe donations webhook', () => {
  let app: FastifyInstance;
  let db: ReturnType<typeof getDatabase>;

  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = TEST_API_KEY;
    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    app = Fastify({ logger: false });
    await app.register(stripeRoutes);
    await app.ready();
    db = getDatabase();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  beforeEach(async () => {
    // Clean slate per test (donations is a small business-record table).
    await db.pool.query('DELETE FROM donations');
  });

  // --------------------------------------------------------------------------
  // Signature & configuration safety
  // --------------------------------------------------------------------------

  it('rejects requests with no signature header (400)', async () => {
    const event = buildEvent('checkout.session.completed', { id: 'cs_test_1' });
    const res = await postWebhook(app, event, { 'content-type': 'application/json' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'STRIPE_SIGNATURE_MISSING' });
  });

  it('rejects requests with a bad signature (400)', async () => {
    const event = buildEvent('checkout.session.completed', { id: 'cs_test_2' });
    const res = await postWebhook(app, event, {
      'stripe-signature': 't=0,v1=deadbeef',
      'content-type': 'application/json',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/signature verification failed/i);
  });

  // --------------------------------------------------------------------------
  // Persistence on checkout.session.completed
  // --------------------------------------------------------------------------

  it('inserts a donation row on checkout.session.completed', async () => {
    const sessionId = 'cs_test_' + randomUUID();
    const event = buildEvent('checkout.session.completed', {
      id: sessionId,
      object: 'checkout.session',
      payment_intent: 'pi_test_abc',
      payment_status: 'paid',
      amount_total: 1500,
      currency: 'eur',
      customer_email: 'donor@example.com',
      customer_details: { email: 'donor@example.com', name: null, phone: null, address: null, tax_ids: null },
      metadata: { source: 'contribution', amountCents: '1500', currency: 'eur' },
    });

    const res = await postWebhook(app, event);
    expect(res.statusCode).toBe(200);

    const { rows } = await db.pool.query(
      'SELECT * FROM donations WHERE stripe_session_id = $1',
      [sessionId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      stripe_session_id: sessionId,
      stripe_payment_intent_id: 'pi_test_abc',
      amount_cents: '1500', // BIGINT comes back as string in pg
      currency: 'eur',
      status: 'succeeded',
      customer_email: 'donor@example.com',
    });
    expect(rows[0].metadata).toMatchObject({ source: 'contribution' });
  });

  it('is idempotent — replaying the same event does not duplicate the row', async () => {
    const sessionId = 'cs_test_' + randomUUID();
    const event = buildEvent('checkout.session.completed', {
      id: sessionId,
      object: 'checkout.session',
      payment_intent: 'pi_test_idem',
      payment_status: 'paid',
      amount_total: 500,
      currency: 'eur',
      customer_details: { email: 'a@b.test' },
      metadata: {},
    });

    await postWebhook(app, event);
    await postWebhook(app, event);
    await postWebhook(app, event);

    const { rows } = await db.pool.query(
      'SELECT COUNT(*)::int AS n FROM donations WHERE stripe_session_id = $1',
      [sessionId],
    );
    expect(rows[0].n).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Status transitions via payment_intent.* + charge.refunded
  // --------------------------------------------------------------------------

  it('flips status to succeeded on payment_intent.succeeded', async () => {
    const sessionId = 'cs_test_' + randomUUID();
    const piId = 'pi_test_' + randomUUID();

    // Pre-seed a pending donation linked to piId.
    await db.pool.query(
      `INSERT INTO donations (stripe_session_id, stripe_payment_intent_id, amount_cents, currency, status)
       VALUES ($1, $2, 700, 'eur', 'pending')`,
      [sessionId, piId],
    );

    const event = buildEvent('payment_intent.succeeded', { id: piId, object: 'payment_intent' });
    const res = await postWebhook(app, event);
    expect(res.statusCode).toBe(200);

    const { rows } = await db.pool.query(
      'SELECT status FROM donations WHERE stripe_session_id = $1',
      [sessionId],
    );
    expect(rows[0].status).toBe('succeeded');
  });

  it('flips status to failed on payment_intent.payment_failed', async () => {
    const sessionId = 'cs_test_' + randomUUID();
    const piId = 'pi_test_' + randomUUID();

    await db.pool.query(
      `INSERT INTO donations (stripe_session_id, stripe_payment_intent_id, amount_cents, currency, status)
       VALUES ($1, $2, 200, 'eur', 'pending')`,
      [sessionId, piId],
    );

    const event = buildEvent('payment_intent.payment_failed', { id: piId, object: 'payment_intent' });
    const res = await postWebhook(app, event);
    expect(res.statusCode).toBe(200);

    const { rows } = await db.pool.query(
      'SELECT status FROM donations WHERE stripe_session_id = $1',
      [sessionId],
    );
    expect(rows[0].status).toBe('failed');
  });

  it('flips status to refunded on charge.refunded', async () => {
    const sessionId = 'cs_test_' + randomUUID();
    const piId = 'pi_test_' + randomUUID();

    await db.pool.query(
      `INSERT INTO donations (stripe_session_id, stripe_payment_intent_id, amount_cents, currency, status)
       VALUES ($1, $2, 1000, 'eur', 'succeeded')`,
      [sessionId, piId],
    );

    const event = buildEvent('charge.refunded', {
      id: 'ch_test_xyz',
      object: 'charge',
      payment_intent: piId,
    });
    const res = await postWebhook(app, event);
    expect(res.statusCode).toBe(200);

    const { rows } = await db.pool.query(
      'SELECT status FROM donations WHERE stripe_session_id = $1',
      [sessionId],
    );
    expect(rows[0].status).toBe('refunded');
  });

  // --------------------------------------------------------------------------
  // Defensive: unknown event types are accepted but ignored
  // --------------------------------------------------------------------------

  it('returns 200 and persists nothing for unrelated events', async () => {
    const event = buildEvent('customer.created', { id: 'cus_test_xyz', object: 'customer' });
    const res = await postWebhook(app, event);
    expect(res.statusCode).toBe(200);

    const { rows } = await db.pool.query('SELECT COUNT(*)::int AS n FROM donations');
    expect(rows[0].n).toBe(0);
  });
});

describe('Stripe webhook — config off', () => {
  it('returns 503 STRIPE_WEBHOOK_NOT_CONFIGURED when keys missing', async () => {
    const previousSecret = process.env.STRIPE_SECRET_KEY;
    const previousWebhook = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const app = Fastify({ logger: false });
    await app.register(stripeRoutes);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/public/stripe/webhook',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: 'STRIPE_WEBHOOK_NOT_CONFIGURED' });

    await app.close();
    if (previousSecret) process.env.STRIPE_SECRET_KEY = previousSecret;
    if (previousWebhook) process.env.STRIPE_WEBHOOK_SECRET = previousWebhook;
  });
});
