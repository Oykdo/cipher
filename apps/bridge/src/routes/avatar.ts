import type { FastifyInstance } from 'fastify';
import { avatarService } from '../services/avatarService.js';

export async function avatarRoutes(fastify: FastifyInstance) {
    fastify.post<{ Body: { checksums: string[]; userId?: string } }>(
        '/api/generate-dicekey-avatar',
        {
            config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
        },
        async (request, reply) => {
            const { checksums, userId } = request.body;

            if (!checksums || !Array.isArray(checksums) || checksums.length !== 30) {
                reply.code(400);
                return { error: 'Invalid checksums provided' };
            }

            try {
                // If user is authenticated, use their ID automatically to store the hash
                let effectiveUserId = userId;
                try {
                    await request.jwtVerify();
                    const authenticatedUserId = (request.user as any)?.sub;
                    if (authenticatedUserId) {
                        effectiveUserId = authenticatedUserId;
                        request.log.info({ userId: effectiveUserId }, 'Generating avatar for authenticated user');
                    }
                } catch {
                    // Not authenticated - that's fine, might be signup flow
                    request.log.info('Generating avatar for unauthenticated request');
                }

                const result = await avatarService.generateAvatar(checksums, effectiveUserId);
                return { success: true, avatarUrl: result.url, avatarHash: result.hash };
            } catch (error) {
                request.log.error(error);
                reply.code(500);
                return { error: 'Failed to generate avatar' };
            }
        }
    );
}
