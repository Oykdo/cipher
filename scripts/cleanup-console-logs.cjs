/**
 * Script de nettoyage automatique des console.log
 * 
 * Remplace les console.log par debugLogger ou les supprime si sensibles
 * 
 * Usage: node scripts/cleanup-console-logs.js
 */

const fs = require('fs');
const path = require('path');

// Patterns to completely REMOVE (security sensitive)
const REMOVE_PATTERNS = [
  // Any log mentioning keys, secrets, or hashes
  /console\.log\([^)]*\b(key|secret|masterKey|privateKey|sharedSecret|hash|token|password|salt|nonce)\b[^)]*\);?/gi,
  // Logs with .slice(0, 8) or similar (key prefixes)
  /console\.log\([^)]*\.slice\s*\(\s*0\s*,\s*\d+\s*\)[^)]*\);?/g,
  // Logs with base64 encoding of keys
  /console\.log\([^)]*to_base64\([^)]*\)[^)]*\);?/g,
];

// Patterns to replace with debugLogger
const REPLACE_PATTERNS = [
  // E2EE/Crypto logs -> remove completely (too sensitive)
  {
    regex: /console\.log\s*\(\s*[`'"]🔐[^`'"]*[`'"][^)]*\)\s*;?/g,
    action: 'remove',
    category: 'crypto'
  },
  {
    regex: /console\.log\s*\(\s*[`'"]🔒[^`'"]*[`'"][^)]*\)\s*;?/g,
    action: 'remove',
    category: 'crypto'
  },
  {
    regex: /console\.log\s*\(\s*[`'"]🔑[^`'"]*[`'"][^)]*\)\s*;?/g,
    action: 'remove',
    category: 'crypto'
  },
  // P2P logs -> debugLogger.p2p()
  {
    regex: /console\.log\s*\(\s*[`'"]🌐\s*\[([^\]]+)\][^`'"]*[`'"]([^)]*)\)\s*;?/g,
    replacement: 'debugLogger.p2p(\'[$1]...\'$2);',
    category: 'p2p'
  },
  // WebSocket logs -> debugLogger.websocket()
  {
    regex: /console\.log\s*\(\s*[`'"]🔌\s*\[([^\]]+)\][^`'"]*[`'"]([^)]*)\)\s*;?/g,
    replacement: 'debugLogger.websocket(\'[$1]...\'$2);',
    category: 'websocket'
  },
  // Success logs -> debugLogger.info()
  {
    regex: /console\.log\s*\(\s*[`'"]✅([^`'"]+)[`'"]([^)]*)\)\s*;?/g,
    replacement: 'debugLogger.info(\'✅$1\'$2);',
    category: 'info'
  },
  // Generic console.log -> debugLogger.debug()
  {
    regex: /console\.log\s*\(([^)]+)\)\s*;?/g,
    replacement: 'debugLogger.debug($1);',
    category: 'debug'
  }
];

// Files/directories to skip
const SKIP_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'release',
  '__tests__',
  '.test.',
  '.spec.',
  'scripts/', // Don't modify scripts themselves
  'debugLogger.ts' // Don't modify the logger itself
];

function shouldSkip(filePath) {
  return SKIP_PATTERNS.some(pattern => filePath.includes(pattern));
}

function processFile(filePath) {
  if (shouldSkip(filePath)) {
    return { modified: false, reason: 'skipped' };
  }

  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  let modified = false;
  const changes = [];

  // First pass: Remove security-sensitive logs
  REMOVE_PATTERNS.forEach((regex, index) => {
    const matches = content.match(regex);
    if (matches) {
      content = content.replace(regex, '// SECURITY: Sensitive log removed');
      modified = true;
      changes.push(`Removed ${matches.length} sensitive log(s) (pattern ${index + 1})`);
    }
  });

  // Second pass: Replace with debugLogger
  REPLACE_PATTERNS.forEach(({ regex, replacement, action, category }) => {
    const matches = content.match(regex);
    if (matches) {
      if (action === 'remove') {
        content = content.replace(regex, `// SECURITY: ${category} log removed`);
        changes.push(`Removed ${matches.length} ${category} log(s)`);
      } else if (replacement) {
        content = content.replace(regex, replacement);
        changes.push(`Replaced ${matches.length} ${category} log(s) with debugLogger`);
      }
      modified = true;
    }
  });

  if (modified) {
    // Add debugLogger import if not present and if we're using it
    if (content.includes('debugLogger.') && 
        !content.includes("import { debugLogger }") && 
        !content.includes("from '@/lib/debugLogger'") &&
        !content.includes("from '../lib/debugLogger'") &&
        !content.includes("from '../../lib/debugLogger'") &&
        !content.includes("from '../../../lib/debugLogger'")) {
      
      // Find the last import statement
      const importRegex = /^import\s+.+\s+from\s+['"'][^'"]+['"];?\s*$/gm;
      const imports = Array.from(content.matchAll(importRegex));
      
      if (imports.length > 0) {
        const lastImport = imports[imports.length - 1];
        const insertPosition = lastImport.index + lastImport[0].length;
        
        // Calculate relative path to debugLogger
        const fileDir = path.dirname(filePath);
        const libPath = path.join(fileDir, '../lib/debugLogger').replace(/\\/g, '/');
        const relativePath = path.relative(fileDir, path.resolve(libPath)).replace(/\\/g, '/');
        const importPath = relativePath.startsWith('.') ? relativePath : './' + relativePath;
        
        content = content.slice(0, insertPosition) + 
                  `\nimport { debugLogger } from '${importPath}';` +
                  content.slice(insertPosition);
        
        changes.push('Added debugLogger import');
      }
    }

    fs.writeFileSync(filePath, content, 'utf8');
    return { modified: true, changes };
  }

  return { modified: false };
}

function processDirectory(dir, extensions = ['.ts', '.tsx', '.js', '.jsx']) {
  const stats = {
    total: 0,
    modified: 0,
    skipped: 0,
    files: []
  };

  function walk(currentDir) {
    const files = fs.readdirSync(currentDir);

    files.forEach(file => {
      const filePath = path.join(currentDir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        if (!shouldSkip(filePath)) {
          walk(filePath);
        } else {
          stats.skipped++;
        }
      } else if (extensions.some(ext => file.endsWith(ext))) {
        stats.total++;
        const result = processFile(filePath);
        
        if (result.modified) {
          stats.modified++;
          stats.files.push({
            path: path.relative(dir, filePath),
            changes: result.changes
          });
        } else if (result.reason === 'skipped') {
          stats.skipped++;
        }
      }
    });
  }

  walk(dir);
  return stats;
}

// Main execution
console.log('🔐 [SECURITY] Cleaning up console.log statements...\n');
console.log('⚠️  This will:');
console.log('   1. REMOVE logs exposing keys, secrets, or sensitive data');
console.log('   2. Replace general logs with debugLogger (disabled in production)');
console.log('   3. Preserve console.warn and console.error\n');

const frontendDir = path.join(__dirname, '../apps/frontend/src');
const stats = processDirectory(frontendDir);

console.log('\n📊 RESULTS:');
console.log('='.repeat(60));
console.log(`Total files scanned:  ${stats.total}`);
console.log(`Files modified:       ${stats.modified}`);
console.log(`Files skipped:        ${stats.skipped}`);
console.log('='.repeat(60));

if (stats.modified > 0) {
  console.log('\n📝 Modified files:');
  stats.files.forEach(({ path, changes }) => {
    console.log(`\n  ${path}:`);
    changes.forEach(change => {
      console.log(`    - ${change}`);
    });
  });
}

console.log('\n✅ Cleanup complete!');
console.log('\n⚠️  Next steps:');
console.log('   1. Review changes: git diff');
console.log('   2. Test the application');
console.log('   3. Run TypeScript compiler: npm run type-check');
console.log('   4. Commit: git commit -m "security: remove sensitive console.log statements"');
