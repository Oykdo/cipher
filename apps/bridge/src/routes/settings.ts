import { FastifyInstance } from "fastify";
import { getDatabase } from "../db/database.js";
import { SettingsService, UserSettings } from "../services/settingsService.js";
import { UpdateSettingsSchema } from "../validation/securitySchemas.js";

export async function settingsRoutes(app: FastifyInstance) {
    const db = getDatabase();
    const settingsService = new SettingsService(db);

    app.get("/api/v2/settings", {
        preHandler: app.authenticate,
        config: { rateLimit: app.settingsLimiter as any }
    }, async (request, reply) => {
        const userId = request.user!.sub;
        try {
            const settings = await settingsService.getSettings(userId);
            return settings;
        } catch (error: any) {
            app.log.error(error);
            reply.code(500).send({ error: "Failed to fetch settings" });
        }
    });

    app.patch<{ Body: Partial<UserSettings> }>("/api/v2/settings", {
        preHandler: app.authenticate,
        config: { rateLimit: app.settingsLimiter as any }
    }, async (request, reply) => {
        const userId = request.user!.sub;
        try {
            // Validate input using Zod schema
            const validationResult = UpdateSettingsSchema.safeParse(request.body);
            if (!validationResult.success) {
                reply.code(400);
                return {
                    error: "Invalid settings data",
                    details: validationResult.error.format()
                };
            }

            const settings = await settingsService.updateSettings(userId, validationResult.data);
            return settings;
        } catch (error: any) {
            app.log.error(error);
            reply.code(500).send({ error: "Failed to update settings" });
        }
    });
}
