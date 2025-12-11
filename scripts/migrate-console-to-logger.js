#!/usr/bin/env node

/**
 * Migrate console.* to logger.*
 * 
 * This script automatically replaces console.log, console.info, console.debug
 * with logger equivalents while preserving console.warn and console.error
 * 
 * Usage: node scripts/migrate-console-to-logger.js
 */

const fs = require('fs');
const path = require('path');

// Directories to scan
const SCAN_DIRS = [
  'apps/frontend/src',
  'apps/bridge/src',
];

// File extensions to process
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

// Console methods to replace
const REPLACEMENTS = {
  'console.log': 'logger.debug',
  'console.info': 'logger.info',
  'console.debug': 'logger.debug',
  // Keep console.warn and console.error as allowed by ESLint
};

// Sensitive data patterns to sanitize
const SENSITIVE_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /key/i,
  /mnemonic/i,
  /seed/i,
  /private/i,
];

let filesProcessed = 0;
let replacementsMade = 0;
const filesWithChanges = [];

/**
 * Check if file should be processed
 */
function shouldProcessFile(filePath) {
  const ext = path.extname(filePath);
  return EXTENSIONS.includes(ext);
}

/**
 * Check if file needs logger import
 */
function needsLoggerImport(content) {
  return !content.includes("from '@/core/logger'") &&
         !content.includes('from "../core/logger"') &&
         !content.includes("from './core/logger'");
}

/**
 * Add logger import to file
 */
function addLoggerImport(content, filePath) {
  // Determine relative path to logger
  const relativePath = path.relative(path.dirname(filePath), 'apps/frontend/src/core/logger');
  const importPath = relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
  
  // Check if file is in frontend or bridge
  const isFrontend = filePath.includes('apps/frontend');
  const loggerImport = isFrontend
    ? "import { logger } from '@/core/logger';\n"
    : "import { logger } from '../core/logger.js';\n";

  // Find the last import statement
  const lines = content.split('\n');
  let lastImportIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('import ')) {
      lastImportIndex = i;
    }
  }

  if (lastImportIndex >= 0) {
    lines.splice(lastImportIndex + 1, 0, loggerImport);
    return lines.join('\n');
  }

  // If no imports found, add at the beginning
  return loggerImport + content;
}

/**
 * Process a single file
 */
function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    let replacements = 0;

    // Replace console.* with logger.*
    for (const [oldMethod, newMethod] of Object.entries(REPLACEMENTS)) {
      const regex = new RegExp(oldMethod.replace('.', '\\.'), 'g');
      const matches = content.match(regex);

      if (matches) {
        content = content.replace(regex, newMethod);
        replacements += matches.length;
        modified = true;
      }
    }

    // Add logger import if needed
    if (modified && needsLoggerImport(content)) {
      content = addLoggerImport(content, filePath);
    }

    // Write back if modified
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      filesWithChanges.push({
        file: filePath,
        replacements,
      });
      replacementsMade += replacements;
    }

    filesProcessed++;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
  }
}

/**
 * Recursively scan directory
 */
function scanDirectory(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules and other directories
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') {
          continue;
        }
        scanDirectory(fullPath);
      } else if (entry.isFile() && shouldProcessFile(fullPath)) {
        processFile(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error scanning ${dir}:`, error.message);
  }
}

/**
 * Main execution
 */
function main() {
  console.log('🔍 Scanning for console.* usage...\n');

  for (const dir of SCAN_DIRS) {
    const fullPath = path.resolve(dir);
    if (fs.existsSync(fullPath)) {
      console.log(`Scanning: ${dir}`);
      scanDirectory(fullPath);
    } else {
      console.warn(`Directory not found: ${dir}`);
    }
  }

  console.log('\n✅ Migration complete!\n');
  console.log(`Files processed: ${filesProcessed}`);
  console.log(`Replacements made: ${replacementsMade}`);

  if (filesWithChanges.length > 0) {
    console.log(`\nFiles modified (${filesWithChanges.length}):`);
    filesWithChanges.forEach(({ file, replacements }) => {
      console.log(`  - ${file} (${replacements} replacements)`);
    });
  }

  console.log('\n⚠️  Next steps:');
  console.log('1. Review the changes with git diff');
  console.log('2. Test the application');
  console.log('3. Run ESLint to check for remaining issues');
  console.log('4. Commit the changes');
}

main();
