import { z } from 'zod';

/**
 * Security Settings Validation Schemas
 * Ensures all user inputs are properly validated before processing
 */

export const UpdateSettingsSchema = z.object({
    general: z.object({
        language: z.string().max(10).regex(/^[a-z]{2}(-[A-Z]{2})?$/).optional(),
        theme: z.enum(['light', 'dark', 'auto']).optional(),
    }).optional(),
    privacy: z.object({
        discoverable: z.boolean().optional(),
        readReceipts: z.boolean().optional(),
    }).optional(),
    notifications: z.object({
        email: z.boolean().optional(),
        push: z.boolean().optional(),
    }).optional(),
}).strict(); // Reject unknown properties

export const UsernameSchema = z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username must be at most 32 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain alphanumeric characters, hyphens, and underscores');

export const PasswordSchema = z.string()
    .min(6, 'Password must be at least 6 characters')
    .max(128, 'Password must be at most 128 characters');

export const AvatarHashSchema = z.string()
    .length(64, 'Avatar hash must be 64 characters (SHA-256)')
    .regex(/^[a-f0-9]{64}$/i, 'Avatar hash must be a valid SHA-256 hex string');

export const UserIdSchema = z.string()
    .length(12, 'User ID must be 12 characters')
    .regex(/^[a-f0-9]{12}$/i, 'User ID must be a valid hex string');

export const ChecksumSchema = z.array(z.string().length(4))
    .length(30, 'Must provide exactly 30 checksums');

/**
 * SECURITY FIX VUL-004: Strict UUID validation
 * Ensures proper UUID v4 format with full validation
 */
export const StrictUUIDSchema = z.string()
    .length(36, 'UUID must be exactly 36 characters')
    .regex(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        'Must be a valid UUID v4 format'
    );

/**
 * SECURITY FIX VUL-004: Strict ConversationId validation
 * Format: Simple UUID v4 (the application uses randomUUID() for conversation IDs)
 */
export const ConversationIdSchema = StrictUUIDSchema;

/**
 * Message ID validation (simple UUID)
 */
export const MessageIdSchema = StrictUUIDSchema;
