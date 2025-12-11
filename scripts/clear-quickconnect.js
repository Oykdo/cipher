/**
 * Clear QuickConnect Cache Script
 * 
 * This script clears all QuickConnect data from localStorage,
 * forcing users to use full login instead of quick unlock.
 * 
 * USAGE:
 * 1. Open browser console (F12)
 * 2. Copy and paste this entire script
 * 3. Press Enter
 * 
 * OR run from Node.js (for documentation purposes):
 * node scripts/clear-quickconnect.js
 */

console.log('🗑️ [QuickConnect Cleaner] Starting...\n');

// Check if running in browser
if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
  // Browser environment
  console.log('📍 Environment: Browser');
  console.log('🔍 Scanning localStorage for QuickConnect data...\n');
  
  let clearedCount = 0;
  const keysToRemove = [];
  
  // Find all pwd_* keys
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('pwd_')) {
      keysToRemove.push(key);
    }
  }
  
  // Add auth keys
  if (localStorage.getItem('cipher-pulse-auth')) {
    keysToRemove.push('cipher-pulse-auth');
  }
  if (localStorage.getItem('cipher-pulse-auth-secure')) {
    keysToRemove.push('cipher-pulse-auth-secure');
  }
  
  // Display what will be removed
  console.log('📋 Found QuickConnect data:');
  keysToRemove.forEach(key => {
    console.log(`  - ${key}`);
  });
  console.log('');
  
  // Confirm before clearing
  const confirmed = confirm(
    `⚠️ Clear QuickConnect Cache?\n\n` +
    `This will remove ${keysToRemove.length} items:\n` +
    keysToRemove.map(k => `  • ${k}`).join('\n') +
    `\n\nUsers will need to use full login (username + master key).`
  );
  
  if (confirmed) {
    // Clear all keys
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      console.log(`  ✅ Removed: ${key}`);
      clearedCount++;
    });
    
    console.log('');
    console.log(`✅ [QuickConnect Cleaner] Successfully cleared ${clearedCount} items`);
    console.log('ℹ️  Users will now see the full login screen');
    console.log('🔄 Refresh the page to see changes');
    
    // Offer to refresh
    if (confirm('Refresh page now?')) {
      window.location.reload();
    }
  } else {
    console.log('❌ [QuickConnect Cleaner] Cancelled by user');
  }
  
} else {
  // Node.js environment (documentation only)
  console.log('📍 Environment: Node.js');
  console.log('');
  console.log('ℹ️  This script is meant to run in the browser console.');
  console.log('');
  console.log('📖 Instructions:');
  console.log('  1. Open your app in a browser');
  console.log('  2. Open Developer Tools (F12)');
  console.log('  3. Go to Console tab');
  console.log('  4. Copy and paste this script');
  console.log('  5. Press Enter');
  console.log('');
  console.log('Alternative: Use the Settings page in the app');
  console.log('  Settings → Advanced → Clear QuickConnect Cache');
}

