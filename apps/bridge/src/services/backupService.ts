import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync, statSync, createReadStream, createWriteStream } from 'fs';
import { createGzip, createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { config } from '../config.js';
import { getDatabase } from '../db/database.js';
import type { FastifyBaseLogger } from 'fastify';

interface BackupConfig {
    enabled: boolean;
    intervalHours: number;
    compress: boolean;
    maxBackups: number;
    path?: string; // Custom backup path
}

export class BackupService {
    private db = getDatabase();
    private logger: FastifyBaseLogger;
    private intervalId: NodeJS.Timeout | null = null;

    private currentConfig: BackupConfig = {
        enabled: false,
        intervalHours: config.backup.defaultIntervalHours,
        compress: config.backup.defaultCompress,
        maxBackups: config.backup.defaultMaxBackups,
        path: undefined,
    };

    constructor(logger: FastifyBaseLogger) {
        this.logger = logger;
        this.loadConfig();
    }

    private loadConfig() {
        try {
            if (existsSync(config.paths.backupConfig)) {
                const savedConfig = JSON.parse(readFileSync(config.paths.backupConfig, 'utf-8'));
                this.currentConfig = { ...this.currentConfig, ...savedConfig };
            }
        } catch (error) {
            this.logger.error({ error }, 'Failed to load backup config');
        }
    }

    public saveConfig(newConfig: Partial<BackupConfig>) {
        try {
            this.currentConfig = { ...this.currentConfig, ...newConfig };
            writeFileSync(config.paths.backupConfig, JSON.stringify(this.currentConfig, null, 2));

            // Restart scheduler if needed
            this.stopScheduler();
            if (this.currentConfig.enabled) {
                this.startScheduler();
            }
        } catch (error) {
            this.logger.error({ error }, 'Failed to save backup config');
            throw error;
        }
    }

    public getConfig(): BackupConfig {
        return { ...this.currentConfig };
    }

    private getBackupPath(userId?: string): string {
        const basePath = this.currentConfig.path || config.paths.backup;
        if (userId) {
            const userPath = join(basePath, userId);
            if (!existsSync(userPath)) {
                mkdirSync(userPath, { recursive: true });
            }
            return userPath;
        }
        return basePath;
    }

    public startScheduler() {
        if (this.intervalId) clearInterval(this.intervalId);

        if (!this.currentConfig.enabled) {
            this.logger.info('Auto backup is disabled');
            return;
        }

        // TODO: Implement multi-user scheduler
        this.logger.warn('Auto backup scheduler is currently disabled for multi-user support');
    }

    public stopScheduler() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            this.logger.info('Auto backup stopped');
        }
    }

    public async createBackup(userId: string): Promise<boolean> {
        try {
            const exportData = await this.db.exportUserData(userId);
            const jsonData = JSON.stringify(exportData, null, 2);

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = this.getBackupPath(userId);
            const fileName = `backup-${timestamp}.json`;
            const filePath = join(backupPath, fileName);

            if (this.currentConfig.compress) {
                const gzPath = `${filePath}.gz`;
                // Write temp file then compress
                const tempPath = join(backupPath, `temp-${fileName}`);
                writeFileSync(tempPath, jsonData);
                await this.compressFile(tempPath, gzPath);
                unlinkSync(tempPath);
            } else {
                writeFileSync(filePath, jsonData);
            }

            this.rotateBackups(userId);
            return true;
        } catch (error) {
            this.logger.error({ error, userId }, 'Failed to create user backup');
            return false;
        }
    }

    private async compressFile(inputPath: string, outputPath: string): Promise<void> {
        const gzip = createGzip({ level: 9 });
        await pipeline(createReadStream(inputPath), gzip, createWriteStream(outputPath));
    }

    private rotateBackups(userId: string) {
        try {
            const backupPath = this.getBackupPath(userId);
            if (!existsSync(backupPath)) return;

            const backups = readdirSync(backupPath)
                .filter(f => f.startsWith('backup-') && (f.endsWith('.json') || f.endsWith('.json.gz')))
                .map(f => ({
                    name: f,
                    path: join(backupPath, f),
                    created: statSync(join(backupPath, f)).birthtime.getTime(),
                }))
                .sort((a, b) => b.created - a.created);

            if (backups.length > this.currentConfig.maxBackups) {
                const toDelete = backups.slice(this.currentConfig.maxBackups);
                for (const backup of toDelete) {
                    unlinkSync(backup.path);
                    this.logger.info(`Rotated old backup for user ${userId}: ${backup.name}`);
                }
            }
        } catch (error) {
            this.logger.error({ error, userId }, 'Backup rotation error');
        }
    }

    public getStats(userId: string) {
        try {
            let backupCount = 0;
            let totalBackupSize = 0;
            const backupPath = this.getBackupPath(userId);

            if (existsSync(backupPath)) {
                const backups = readdirSync(backupPath).filter(f => f.startsWith('backup-') && (f.endsWith('.json') || f.endsWith('.json.gz')));
                backupCount = backups.length;
                totalBackupSize = backups.reduce((sum, f) => {
                    return sum + statSync(join(backupPath, f)).size;
                }, 0);
            }

            return {
                backups: {
                    count: backupCount,
                    totalSize: totalBackupSize,
                },
            };
        } catch (error: any) {
            this.logger.error({ error, userId }, 'Backup stats error');
            return {
                backups: { count: 0, totalSize: 0 },
            };
        }
    }
}
