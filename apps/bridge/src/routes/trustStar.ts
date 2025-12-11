import type { FastifyInstance } from 'fastify';
import { computeTrustStar, type TrustStarContext } from '../services/trust-star.js';

interface TrustStarQuery {
  context?: string;
  locale?: string;
}

function isValidLocale(locale: string): boolean {
  // Simple BCP-47-ish validation: alphanumerics and dashes only
  return /^[A-Za-z0-9-]+$/.test(locale);
}

export async function trustStarRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Querystring: TrustStarQuery;
  }>(
    '/api/v1/user/trust-star',
    {
      preHandler: fastify.authenticate as any,
      config: { rateLimit: fastify.trustStarLimiter as any },
    },
    async (request, reply) => {
      const rawContext = request.query.context ?? 'SETTINGS';
      const locale = request.query.locale;

      if (locale && !isValidLocale(locale)) {
        reply.code(400);
        return {
          error: {
            code: 'INVALID_LOCALE',
            message: 'Invalid locale format',
            httpStatus: 400,
            details: {
              field: 'locale',
              reason: `Unsupported value '${locale}'`,
            },
            correlationId: request.id,
          },
        };
      }

      const upperContext = rawContext.toUpperCase();
      const allowedContexts: TrustStarContext[] = ['SETTINGS', 'ONBOARDING', 'RECOVERY'];

      if (!allowedContexts.includes(upperContext as TrustStarContext)) {
        reply.code(400);
        return {
          error: {
            code: 'INVALID_CONTEXT',
            message: 'Invalid context parameter',
            httpStatus: 400,
            details: {
              field: 'context',
              reason: `Unsupported value '${rawContext}'`,
            },
            correlationId: request.id,
          },
        };
      }

      const userId = request.user?.sub as string | undefined;
      if (!userId) {
        reply.code(401);
        return {
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Authentication required',
            httpStatus: 401,
            details: {},
            correlationId: request.id,
          },
        };
      }

      try {
        const result = await computeTrustStar({
          userId,
          context: upperContext as TrustStarContext,
          locale,
          clientInfo: {
            ip: request.ip,
            userAgent: request.headers['user-agent'],
          },
        });

        return result;
      } catch (err: any) {
        fastify.log.error({ err }, 'Failed to compute Trust-Star state');

        if (err && err.statusCode === 404) {
          reply.code(404);
          return {
            error: {
              code: 'USER_NOT_FOUND',
              message: 'User not found',
              httpStatus: 404,
              details: {},
              correlationId: request.id,
            },
          };
        }

        reply.code(500);
        return {
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Unable to compute Trust-Star state',
            httpStatus: 500,
            details: {},
            correlationId: request.id,
          },
        };
      }
    },
  );
}
