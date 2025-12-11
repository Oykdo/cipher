import { getDatabase } from './database.js';

async function migrate() {
    const db = getDatabase();
    console.log('Migrating database to support SRP...');

    try {
        await db.exec(`
          ALTER TABLE users ADD COLUMN srp_salt TEXT;
          ALTER TABLE users ADD COLUMN srp_verifier TEXT;
        `);
        console.log('✅ Added srp_salt and srp_verifier columns');
    } catch (error: any) {
        // Postgres error code 42701 is "duplicate_column"
        if (error.code === '42701' || error.message.includes('duplicate column name')) {
            console.log('ℹ️ Columns already exist');
        } else {
            console.error('❌ Migration failed:', error);
            process.exit(1);
        }
    }

    process.exit(0);
}

migrate();
