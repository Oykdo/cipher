import { DatabaseService } from '../db/database.js';

export interface UserSettings {
    general?: {
        language?: string;
        theme?: string;
    };
    privacy?: {
        discoverable?: boolean;
        readReceipts?: boolean;
    };
    notifications?: {
        email?: boolean;
        push?: boolean;
    };
    [key: string]: any;
}

export class SettingsService {
    private db: DatabaseService;

    constructor(db: DatabaseService) {
        this.db = db;
    }

    async getSettings(userId: string): Promise<UserSettings> {
        const user = await this.db.getUserById(userId);
        if (!user) throw new Error('User not found');

        const settings = await this.db.getUserSettings(userId);

        // Merge with legacy columns
        return {
            ...settings,
            privacy: {
                ...(settings.privacy || {}),
                discoverable: user.discoverable !== false // Default to true
            }
        };
    }

    async updateSettings(userId: string, newSettings: Partial<UserSettings>): Promise<UserSettings> {
        // Handle legacy columns
        if (newSettings.privacy?.discoverable !== undefined) {
            await this.db.updateUserDiscoverable(userId, newSettings.privacy.discoverable);
        }

        // Filter out legacy keys from JSON storage if needed, 
        // but for now we can store them redundantly or just ignore them in the JSON blob 
        // if we want to keep the JSON clean. 
        // Let's keep the JSON clean by removing 'discoverable' from the privacy object 
        // before saving to JSON, IF we want to avoid duplication.
        // However, duplication isn't a huge issue. 
        // Let's just save everything to JSON as well for future migration ease.

        // Update JSON settings
        await this.db.updateUserSettings(userId, newSettings);

        // Return merged result
        return this.getSettings(userId);
    }
}
