/**
 * Script de remplacement automatique des console.log par debugLogger
 * 
 * Usage: node scripts/replace-console-logs.js
 */

const fs = require('fs');
const path = require('path');

const patterns = [
  // E2EE/Crypto logs -> debugLogger.e2ee()
  {
    regex: /console\.log\([`'"]🔐 \[([^\]]+)\]([^`'"]+)[`'"][^\)]*\)/g,
    replacement: "debugLogger.e2ee('[$1]$2')"
  },
  {
    regex: /console\.log\([`'"]🔒 \[([^\]]+)\]([^`'"]+)[`'"][^\)]*\)/g,
    replacement: "debugLogger.e2ee('[$1]$2')"
  },
  {
    regex: /console\.log\([`'"]🔑 \[([^\]]+)\]([^`'"]+)[`'"][^\)]*\)/g,
    replacement: "debugLogger.e2ee('[$1]$2')"
  },
  // P2P logs -> debugLogger.p2p()
  {
    regex: /console\.log\([`'"]🌐 \[([^\]]+)\]([^`'"]+)[`'"][^\)]*\)/g,
    replacement: "debugLogger.p2p('[$1]$2')"
  },
  // WebSocket logs -> debugLogger.websocket()
  {
    regex: /console\.log\([`'"]🔌 \[([^\]]+)\]([^`'"]+)[`'"][^\)]*\)/g,
    replacement: "debugLogger.websocket('[$1]$2')"
  },
  // General success logs -> debugLogger.info()
  {
    regex: /console\.log\([`'"]✅([^`'"]+)[`'"]\)/g,
    replacement: "debugLogger.info('✅$1')"
  },
  // Warning logs -> debugLogger.warn()
  {
    regex: /console\.warn\([`'"]⚠️([^`'"]+)[`'"]([^\)]*)\)/g,
    replacement: "debugLogger.warn('$1'$2)"
  },
  // Error logs -> debugLogger.error()
  {
    regex: /console\.error\([`'"]❌([^`'"]+)[`'"]([^\)]*)\)/g,
    replacement: "debugLogger.error('$1'$2)"
  },
  // Generic console.log -> debugLogger.debug()
  {
    regex: /console\.log\(([^)]+)\)/g,
    replacement: "debugLogger.debug($1)"
  }
];

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  patterns.forEach(({ regex, replacement }) => {
    if (regex.test(content)) {
      content = content.replace(regex, replacement);
      modified = true;
    }
  });
  
  if (modified) {
    // Add import if not present
    if (!content.includes("import { debugLogger }") && !content.includes("debugLogger")) {
      // Find the last import statement
      const importRegex = /^import .+ from .+;$/gm;
      const imports = content.match(importRegex);
      if (imports) {
        const lastImport = imports[imports.length - 1];
        content = content.replace(
          lastImport,
          lastImport + "\nimport { debugLogger } from '../debugLogger';"
        );
      }
    }
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Processed: ${filePath}`);
    return true;
  }
  
  return false;
}

function processDirectory(dir, extensions = ['.ts', '.tsx']) {
  const files = fs.readdirSync(dir);
  let count = 0;
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      if (!file.includes('node_modules') && !file.includes('.git')) {
        count += processDirectory(filePath, extensions);
      }
    } else if (extensions.some(ext => file.endsWith(ext))) {
      if (processFile(filePath)) {
        count++;
      }
    }
  });
  
  return count;
}

// Run
const srcDir = path.join(__dirname, '../apps/frontend/src');
console.log('🔄 Replacing console.log with debugLogger...\n');
const count = processDirectory(srcDir);
console.log(`\n✅ Processed ${count} files`);
