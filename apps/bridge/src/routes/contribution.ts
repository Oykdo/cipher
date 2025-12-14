import type { FastifyInstance } from 'fastify';
import { createHash } from 'crypto';

type ContributionTarget = {
  symbol: string;
  address: string;
  tag?: string;
};

const targets: Record<string, ContributionTarget> = {
  btc: {
    symbol: 'BTC',
    address: 'bc1pqu5zya672tma8q36ww9c6mzk7uryq6cuavqn04jqka43qjm6nxtqs8am6t',
  },
  eth: {
    symbol: 'ETH',
    address: '0x979a6093d3a1662054b89667e6dbfac001fa2617',
  },
  sol: {
    symbol: 'SOL',
    address: 'HshrizaXzs6i6yse3YjkpDsQ4S7WjRoDALeVr6tN1yM8',
  },
  xrp: {
    symbol: 'XRP',
    address: 'rspbrWJkPr8jSyz9wVVLwpxuSfosBM8ocM',
  },
  pi: {
    symbol: 'PI',
    address: 'GCUGVJDK4TY6KTVWFYXTDH2OXRSTTFQUYPLU2CH523AHCZOPWUVEVDC6',
  },
};

function getFingerprintHex(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function contributionRoutes(app: FastifyInstance) {
  app.get('/api/public/contribution-targets', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return {
      targets,
      fingerprint: getFingerprintHex(targets),
    };
  });
}
