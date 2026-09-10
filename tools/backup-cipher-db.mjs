#!/usr/bin/env node
/**
 * Sauvegarde logique de la base Cipher, avec rotation et verification.
 *
 * Pourquoi pas pg_dump : il n'est pas installe sur ce poste, et c'est ici que
 * la sauvegarde doit tourner -- seul le poste detient legitimement le DSN.
 * Le deposer sur un serveur pour profiter de son pg_dump reviendrait a
 * melanger les secrets de deux systemes independants.
 *
 * Ce que l'export JSON garantit et ce qu'il ne garantit pas : il capture le
 * CONTENU (colonnes et lignes de chaque table du schema public), pas le
 * schema lui-meme -- index, contraintes, sequences et types ne sont pas
 * reproduits. Restaurer suppose donc une base dont le schema existe deja.
 * C'est une limite reelle, enoncee ici plutot que decouverte le jour ou elle
 * compte.
 *
 * Trois garanties, les memes que cote Eidolon et Esoptron :
 *   1. on ne conserve jamais une sauvegarde qu'on n'a pas relue : le fichier
 *      ecrit est immediatement reparse et ses comptages compares a la base ;
 *   2. les copies vivent hors du depot (%LOCALAPPDATA%) ;
 *   3. un contenu identique au precedent n'est pas duplique.
 *
 * Usage :
 *   node tools/backup-cipher-db.mjs [--out <dossier>] [--keep 30]
 *
 * Sortie : 0 sauvegarde conforme | 1 divergence | 2 execution impossible
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_KEEP = 30;

// ===========================================================================
// Coeur pur : comparaison d'un instantane a l'etat de la base.
// ===========================================================================

/**
 * Compare les comptages du dump a ceux de la base.
 * @returns {Array<{table, dump, live}>} les tables qui divergent
 */
export function compareCounts(dumpTables, liveCounts) {
  const divergences = [];
  const names = new Set([...Object.keys(dumpTables), ...Object.keys(liveCounts)]);

  for (const table of names) {
    const dump = dumpTables[table] ? dumpTables[table].rows.length : null;
    const live = liveCounts[table] ?? null;
    if (dump !== live) divergences.push({ table, dump, live });
  }
  return divergences;
}

/**
 * Empreinte du contenu, insensible a l'ordre des lignes et des tables.
 *
 * L'ordre des lignes d'un SELECT sans ORDER BY n'est pas garanti : sans
 * normalisation, deux exports d'une base inchangee produiraient des
 * empreintes differentes et la deduplication ne mordrait jamais -- la
 * retention garderait trente fois le meme etat en croyant garder trente
 * etats.
 */
export function contentFingerprint(tables) {
  const parts = Object.keys(tables).sort().map((name) => {
    const rows = tables[name].rows
      .map((row) => JSON.stringify(row, Object.keys(row).sort()))
      .sort();
    return `${name}\n${rows.join('\n')}`;
  });
  return createHash('sha256').update(parts.join('\n--\n')).digest('hex');
}

// ===========================================================================
// I/O
// ===========================================================================

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

async function loadPg() {
  return import('pg')
    .catch(() => import(pathToFileURL(
      join(process.cwd(), 'apps', 'bridge', 'node_modules', 'pg', 'lib', 'index.js')).href))
    .then((m) => m.default ?? m);
}

async function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const keepIdx = args.indexOf('--keep');
  const outDir = outIdx >= 0 ? args[outIdx + 1]
    : join(process.env.LOCALAPPDATA || process.env.HOME || '.', 'cipher-db-backup');
  const keep = keepIdx >= 0 ? Number(args[keepIdx + 1]) : DEFAULT_KEEP;

  const env = { ...readEnvFile(join(process.cwd(), 'apps', 'bridge', '.env')), ...process.env };
  if (!env.DATABASE_URL) {
    console.error('DATABASE_URL absent (apps/bridge/.env)');
    process.exit(2);
  }

  const pg = await loadPg();
  const client = new pg.Client({
    connectionString: env.DATABASE_URL,
    ssl: env.DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();

  let dump;
  const liveCounts = {};
  try {
    const { rows: tableRows } = await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");

    dump = {
      version: 2,
      createdAt: new Date().toISOString(),
      host: new URL(env.DATABASE_URL).hostname,
      tables: {},
    };

    for (const { tablename } of tableRows) {
      const res = await client.query(`SELECT * FROM "${tablename}"`);
      dump.tables[tablename] = {
        columns: res.fields.map((f) => f.name),
        rows: res.rows,
      };
      liveCounts[tablename] = res.rowCount;
    }
  } finally {
    await client.end();
  }

  dump.fingerprint = contentFingerprint(dump.tables);

  mkdirSync(outDir, { recursive: true });

  // Deduplication : inutile de garder trente fois le meme etat.
  const existing = readdirSync(outDir)
    .filter((f) => f.startsWith('cipher-') && f.endsWith('.json'))
    .sort()
    .reverse();
  if (existing.length) {
    try {
      const last = JSON.parse(readFileSync(join(outDir, existing[0]), 'utf8'));
      if (last.fingerprint === dump.fingerprint) {
        console.log(`inchange depuis ${existing[0]} — pas de copie`);
        process.exit(0);
      }
    } catch { /* fichier precedent illisible : on ecrit, c'est le bon reflexe */ }
  }

  const stamp = dump.createdAt.replace(/[:.]/g, '-');
  const dest = join(outDir, `cipher-${stamp}.json`);
  const tmp = `${dest}.tmp`;
  writeFileSync(tmp, JSON.stringify(dump, null, 2), 'utf8');
  renameSync(tmp, dest);

  // Garantie 1 : on relit ce qu'on vient d'ecrire. Une sauvegarde qu'on n'a
  // pas relue est une intention, pas une sauvegarde.
  const reread = JSON.parse(readFileSync(dest, 'utf8'));
  const divergences = compareCounts(reread.tables, liveCounts);
  const fingerprintOk = contentFingerprint(reread.tables) === dump.fingerprint;

  const total = Object.values(liveCounts).reduce((a, b) => a + b, 0);
  console.log(`sauvegarde : ${dest}`);
  console.log(`  ${Object.keys(dump.tables).length} table(s), ${total} ligne(s)`);
  console.log(`  empreinte : ${dump.fingerprint.slice(0, 16)}...`);

  if (divergences.length || !fingerprintOk) {
    for (const d of divergences) {
      console.error(`  DIVERGENCE ${d.table} : ${d.dump} dans le fichier, ${d.live} en base`);
    }
    if (!fingerprintOk) console.error('  DIVERGENCE : l\'empreinte relue ne correspond pas');
    console.error('sauvegarde NON conforme — conservee pour analyse');
    process.exit(1);
  }
  console.log('  relecture conforme');

  // Retention.
  const files = readdirSync(outDir)
    .filter((f) => f.startsWith('cipher-') && f.endsWith('.json'))
    .sort()
    .reverse();
  for (const old of files.slice(keep)) {
    unlinkSync(join(outDir, old));
    console.log(`  purge ${old}`);
  }
  console.log(`  ${Math.min(files.length, keep)} copie(s) conservee(s) sur ${keep}`);
}

if (!process.env.NODE_TEST_CONTEXT
    && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`sauvegarde impossible : ${error.message}`);
    process.exit(2);
  });
}
