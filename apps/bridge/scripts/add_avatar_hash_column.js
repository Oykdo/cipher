import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getDatabase, closeDatabase } from '../src/db/database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

async function migrate() {
    console.log('Adding avatar_hash column to users table...');
    const db = getDatabase();

    try {
        await db.exec(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS avatar_hash TEXT;
        `);
        console.log('Migration successful: avatar_hash column added.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        closeDatabase();
    }
}

migrate();
