/**
 * Fix incorrect debugLogger import paths
 * Changes "../lib/debugLogger" to "../debugLogger" in lib/ folder files
 */

const fs = require('fs');
const path = require('path');

const files = [
  'apps/frontend/src/migrations/migrateMasterKey.ts',
  'apps/frontend/src/screens/Signup.tsx',
  'apps/frontend/src/screens/SignupFluid.tsx',
  'apps/frontend/src/screens/LoginNew.tsx',
  'apps/frontend/src/screens/LoginFluid.tsx',
  'apps/frontend/src/screens/Conversations.tsx',
  'apps/frontend/src/lib/e2ee/x3dhSessionStore.ts',
  'apps/frontend/src/lib/e2ee/x3dhManager.ts',
  'apps/frontend/src/lib/e2ee/x3dh.ts',
  'apps/frontend/src/lib/p2p/p2p-manager.ts',
  'apps/frontend/src/lib/p2p/webrtc.ts',
  'apps/frontend/src/lib/p2p/signaling-client.ts',
  'apps/frontend/src/lib/e2ee/sessionManager.ts',
  'apps/frontend/src/lib/e2ee/keyManagement.ts',
  'apps/frontend/src/lib/e2ee/index.ts',
  'apps/frontend/src/lib/e2ee/doubleRatchet.ts',
  'apps/frontend/src/lib/backup/backupService.ts',
  'apps/frontend/src/hooks/useX3DHHandshake.ts',
  'apps/frontend/src/components/DiceKeyInputFluid.tsx',
  'apps/frontend/src/components/DiceKeyResults.tsx',
  'apps/frontend/src/components/QuickUnlock.tsx',
  'apps/frontend/src/components/UserSearch.tsx',
  'apps/frontend/src/hooks/useSocketWithRefresh.ts',
  'apps/frontend/src/hooks/useSocket.ts',
  'apps/frontend/src/hooks/useP2P.ts',
  'apps/frontend/src/hooks/useKonamiCode.ts',
  'apps/frontend/src/components/conversations/MessageList.tsx'
];

let fixed = 0;

files.forEach(relPath => {
  const filePath = path.join(__dirname, '..', relPath);
  
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  File not found: ${relPath}`);
    return;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  // Fix import paths
  content = content.replace(
    /from ['"]\.\.\/lib\/debugLogger['"]/g,
    'from "../debugLogger"'
  );
  
  content = content.replace(
    /from ['"]\.\.\/\.\.\/lib\/debugLogger['"]/g,
    'from "../../debugLogger"'
  );
  
  content = content.replace(
    /from ['"]\.\.\/\.\.\/\.\.\/lib\/debugLogger['"]/g,
    'from "../../../debugLogger"'
  );
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Fixed: ${relPath}`);
    fixed++;
  }
});

console.log(`\n✅ Fixed ${fixed} files`);
