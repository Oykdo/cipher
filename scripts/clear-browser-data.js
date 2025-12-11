/**
 * Clear Browser Data Script
 * 
 * Copy and paste this script in the browser console to clear all local data
 * 
 * Usage:
 * 1. Open browser DevTools (F12)
 * 2. Go to Console tab
 * 3. Copy and paste this entire script
 * 4. Press Enter
 */

(async function clearAllBrowserData() {
  console.log('🗑️ Starting to clear all browser data...\n');

  const results = [];
  let errors = [];

  // 1. Clear localStorage
  try {
    const count = localStorage.length;
    const keys = Object.keys(localStorage);
    console.log('📦 localStorage items:', keys);
    localStorage.clear();
    results.push(`✅ localStorage cleared (${count} items)`);
  } catch (e) {
    errors.push(`❌ localStorage: ${e.message}`);
  }

  // 2. Clear sessionStorage
  try {
    const count = sessionStorage.length;
    const keys = Object.keys(sessionStorage);
    console.log('📦 sessionStorage items:', keys);
    sessionStorage.clear();
    results.push(`✅ sessionStorage cleared (${count} items)`);
  } catch (e) {
    errors.push(`❌ sessionStorage: ${e.message}`);
  }

  // 3. Clear IndexedDB
  try {
    const databases = await indexedDB.databases();
    console.log('💾 IndexedDB databases:', databases.map(db => db.name));
    
    for (const db of databases) {
      if (db.name) {
        await new Promise((resolve, reject) => {
          const request = indexedDB.deleteDatabase(db.name);
          request.onsuccess = () => {
            console.log(`  ✓ Deleted: ${db.name}`);
            resolve();
          };
          request.onerror = () => reject(request.error);
          request.onblocked = () => {
            console.warn(`  ⚠️ Blocked: ${db.name} (close all tabs and retry)`);
            resolve();
          };
        });
      }
    }
    results.push(`✅ IndexedDB cleared (${databases.length} databases)`);
  } catch (e) {
    errors.push(`❌ IndexedDB: ${e.message}`);
  }

  // 4. Clear cookies
  try {
    const cookies = document.cookie.split(';');
    console.log('🍪 Cookies:', cookies.map(c => c.split('=')[0].trim()));
    
    for (const cookie of cookies) {
      const name = cookie.split('=')[0].trim();
      // Clear for all paths and domains
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname}`;
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.${window.location.hostname}`;
    }
    results.push(`✅ Cookies cleared (${cookies.length} cookies)`);
  } catch (e) {
    errors.push(`❌ Cookies: ${e.message}`);
  }

  // 5. Clear cache
  try {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      console.log('💿 Cache names:', cacheNames);
      
      for (const cacheName of cacheNames) {
        await caches.delete(cacheName);
        console.log(`  ✓ Deleted cache: ${cacheName}`);
      }
      results.push(`✅ Cache cleared (${cacheNames.length} caches)`);
    } else {
      results.push('ℹ️ Cache API not available');
    }
  } catch (e) {
    errors.push(`❌ Cache: ${e.message}`);
  }

  // 6. Unregister service workers
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      console.log('👷 Service workers:', registrations.length);
      
      for (const registration of registrations) {
        await registration.unregister();
        console.log(`  ✓ Unregistered: ${registration.scope}`);
      }
      results.push(`✅ Service workers unregistered (${registrations.length})`);
    } else {
      results.push('ℹ️ Service workers not available');
    }
  } catch (e) {
    errors.push(`❌ Service workers: ${e.message}`);
  }

  // Print results
  console.log('\n' + '='.repeat(50));
  console.log('📊 RESULTS:');
  console.log('='.repeat(50));
  results.forEach(r => console.log(r));
  
  if (errors.length > 0) {
    console.log('\n⚠️ ERRORS:');
    errors.forEach(e => console.log(e));
  }

  console.log('\n✅ Done! All local data has been cleared.');
  console.log('💡 Tip: Refresh the page (F5) to complete the cleanup.');

  // Ask to reload
  if (confirm('All data cleared! Reload the page now?')) {
    window.location.reload();
  }
})();
