#!/usr/bin/env node

/**
 * Script de vérification des clés i18n
 * 
 * Vérifie que toutes les clés existent dans tous les fichiers de langue
 * et identifie les clés manquantes ou en surplus
 */

const fs = require('fs');
const path = require('path');

// Couleurs pour la console
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Chemins des fichiers de langue
const localesDir = path.join(__dirname, '../apps/frontend/src/locales');
const languages = ['fr', 'en', 'de', 'es', 'zh-CN', 'it'];

/**
 * Récupère toutes les clés d'un objet de traduction
 */
function getAllKeys(obj, prefix = '') {
  let keys = [];
  
  for (const key in obj) {
    const fullKey = prefix + key;
    
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      keys = keys.concat(getAllKeys(obj[key], fullKey + '.'));
    } else {
      keys.push(fullKey);
    }
  }
  
  return keys;
}

/**
 * Compte le nombre de clés dans un objet
 */
function countKeys(obj) {
  let count = 0;
  
  for (const key in obj) {
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      count += countKeys(obj[key]);
    } else {
      count++;
    }
  }
  
  return count;
}

/**
 * Charge un fichier de langue
 */
function loadLanguageFile(lang) {
  const filePath = path.join(localesDir, `${lang}.json`);
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`${colors.red}Erreur lors du chargement de ${lang}.json:${colors.reset}`, error.message);
    return null;
  }
}

/**
 * Affiche un titre
 */
function printTitle(title) {
  console.log(`\n${colors.bright}${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}${title}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);
}

/**
 * Affiche une section
 */
function printSection(title) {
  console.log(`\n${colors.bright}${colors.blue}${title}${colors.reset}`);
  console.log(`${colors.blue}${'-'.repeat(60)}${colors.reset}`);
}

/**
 * Fonction principale
 */
function main() {
  printTitle('Vérification des Clés i18n');

  // Charger tous les fichiers de langue
  const translations = {};
  const allKeys = {};
  
  for (const lang of languages) {
    translations[lang] = loadLanguageFile(lang);
    
    if (translations[lang]) {
      allKeys[lang] = getAllKeys(translations[lang]);
    }
  }

  // 1. Statistiques générales
  printSection('📊 Statistiques Générales');
  
  for (const lang of languages) {
    if (translations[lang]) {
      const count = countKeys(translations[lang]);
      const emoji = lang === 'fr' ? '🇫🇷' : lang === 'en' ? '🇬🇧' : lang === 'de' ? '🇩🇪' : lang === 'es' ? '🇪🇸' : lang === 'zh-CN' ? '🇨🇳' : '🇮🇹';
      console.log(`${emoji} ${lang.padEnd(6)} : ${colors.green}${count} clés${colors.reset}`);
    }
  }

  // 2. Vérifier la cohérence entre fr et en (langues de référence)
  printSection('🔍 Cohérence FR ↔ EN');
  
  if (allKeys.fr && allKeys.en) {
    const missingInEn = allKeys.fr.filter(k => !allKeys.en.includes(k));
    const missingInFr = allKeys.en.filter(k => !allKeys.fr.includes(k));
    
    if (missingInEn.length === 0 && missingInFr.length === 0) {
      console.log(`${colors.green}✅ Parfait ! FR et EN sont synchronisés.${colors.reset}`);
    } else {
      if (missingInEn.length > 0) {
        console.log(`\n${colors.red}❌ Clés manquantes dans EN (${missingInEn.length}):${colors.reset}`);
        missingInEn.slice(0, 10).forEach(key => console.log(`   - ${key}`));
        if (missingInEn.length > 10) {
          console.log(`   ${colors.yellow}... et ${missingInEn.length - 10} autres${colors.reset}`);
        }
      }
      
      if (missingInFr.length > 0) {
        console.log(`\n${colors.red}❌ Clés manquantes dans FR (${missingInFr.length}):${colors.reset}`);
        missingInFr.slice(0, 10).forEach(key => console.log(`   - ${key}`));
        if (missingInFr.length > 10) {
          console.log(`   ${colors.yellow}... et ${missingInFr.length - 10} autres${colors.reset}`);
        }
      }
    }
  }

  // 3. Vérifier les autres langues par rapport à FR (référence)
  printSection('🌍 Couverture des Autres Langues (vs FR)');
  
  if (allKeys.fr) {
    const frKeyCount = allKeys.fr.length;
    
    for (const lang of ['de', 'es', 'zh-CN', 'it']) {
      if (allKeys[lang]) {
        const langKeyCount = allKeys[lang].length;
        const coverage = Math.round((langKeyCount / frKeyCount) * 100);
        const missingCount = frKeyCount - langKeyCount;
        
        const emoji = lang === 'de' ? '🇩🇪' : lang === 'es' ? '🇪🇸' : lang === 'zh-CN' ? '🇨🇳' : '🇮🇹';
        const statusColor = coverage >= 90 ? colors.green : coverage >= 70 ? colors.yellow : colors.red;
        const statusIcon = coverage >= 90 ? '✅' : coverage >= 70 ? '⚠️' : '❌';
        
        console.log(`${emoji} ${lang.padEnd(6)} : ${statusColor}${coverage}%${colors.reset} (${missingCount} clés manquantes) ${statusIcon}`);
      }
    }
  }

  // 4. Sections principales
  printSection('📁 Sections Principales');
  
  if (translations.fr) {
    const sections = Object.keys(translations.fr);
    
    for (const section of sections) {
      const sectionKeys = countKeys(translations.fr[section]);
      console.log(`   ${section.padEnd(20)} : ${colors.cyan}${sectionKeys} clés${colors.reset}`);
    }
  }

  // 5. Nouvelles sections ajoutées
  printSection('🆕 Nouvelles Sections (i18n finalization)');
  
  const newSections = ['signup', 'welcome', 'dicekey_input', 'cosmic_loader', 'dicekey_results'];
  
  for (const section of newSections) {
    if (translations.fr && translations.fr[section]) {
      const sectionKeys = countKeys(translations.fr[section]);
      const hasEn = translations.en && translations.en[section];
      const status = hasEn ? `${colors.green}✅${colors.reset}` : `${colors.red}❌${colors.reset}`;
      
      console.log(`   ${section.padEnd(20)} : ${colors.cyan}${sectionKeys} clés${colors.reset} ${status}`);
    }
  }

  // 6. Résumé final
  printSection('📋 Résumé');
  
  const frCount = allKeys.fr ? allKeys.fr.length : 0;
  const enCount = allKeys.en ? allKeys.en.length : 0;
  const isSynced = frCount === enCount;
  
  console.log(`Total de clés (FR) : ${colors.green}${frCount}${colors.reset}`);
  console.log(`Total de clés (EN) : ${colors.green}${enCount}${colors.reset}`);
  console.log(`Synchronisation FR ↔ EN : ${isSynced ? `${colors.green}✅ Parfait${colors.reset}` : `${colors.red}❌ Désynchronisé${colors.reset}`}`);
  
  console.log(`\n${colors.bright}${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);
  
  // Code de sortie
  if (!isSynced) {
    console.log(`${colors.yellow}⚠️  Attention : FR et EN ne sont pas synchronisés${colors.reset}\n`);
    process.exit(1);
  } else {
    console.log(`${colors.green}✅ Toutes les vérifications sont passées !${colors.reset}\n`);
    process.exit(0);
  }
}

// Exécuter le script
main();
