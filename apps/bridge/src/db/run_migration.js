/**
 * Run conversation requests migration
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'database.db');
const migrationPath = path.join(__dirname, 'migrations', 'add_conversation_requests.sql');

console.log('📦 Running conversation_requests migration...');
console.log('Database:', dbPath);
console.log('Migration:', migrationPath);

try {
    const db = new Database(dbPath);
    const migration = fs.readFileSync(migrationPath, 'utf8');

    // Execute migration
    db.exec(migration);

    console.log('✅ Migration completed successfully!');

    // Verify table was created
    const tableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversation_requests'").get();
    if (tableInfo) {
        console.log('✅ Table conversation_requests created');

        // Show table structure
        const columns = db.prepare("PRAGMA table_info(conversation_requests)").all();
        console.log('\nTable structure:');
        columns.forEach(col => {
            console.log(`  - ${col.name} (${col.type})`);
        });
    } else {
        console.log('❌ Table conversation_requests not found');
    }

    db.close();
} catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
}
