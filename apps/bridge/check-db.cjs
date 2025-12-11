const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'dead-drop.db');
console.log('📂 Database path:', dbPath);

try {
  const db = new Database(dbPath);
  
  console.log('\n=== MESSAGES TABLE ===');
  const messages = db.prepare(`
    SELECT id, conversation_id, sender_id, 
           substr(body, 1, 100) as body_preview,
           created_at
    FROM messages 
    ORDER BY created_at DESC 
    LIMIT 10
  `).all();
  
  console.log(`Found ${messages.length} messages:\n`);
  messages.forEach((msg, idx) => {
    console.log(`${idx + 1}. ID: ${msg.id}`);
    console.log(`   Conversation: ${msg.conversation_id}`);
    console.log(`   Sender: ${msg.sender_id}`);
    console.log(`   Body preview: ${msg.body_preview}`);
    console.log(`   Created: ${new Date(msg.created_at).toISOString()}`);
    console.log('');
  });
  
  console.log('\n=== USERS TABLE ===');
  // Get table structure first
  const tableInfo = db.prepare(`PRAGMA table_info(users)`).all();
  console.log('Users table columns:', tableInfo.map(c => c.name).join(', '));
  
  const users = db.prepare(`
    SELECT id, username, security_tier, created_at
    FROM users
  `).all();
  
  console.log(`\nFound ${users.length} users:\n`);
  users.forEach((user, idx) => {
    console.log(`${idx + 1}. ID: ${user.id}`);
    console.log(`   Username: ${user.username}`);
    console.log(`   Security: ${user.security_tier}`);
    console.log(`   Created: ${new Date(user.created_at).toISOString()}`);
    console.log('');
  });
  
  console.log('\n=== CONVERSATIONS TABLE ===');
  const conversations = db.prepare(`
    SELECT id, last_message_id, last_message_at, created_at
    FROM conversations
    ORDER BY created_at DESC
  `).all();
  
  console.log(`Found ${conversations.length} conversations:\n`);
  conversations.forEach((conv, idx) => {
    console.log(`${idx + 1}. ID: ${conv.id}`);
    console.log(`   Last message ID: ${conv.last_message_id}`);
    console.log(`   Last message at: ${conv.last_message_at ? new Date(conv.last_message_at).toISOString() : 'N/A'}`);
    console.log(`   Created: ${new Date(conv.created_at).toISOString()}`);
    console.log('');
  });
  
  db.close();
  console.log('✅ Database check complete');
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
