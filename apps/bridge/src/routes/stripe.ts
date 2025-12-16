import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { z } from 'zod';

const createCheckoutSchema = z.object({
  amountCents: z.coerce.number().int().min(100).max(250_000),
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
      reply.code(400);
      return {
        error: 'Invalid request',
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
              name: 'Cipher Pulse — Contribution',
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

        // Minimal handling: log useful events. Extend later to record contributions.
        webhookApp.log.info(
          {
            stripeEventId: event.id,
            type: event.type,
          },
          'Stripe webhook received'
        );

        switch (event.type) {
          case 'checkout.session.completed':
          case 'checkout.session.async_payment_succeeded':
          case 'payment_intent.succeeded': {
            // For contributions, you can read metadata here.
            // const obj = event.data.object as any;
            break;
          }
          default:
            break;
        }

        return { received: true };
      });
    },
    { prefix: '/api/public/stripe' }
  );
}
