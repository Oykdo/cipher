import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { z } from 'zod';
import { getDatabase } from '../db/database.js';

type DonationStatus = 'pending' | 'succeeded' | 'failed' | 'refunded';

async function upsertDonationFromSession(session: Stripe.Checkout.Session, status: DonationStatus) {
  const db = getDatabase();
  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);
  const email = session.customer_details?.email ?? session.customer_email ?? null;
  const amount = session.amount_total ?? 0;
  const currency = (session.currency ?? 'eur').toLowerCase();

  await db.pool.query(
    `INSERT INTO donations
       (stripe_session_id, stripe_payment_intent_id, amount_cents, currency, status, customer_email, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (stripe_session_id) DO UPDATE SET
       stripe_payment_intent_id = COALESCE(EXCLUDED.stripe_payment_intent_id, donations.stripe_payment_intent_id),
       status                   = EXCLUDED.status,
       customer_email           = COALESCE(EXCLUDED.customer_email, donations.customer_email),
       metadata                 = COALESCE(EXCLUDED.metadata, donations.metadata),
       updated_at               = NOW()`,
    [
      session.id,
      paymentIntentId,
      amount,
      currency,
      status,
      email,
      session.metadata ? JSON.stringify(session.metadata) : null,
    ],
  );
}

async function updateDonationStatusByPaymentIntent(paymentIntentId: string, status: DonationStatus) {
  const db = getDatabase();
  await db.pool.query(
    `UPDATE donations
        SET status     = $1,
            updated_at = NOW()
      WHERE stripe_payment_intent_id = $2`,
    [status, paymentIntentId],
  );
}

// Donation cap = 10 000 EUR / transaction. Below 1 EUR Stripe itself
// rejects (its minimum charge is around 0.50 EUR depending on currency),
// above 10 000 EUR is a deliberate guardrail against typos rather than
// a Stripe limit (Stripe accepts up to ~999 999.99 per transaction).
// A donor wanting to give more than 10 000 EUR can split the payment
// or contact the project directly — and is probably someone we want
// to know.
const AMOUNT_CENTS_MIN = 100;
const AMOUNT_CENTS_MAX = 1_000_000;

const createCheckoutSchema = z.object({
  amountCents: z.coerce
    .number()
    .int('Amount must be a whole number of cents')
    .min(AMOUNT_CENTS_MIN, `Amount must be at least ${AMOUNT_CENTS_MIN / 100} EUR`)
    .max(
      AMOUNT_CENTS_MAX,
      `Amount must be at most ${AMOUNT_CENTS_MAX / 100} EUR — for larger donations, please make multiple payments or contact the project`,
    ),
  currency: z
    .string()
    .trim()
    .transform((v) => v.toLowerCase())
    .optional()
    .default('eur'),
  email: z.string().email().optional(),
});

function getFrontendUrl(app: FastifyInstance): string {
  const url = process.env.FRONTEND_URL?.trim();
  if (url) return url.replace(/\/$/, '');

  // Best-effort fallback for local development.
  // In production, set FRONTEND_URL explicitly.
  void app;
  return 'http://localhost:5173';
}

export async function stripeRoutes(app: FastifyInstance) {
  app.post('/api/public/stripe/create-checkout-session', async (request, reply) => {
    const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (!secretKey) {
      reply.code(503);
      return {
        error: 'Stripe is not configured',
        code: 'STRIPE_NOT_CONFIGURED',
      };
    }

    const parsed = createCheckoutSchema.safeParse((request.body ?? {}) as unknown);
    if (!parsed.success) {
      // Surface the most actionable Zod message (typically the cap or
      // floor on amountCents) so the frontend can display "Amount must
      // be at most 10000 EUR" instead of an opaque INVALID_REQUEST.
      const firstIssue = parsed.error.issues[0];
      const message = firstIssue?.message || 'Invalid request';
      reply.code(400);
      return {
        error: message,
        code: 'INVALID_REQUEST',
        issues: parsed.error.issues,
      };
    }

    const { amountCents, currency, email } = parsed.data;
    const stripe = new Stripe(secretKey);

    const frontendUrl = getFrontendUrl(app);
    const successUrl = `${frontendUrl}/settings?stripe=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${frontendUrl}/settings?stripe=cancel`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      submit_type: 'donate',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amountCents,
            product_data: {
              name: 'Cipher — Contribution',
            },
          },
        },
      ],
      metadata: {
        source: 'contribution',
        amountCents: String(amountCents),
        currency,
      },
    });

    if (!session.url) {
      reply.code(500);
      return {
        error: 'Stripe session URL missing',
        code: 'STRIPE_SESSION_URL_MISSING',
      };
    }

    return { url: session.url };
  });

  // Stripe Webhook (production-grade signature verification)
  // Note: Stripe requires the raw request body for signature verification.
  // We register this route in an encapsulated scope with a Buffer parser.
  await app.register(
    async (webhookApp) => {
      webhookApp.addContentTypeParser(
        'application/json',
        { parseAs: 'buffer' },
        (_req, body, done) => {
          done(null, body);
        }
      );

      webhookApp.post('/webhook', async (request, reply) => {
        const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
        if (!secretKey || !webhookSecret) {
          reply.code(503);
          return {
            error: 'Stripe webhook is not configured',
            code: 'STRIPE_WEBHOOK_NOT_CONFIGURED',
          };
        }

        const signature = request.headers['stripe-signature'];
        if (typeof signature !== 'string' || signature.length === 0) {
          reply.code(400);
          return { error: 'Missing Stripe signature', code: 'STRIPE_SIGNATURE_MISSING' };
        }

        const stripe = new Stripe(secretKey);
        const rawBody = request.body as Buffer;

        let event: Stripe.Event;
        try {
          event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
        } catch (err: any) {
          reply.code(400);
          return { error: `Webhook signature verification failed: ${err?.message || 'unknown'}` };
        }

        webhookApp.log.info(
          {
            stripeEventId: event.id,
            type: event.type,
          },
          'Stripe webhook received'
        );

        try {
          switch (event.type) {
            case 'checkout.session.completed':
            case 'checkout.session.async_payment_succeeded': {
              const session = event.data.object as Stripe.Checkout.Session;
              const status: DonationStatus =
                session.payment_status === 'paid' ? 'succeeded' : 'pending';
              await upsertDonationFromSession(session, status);
              break;
            }
            case 'payment_intent.succeeded': {
              const pi = event.data.object as Stripe.PaymentIntent;
              await updateDonationStatusByPaymentIntent(pi.id, 'succeeded');
              break;
            }
            case 'payment_intent.payment_failed': {
              const pi = event.data.object as Stripe.PaymentIntent;
              await updateDonationStatusByPaymentIntent(pi.id, 'failed');
              break;
            }
            case 'charge.refunded': {
              const charge = event.data.object as Stripe.Charge;
              const piId =
                typeof charge.payment_intent === 'string'
                  ? charge.payment_intent
                  : charge.payment_intent?.id;
              if (piId) {
                await updateDonationStatusByPaymentIntent(piId, 'refunded');
              }
              break;
            }
            default:
              // Other events are acknowledged but not persisted.
              break;
          }
        } catch (err: any) {
          // DB write failed — return 5xx so Stripe retries with backoff.
          webhookApp.log.error(
            { stripeEventId: event.id, type: event.type, error: err?.message },
            'Stripe webhook persistence failed',
          );
          reply.code(500);
          return { error: 'Persistence failed', code: 'DONATION_PERSIST_FAILED' };
        }

        return { received: true };
      });
    },
    { prefix: '/api/public/stripe' }
  );
}
