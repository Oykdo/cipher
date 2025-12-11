/**
 * Fix ALL debugLogger import paths based on file location
 * 
 * Rule:
 * - Files in src/lib/ (and subfolders) → "../debugLogger" (correct)
 * - Files in src/screens/ → "../lib/debugLogger"
 * - Files in src/hooks/ → "../lib/debugLogger"
 * - Files in src/components/ → "../lib/debugLogger"
 * - Files in src/migrations/ → "../lib/debugLogger"
 */

const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (!file.includes('node_modules') && !file.includes('.git')) {
        walkDir(filePath, callback);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      callback(filePath);
    }
  });
}

const srcDir = path.join(__dirname, '../apps/frontend/src');
let fixed = 0;

walkDir(srcDir, (filePath) => {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  const relativePath = path.relative(srcDir, filePath);
  
  // Determine correct import path based on file location
  let correctImport = null;
  
  if (relativePath.startsWith('lib\\') || relativePath.startsWith('lib/')) {
    // Files in lib/ folder or subfolders
    const depth = relativePath.split(path.sep).length - 2; // -2 for lib/ and filename
    if (depth === 0) {
      correctImport = './debugLogger'; // same folder
    } else {
      correctImport = '../'.repeat(depth) + 'debugLogger';
    }
  } else {
    // Files outside lib/ folder (screens, hooks, components, migrations, etc.)
    correctImport = '../lib/debugLogger';
  }
  
  // Replace incorrect imports
  const importRegex = /from ['"]([^'"]*debugLogger)['"]/g;
  content = content.replace(importRegex, (match, importPath) => {
    if (importPath !== correctImport) {
      return `from "${correctImport}"`;
    }
    return match;
  });
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Fixed: ${relativePath}`);
    fixed++;
  }
});

console.log(`\n✅ Fixed ${fixed} files`);
