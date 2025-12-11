import { getDatabase } from './db/database.js';

async function checkColumns() {
    const db = getDatabase();
    console.log('Checking users table columns...');

    try {
        const columns = await new Promise<any[]>((resolve, reject) => {
            (db as any).db.all("PRAGMA table_info(users)", [], (err: any, rows: any[]) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        const srpSalt = columns.find(c => c.name === 'srp_salt');
        const srpVerifier = columns.find(c => c.name === 'srp_verifier');

        console.log('srp_salt exists:', !!srpSalt);
        console.log('srp_verifier exists:', !!srpVerifier);

        if (srpSalt && srpVerifier) {
            console.log('✅ Database schema is correct.');
        } else {
            console.error('❌ Missing SRP columns!');
        }
        process.exit(0);
    } catch (error) {
        console.error('Error checking columns:', error);
        process.exit(1);
    }
}

checkColumns();
