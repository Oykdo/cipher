/**
 * Fresh Start Script
 * 
 * Clears all messages and users from the database
 * Keeps the schema intact
 * 
 * USE WITH CAUTION: This will delete ALL data!
 */

import { getDatabase } from '../src/db/database.js';

async function freshStart() {
  const db = getDatabase();
  
  try {
    console.log('🧹 Starting fresh database cleanup...\n');
    
    // Count before deletion
    const usersBefore = await db.pool.query('SELECT COUNT(*) as count FROM users');
    const messagesBefore = await db.pool.query('SELECT COUNT(*) as count FROM messages');
    const conversationsBefore = await db.pool.query('SELECT COUNT(*) as count FROM conversations');
    
    console.log('📊 Current database state:');
    console.log(`   - Users: ${usersBefore.rows[0].count}`);
    console.log(`   - Messages: ${messagesBefore.rows[0].count}`);
    console.log(`   - Conversations: ${conversationsBefore.rows[0].count}`);
    console.log('');
    
    // Delete in correct order (respecting foreign keys)
    console.log('🗑️  Deleting messages...');
    await db.pool.query('DELETE FROM messages');
    console.log('   ✅ Messages deleted');
    
    console.log('🗑️  Deleting conversation members...');
    await db.pool.query('DELETE FROM conversation_members');
    console.log('   ✅ Conversation members deleted');
    
    console.log('🗑️  Deleting conversation requests...');
    await db.pool.query('DELETE FROM conversation_requests');
    console.log('   ✅ Conversation requests deleted');
    
    console.log('🗑️  Deleting conversations...');
    await db.pool.query('DELETE FROM conversations');
    console.log('   ✅ Conversations deleted');
    
    console.log('🗑️  Deleting user public keys...');
    await db.pool.query('DELETE FROM user_public_keys');
    console.log('   ✅ User public keys deleted');
    
    console.log('🗑️  Deleting sessions...');
    await db.pool.query('DELETE FROM sessions');
    console.log('   ✅ Sessions deleted');
    
    console.log('🗑️  Deleting users...');
    await db.pool.query('DELETE FROM users');
    console.log('   ✅ Users deleted');
    
    console.log('');
    
    // Verify deletion
    const usersAfter = await db.pool.query('SELECT COUNT(*) as count FROM users');
    const messagesAfter = await db.pool.query('SELECT COUNT(*) as count FROM messages');
    const conversationsAfter = await db.pool.query('SELECT COUNT(*) as count FROM conversations');
    
    console.log('📊 Final database state:');
    console.log(`   - Users: ${usersAfter.rows[0].count}`);
    console.log(`   - Messages: ${messagesAfter.rows[0].count}`);
    console.log(`   - Conversations: ${conversationsAfter.rows[0].count}`);
    console.log('');
    
    console.log('✅ Fresh start complete! Database is now clean.');
    console.log('');
    console.log('🎯 Next steps:');
    console.log('   1. Restart your application');
    console.log('   2. Create new user accounts');
    console.log('   3. All messages will use E2EE encryption');
    console.log('');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error during fresh start:', error);
    process.exit(1);
  }
}

// Run the script
freshStart();
