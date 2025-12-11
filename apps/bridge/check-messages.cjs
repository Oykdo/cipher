const sqlite3 = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'data', 'dead-drop.db');
const db = sqlite3(dbPath);

// Récupérer tous les messages avec leurs conversations
const msgs = db.prepare(`
  SELECT id, conversation_id, sender_id, created_at, unlock_block_height, 
         substr(body, 1, 80) as body_preview 
  FROM messages 
  ORDER BY created_at DESC 
  LIMIT 10
`).all();

console.log('\n=== MESSAGES EN BASE DE DONNEES ===\n');

if (msgs.length === 0) {
  console.log('❌ AUCUN MESSAGE DANS LA BASE DE DONNEES !');
} else {
  msgs.forEach((m, i) => {
    const date = new Date(m.created_at);
    console.log(`${i+1}. Message ID: ${m.id}`);
    console.log(`   Conversation: ${m.conversation_id}`);
    console.log(`   Sender: ${m.sender_id}`);
    console.log(`   Date: ${date.toLocaleString('fr-FR')}`);
    console.log(`   Unlock Height: ${m.unlock_block_height || 'null'}`);
    console.log(`   Body: ${m.body_preview}...`);
    console.log('');
  });

  console.log(`Total: ${msgs.length} messages\n`);

  // Grouper par conversation
  const convs = {};
  msgs.forEach(m => {
    if (!convs[m.conversation_id]) {
      convs[m.conversation_id] = 0;
    }
    convs[m.conversation_id]++;
  });

  console.log('=== MESSAGES PAR CONVERSATION ===\n');
  Object.entries(convs).forEach(([convId, count]) => {
    console.log(`${convId}: ${count} message(s)`);
  });
}

// Vérifier si les conversations existent dans la table conversations
console.log('\n=== CONVERSATIONS EN BASE DE DONNEES ===\n');

const conversations = db.prepare(`
  SELECT id, created_at FROM conversations ORDER BY created_at DESC
`).all();

if (conversations.length === 0) {
  console.log('❌ AUCUNE CONVERSATION DANS LA TABLE conversations !');
} else {
  conversations.forEach((c, i) => {
    const date = new Date(c.created_at);
    console.log(`${i+1}. ${c.id} (créée le ${date.toLocaleString('fr-FR')})`);
  });
}

db.close();
