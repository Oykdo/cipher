#!/usr/bin/env node
/**
 * Purge les comptes crees par les harnais de bout en bout.
 *
 * Pourquoi cet outil existe
 * -------------------------
 * Les harnais mobiles (bridgeConformance, bridgeMessaging) creent des comptes
 * jetables sur un bridge REEL, faute de base isolee. Rien ne les supprimait :
 * onze comptes de test ont ainsi sejourné en production jusqu'a ce que le
 * reconciliateur les revele par hasard.
 *
 * Le harnais ne peut pas nettoyer seul : le bridge n'expose aucune route de
 * suppression de compte, et donner le DSN de la base au depot mobile serait
 * un remede pire que le mal. La division est donc : le harnais ENREGISTRE ce
 * qu'il cree, cet outil -- cote Cipher, ou le DSN a sa place -- SUPPRIME.
 *
 * Deux garde-fous, parce qu'une purge est irreversible :
 *   - simulation par defaut ; il faut --yes pour ecrire quoi que ce soit ;
 *   - refus total si un compte hors motif existe en base, plutot qu'une
 *     suppression partielle qui laisserait croire au nettoyage.
 *
 * Usage
 * -----
 *   node tools/purge-e2e-accounts.mjs                 # simulation
 *   node tools/purge-e2e-accounts.mjs --yes           # supprime
 *   node tools/purge-e2e-accounts.mjs --pattern 'm3%' # motif explicite
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Motifs par defaut : les prefixes que les harnais s'imposent. */
export const DEFAULT_PATTERNS = ['m1test%', 'm3a%', 'm3b%'];

const like = (pattern) =>
  new RegExp('^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                          .replace(/%/g, '.*') + '$');

/**
 * Coeur pur : decide quoi supprimer, et refuse de decider a moitie.
 *
 * @returns {{targets: object[], strangers: object[], safe: boolean}}
 */
export function selectAccountsToPurge(users, patterns = DEFAULT_PATTERNS) {
  const matchers = patterns.map(like);
  const matches = (u) => matchers.some((re) => re.test(u.username || ''));

  const targets = users.filter(matches);
  const strangers = users.filter((u) => !matches(u));

  // Un compte hors motif signifie que la base n'est plus un bac a sable :
  // on s'arrete plutot que de supprimer "juste les notres" dans un
  // environnement dont on a manifestement mal compris l'etat.
  return { targets, strangers, safe: strangers.length === 0 };
}

function readEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (line.startsWith('#') || eq < 1) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--yes');
  const patternArg = args.indexOf('--pattern');
  const patterns = patternArg >= 0 ? [args[patternArg + 1]] : DEFAULT_PATTERNS;

  const env = { ...readEnvFile(join(process.cwd(), 'apps', 'bridge', '.env')), ...process.env };
  if (!env.DATABASE_URL) {
    console.error('DATABASE_URL absent (apps/bridge/.env)');
    process.exit(2);
  }

  const pg = await import('pg')
    .catch(() => import(pathToFileURL(
      join(process.cwd(), 'apps', 'bridge', 'node_modules', 'pg', 'lib', 'index.js')).href))
    .then((m) => m.default ?? m);

  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  await client.connect();

  try {
    const { rows: users } = await client.query('SELECT id, username FROM users');
    const { targets, strangers, safe } = selectAccountsToPurge(users, patterns);

    console.log(`motifs           : ${patterns.join(', ')}`);
    console.log(`comptes en base  : ${users.length}`);
    console.log(`correspondances  : ${targets.length}`);
    for (const t of targets) console.log(`   ${t.username}`);

    if (!safe) {
      console.log(`\nABANDON : ${strangers.length} compte(s) hors motif en base `
        + `(${strangers.slice(0, 5).map((s) => s.username).join(', ')}).`);
      console.log('La base n\'est pas un bac a sable : verification manuelle requise.');
      process.exit(1);
    }
    if (!targets.length) { console.log('\nrien a purger.'); return; }
    if (!apply) {
      console.log('\nSIMULATION : rien n\'a ete supprime. Relancer avec --yes.');
      return;
    }

    const ids = targets.map((t) => t.id);
    await client.query('BEGIN');
    const { rows: convs } = await client.query(
      'SELECT DISTINCT conversation_id FROM conversation_members WHERE user_id = ANY($1::text[])',
      [ids]);
    let deletedConvs = 0;
    if (convs.length) {
      const res = await client.query('DELETE FROM conversations WHERE id = ANY($1::text[])',
        [convs.map((c) => c.conversation_id)]);
      deletedConvs = res.rowCount;
    }
    const res = await client.query('DELETE FROM users WHERE id = ANY($1::text[])', [ids]);
    await client.query('COMMIT');

    console.log(`\nconversations supprimees : ${deletedConvs}`);
    console.log(`comptes supprimes        : ${res.rowCount}`);
  } finally {
    await client.end();
  }
}

if (!process.env.NODE_TEST_CONTEXT
    && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`purge impossible : ${error.message}`);
    process.exit(2);
  });
}
