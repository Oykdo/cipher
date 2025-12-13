import Stripe from 'stripe';

let stripeSingleton: Stripe | null = null;

export function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }

  if (!stripeSingleton) {
    stripeSingleton = new Stripe(secretKey, {
      // Keep options minimal; API version is configured in the Stripe dashboard.
      typescript: true,
    });
  }

  return stripeSingleton;
}
