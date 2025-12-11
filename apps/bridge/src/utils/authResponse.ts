import { FastifyReply, FastifyRequest } from 'fastify';
import { createRefreshToken } from './refreshToken.js';

export async function generateAuthResponse(
    reply: FastifyReply,
    request: FastifyRequest,
    user: any,
    extraData: Record<string, any> = {}
) {
    const token = await reply.jwtSign({ sub: user.id, tier: user.security_tier });
    const userAgent = request.headers['user-agent'];
    const ipAddress = request.ip;
    const { token: refreshToken } = await createRefreshToken(user.id, userAgent, ipAddress);

    // Base response structure
    const response = {
        accessToken: token,
        refreshToken,
        user: {
            id: user.id,
            username: user.username,
            securityTier: user.security_tier,
            createdAt: user.created_at,
        },
        ...extraData
    };

    // Flatten extraData if it contains top-level keys that should be merged
    // But for now, we'll just return the object as is, assuming extraData keys don't collide
    // or if they do, they override.

    // However, the original code returned:
    // Signup: id, username, securityTier, accessToken, refreshToken, mnemonic, masterKeyHex
    // Login: accessToken, refreshToken, user object

    // We need to adapt to match the exact response format if we want to be 100% compatible.
    // Signup returns flat properties. Login returns nested user object.

    // Let's make this function flexible.
    // If extraData has 'flat: true', we return a flat object.

    if (extraData.flat) {
        delete extraData.flat;
        return {
            id: user.id,
            username: user.username,
            securityTier: user.security_tier,
            accessToken: token,
            refreshToken,
            ...extraData
        };
    }

    return response;
}
