import dotenv from 'dotenv';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';

dotenv.config();

const isProd = process.env.NODE_ENV === 'production';
const dataDir = process.env.BRIDGE_DATA_DIR || './data';

// Helper to read secret from file or env
function getSecret(key: string): string | undefined {
    const envVal = process.env[key];
    if (envVal) return envVal;

    const fileVar = process.env[`${key}_FILE`];
    if (fileVar && existsSync(fileVar)) {
        try {
            return readFileSync(fileVar, 'utf-8').trim();
        } catch (e) {
            console.error(`Failed to read secret from ${fileVar}`, e);
        }
    }
    return undefined;
}

export const config = {
    env: process.env.NODE_ENV || 'development',
    isProd,
    port: Number(process.env.PORT || 4000),
    host: '0.0.0.0',

    paths: {
        data: dataDir,
        backup: join(dataDir, 'backups'),
        restore: join(dataDir, 'restore'),
        uploads: join(dataDir, 'uploads'),
        temp: join(dataDir, 'uploads', 'tmp'),
        backupConfig: join(dataDir, 'backup-config.json'),
    },

    security: {
        jwtSecret: getSecret('JWT_SECRET'),
        dbKey: getSecret('BRIDGE_DB_KEY'),
        allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
        maxActiveUploadsPerUser: Number(process.env.MAX_ACTIVE_UPLOADS_PER_USER || 3),
    },

    backup: {
        defaultIntervalHours: 24,
        defaultMaxBackups: 7,
        defaultCompress: true,
    },

    rateLimit: {
        signup: { windowMs: 15 * 60 * 1000, max: 5 },
        login: { windowMs: 15 * 60 * 1000, max: 10 },
        message: { windowMs: 60 * 1000, max: 60 },
        upload: { windowMs: 5 * 60 * 1000, max: 20 },
    }
};

// ============================================================================
// SECURITY FIX VULN-004: Enhanced JWT_SECRET validation
// ============================================================================

/**
 * Validates JWT secret for security requirements
 * SECURITY FIX VULN-004: Comprehensive validation with entropy check
 */
function validateJwtSecret(secret: string | undefined, isProdEnv: boolean): void {
    // Required in production
    if (!secret) {
        if (isProdEnv) {
            console.error('CRITICAL: JWT_SECRET environment variable is not set');
            process.exit(1);
        }
        console.warn('WARNING: JWT_SECRET not set - using insecure default for development only');
        return;
    }

    // Minimum length: 64 characters (512 bits)
    if (secret.length < 64) {
        console.error('CRITICAL: JWT_SECRET must be at least 64 characters');
        console.error('Generate a secure secret with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
        process.exit(1);
    }

    // Check entropy (unique characters)
    const uniqueChars = new Set(secret).size;
    if (uniqueChars < 20) {
        console.error('CRITICAL: JWT_SECRET has insufficient entropy (too few unique characters)');
        console.error(`Found only ${uniqueChars} unique characters, minimum 20 required`);
        process.exit(1);
    }

    // Check for weak patterns
    const weakPatterns = [
        'password', 'secret', '123456', 'qwerty', 'admin',
        'letmein', 'welcome', 'monkey', 'dragon', 'master',
        'abc123', '111111', '000000', 'test', 'demo'
    ];
    const lowerSecret = secret.toLowerCase();
    for (const pattern of weakPatterns) {
        if (lowerSecret.includes(pattern)) {
            console.error(`CRITICAL: JWT_SECRET contains weak pattern: "${pattern}"`);
            process.exit(1);
        }
    }

    // Check for repeated sequences (e.g., "aaaa" or "1234123412341234")
    const repeatedPattern = /(.{4,})\1{2,}/;
    if (repeatedPattern.test(secret)) {
        console.error('CRITICAL: JWT_SECRET contains repeated sequences');
        process.exit(1);
    }
}

validateJwtSecret(config.security.jwtSecret, isProd);
