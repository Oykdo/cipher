import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getStripe } from '../services/stripe.js';

const CreateCheckoutSessionSchema = z
  .object({
    // Option A (recommended): use a predefined Price ID created in Stripe dashboard
    priceId: z.string().min(1).optional(),
    quantity: z.number().int().positive().default(1).optional(),

    // Option B: ad-hoc amount (useful for a "donation" flow)
    amount: z.number().int().positive().optional(), // in the smallest currency unit (e.g. cents)
    currency: z.string().min(3).max(10).default('eur').optional(),
    productName: z.string().min(1).default('Cipher Pulse').optional(),

    successUrl: z.string().url(),
    cancelUrl: z.string().url(),
  })
  .refine((v) => Boolean(v.priceId) || Boolean(v.amount), {
    message: 'Either priceId or amount must be provided',
    path: ['priceId'],
  });

export async function paymentsRoutes(app: FastifyInstance) {
  app.post('/api/v2/payments/checkout-session', {
    preHandler: app.authenticate,
    config: { rateLimit: (app as any).settingsLimiter as any },
  }, async (request, reply) => {
    try {
      const data = CreateCheckoutSessionSchema.parse((request as any).body ?? {});

      const stripe = getStripe();
      const userId = (request as any).user?.sub;

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        success_url: data.successUrl,
        cancel_url: data.cancelUrl,
        metadata: userId ? { userId } : undefined,
        line_items: [
          data.priceId
            ? { price: data.priceId, quantity: data.quantity ?? 1 }
            : {
                quantity: 1,
                price_data: {
                  currency: data.currency ?? 'eur',
                  unit_amount: data.amount!,
                  product_data: {
                    name: data.productName ?? 'Cipher Pulse',
                  },
                },
              },
        ],
      });

      return { id: session.id, url: session.url };
    } catch (err: any) {
      if (err?.name === 'ZodError') {
        reply.code(400);
        return { error: 'Invalid request', details: err?.issues };
      }

      // Most common during setup: missing STRIPE_SECRET_KEY
      const msg = err?.message || 'Failed to create checkout session';
      app.log.error({ err }, 'Stripe checkout-session failed');
      reply.code(msg.includes('STRIPE_SECRET_KEY') ? 501 : 500);
      return { error: msg };
    }
  });
}
