import { Server as SocketIOServer } from 'socket.io';
import { RateLimitPluginOptions } from '@fastify/rate-limit';
import '@fastify/jwt';

declare module 'fastify' {
  interface FastifyInstance {
    io: SocketIOServer;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    broadcast: (userIds: string[], payload: any) => void;
    signupLimiter: RateLimitPluginOptions;
    loginLimiter: RateLimitPluginOptions;
    messageLimiter: RateLimitPluginOptions;
    uploadLimiter: RateLimitPluginOptions;
    trustStarLimiter: RateLimitPluginOptions;
    settingsLimiter: RateLimitPluginOptions;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      // Optionnel : les tokens emis avant l'ajout de ce claim n'en portent pas.
      username?: string;
      tier: string;
      b?: string;
      B?: string;
      A?: string;
      srp?: boolean;
    };
    user: {
      sub: string;
      username?: string;
      tier: string;
      b?: string;
      B?: string;
      A?: string;
      srp?: boolean;
    };
  }
}
