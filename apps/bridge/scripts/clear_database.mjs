/**
 * Clear all users and related data from the database
 */
import 'dotenv/config';
import { getDatabase } from '../src/db/database.js';

async function clearDatabase() {
    const db = getDatabase();

    try {
        console.log('🔄 Clearing database...');
        await db.clearAll();
        console.log('✅ Database cleared successfully!');
        console.log('   - All users deleted');
        console.log('   - All conversations deleted');
        console.log('   - All messages deleted');
        console.log('   - All conversation members deleted');
        process.exit(0);
    } catch (error) {
        console.error('❌ Failed to clear database:', error);
        process.exit(1);
    }
}

clearDatabase();
