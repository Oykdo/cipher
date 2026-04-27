/**
 * BackupService — user-triggered data export ("portage").
 *
 * SCOPE
 * -----
 * This service backs the `POST /api/backup/export` route. It exports the
 * caller's OWN data (their conversations, messages, settings) so they can
 * carry it to a new device or another bridge. This is the "portage des
 * données personnelles" pillar of CIPHER_PRIVACY_GUARANTEES.md in action.
 *
 * NOT auto-backup
 * ---------------
 * The auto-scheduler (`startScheduler`) is intentionally a no-op. The
 * server is not allowed to silently snapshot user data on a timer — that
 * would re-introduce the very server-side persistence the contract
 * forbids. If you find yourself wanting to enable it, re-read the contract
 * first.
 *
 * Privacy invariant
 * -----------------
 * After migration 002 (privacy-l1), `db.exportUserData()` no longer
 * returns mnemonics, master keys, or any sender_plaintext — those columns
 * have been dropped at the schema level. The export becomes naturally
 * clean. If a future change re-adds such a column, this comment + the
 * privacy-invariant CI test (L1-T9) will catch it.
 *
 * Local files
 * -----------
 * Generated backups land in `apps/bridge/backups/<userId>/`, gitignored
 * (see .gitignore line "apps/bridge/backups/"). They are produced on
 * demand and rotated; nothing is generated unless a user explicitly hits
 * the export endpoint.
 */
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
        // Auto-backup is intentionally disabled — see file header.
        // The server must not snapshot user data on a timer; it would
        // re-introduce the persistence the privacy contract forbids.
        // Backups are user-triggered only, via POST /api/backup/export.
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.logger.info('Auto backup is disabled by design (see CIPHER_PRIVACY_GUARANTEES.md)');
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
