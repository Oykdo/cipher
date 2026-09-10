#!/usr/bin/env node
/**
 * Restauration de la base Cipher depuis une sauvegarde JSON — et surtout,
 * repetition de restauration.
 *
 * Une sauvegarde qu'on n'a jamais rechargee est une hypothese. Ce module
 * existe autant pour restaurer que pour PROUVER, chaque nuit, que la
 * sauvegarde de la veille est rechargeable et fidele.
 *
 * L'astuce qui rend la repetition sure : elle se fait dans un SCHEMA jetable
 * de la base elle-meme. Les donnees ne quittent jamais la base dont elles
 * viennent -- pas de second hote, pas de second secret, pas de copie de
 * messages d'utilisateurs ailleurs. Les tables cibles sont creees avec
 * `LIKE public.<table> INCLUDING ALL`, ce qui reproduit types, contraintes et
 * index sans que l'export JSON ait eu besoin de les porter.
 *
 * Usage :
 *   node tools/restore-cipher-db.mjs --verify [fichier]   repetition + comparaison
 *   node tools/restore-cipher-db.mjs --into public --yes [fichier]   VRAIE restauration
 *
 * `--verify` est le mode par defaut : ecrire dans `public` exige --into public
 * ET --yes, deux gestes distincts, parce qu'une restauration ecrase.
 *
 * Sortie : 0 fidele | 1 divergence | 2 execution impossible
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const CHECK_SCHEMA = 'restore_check';

// ===========================================================================
// Coeur pur
// ===========================================================================

/** Empreinte d'un ensemble de lignes, insensible a l'ordre. */
export function rowsFingerprint(rows) {
  const norm = rows
    .map((row) => JSON.stringify(row, Object.keys(row).sort()))
    .sort();
  return createHash('sha256').update(norm.join('\n')).digest('hex');
}

/**
 * Compare le contenu recharge a celui de la base d'origine.
 * @returns {Array<{table, reason, restored?, live?}>}
 */
export function compareRestored(restored, live) {
  const findings = [];
  const names = new Set([...Object.keys(restored), ...Object.keys(live)]);

  for (const table of names) {
    const r = restored[table];
    const l = live[table];

    if (!r || !l) {
      findings.push({ table, reason: !r ? 'absente du rechargement' : 'absente de la base' });
      continue;
    }
    if (r.length !== l.length) {
      findings.push({ table, reason: 'comptage', restored: r.length, live: l.length });
      continue;
    }
    // Un comptage egal ne dit rien des valeurs.
    if (rowsFingerprint(r) !== rowsFingerprint(l)) {
      findings.push({ table, reason: 'contenu' });
    }
  }
  return findings;
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

function latestBackup(dir) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => f.startsWith('cipher-') && f.endsWith('.json'))
    .sort()
    .reverse();
  return files.length ? join(dir, files[0]) : null;
}

async function loadPg() {
  return import('pg')
    .catch(() => import(pathToFileURL(
      join(process.cwd(), 'apps', 'bridge', 'node_modules', 'pg', 'lib', 'index.js')).href))
    .then((m) => m.default ?? m);
}

const ident = (name) => `"${String(name).replace(/"/g, '""')}"`;

async function insertRows(client, schema, table, columns, rows) {
  if (!rows.length) return;
  const cols = columns.map(ident).join(', ');

  // Par paquets : une requete unique de plusieurs milliers de lignes depasse
  // la limite de parametres de Postgres (65535).
  const perBatch = Math.max(1, Math.floor(60000 / columns.length));
  for (let i = 0; i < rows.length; i += perBatch) {
    const slice = rows.slice(i, i + perBatch);
    const values = [];
    const tuples = slice.map((row, r) => {
      const placeholders = columns.map((c, k) => {
        values.push(row[c] ?? null);
        return `$${r * columns.length + k + 1}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    await client.query(
      `INSERT INTO ${ident(schema)}.${ident(table)} (${cols}) VALUES ${tuples.join(', ')}`,
      values,
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  const intoIdx = args.indexOf('--into');
  const into = intoIdx >= 0 ? args[intoIdx + 1] : CHECK_SCHEMA;
  const confirmed = args.includes('--yes');
  const file = args.find((a) => a.endsWith('.json'))
    || latestBackup(join(process.env.LOCALAPPDATA || process.env.HOME || '.', 'cipher-db-backup'));

  if (!file || !existsSync(file)) {
    console.error('aucune sauvegarde a recharger');
    process.exit(2);
  }
  if (into === 'public' && !confirmed) {
    console.error('ecrire dans public exige --yes : une restauration ecrase.');
    process.exit(2);
  }

  const env = { ...readEnvFile(join(process.cwd(), 'apps', 'bridge', '.env')), ...process.env };
  if (!env.DATABASE_URL) { console.error('DATABASE_URL absent'); process.exit(2); }

  const dump = JSON.parse(readFileSync(file, 'utf8'));
  const tables = Object.keys(dump.tables);
  console.log(`sauvegarde : ${file}`);
  console.log(`  ${tables.length} table(s), prise le ${dump.createdAt}`);
  console.log(`  cible : schema ${into}${into === CHECK_SCHEMA ? ' (jetable)' : ''}`);

  const pg = await loadPg();
  const client = new pg.Client({
    connectionString: env.DATABASE_URL,
    ssl: env.DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();

  let findings = [];
  try {
    if (into === CHECK_SCHEMA) {
      await client.query(`DROP SCHEMA IF EXISTS ${ident(into)} CASCADE`);
      await client.query(`CREATE SCHEMA ${ident(into)}`);
    }

    const restored = {};
    const live = {};

    for (const table of tables) {
      const { columns, rows } = dump.tables[table];

      if (into === CHECK_SCHEMA) {
        // LIKE ... INCLUDING ALL reproduit types, defauts et contraintes :
        // l'export JSON n'a pas besoin de porter le schema.
        await client.query(
          `CREATE TABLE ${ident(into)}.${ident(table)} (LIKE public.${ident(table)} INCLUDING ALL)`);
      }
      await insertRows(client, into, table, columns, rows);

      const r = await client.query(`SELECT * FROM ${ident(into)}.${ident(table)}`);
      const l = await client.query(`SELECT * FROM public.${ident(table)}`);
      restored[table] = r.rows;
      live[table] = l.rows;
    }

    findings = compareRestored(restored, live);

    const total = Object.values(restored).reduce((a, r) => a + r.length, 0);
    console.log(`  ${total} ligne(s) rechargee(s)`);
  } finally {
    if (into === CHECK_SCHEMA) {
      await client.query(`DROP SCHEMA IF EXISTS ${ident(into)} CASCADE`).catch(() => {});
    }
    await client.end();
  }

  if (!findings.length) {
    console.log('\nfidele : la sauvegarde se recharge et reproduit exactement la base');
    process.exit(0);
  }
  console.error('');
  for (const f of findings) {
    const detail = f.reason === 'comptage'
      ? ` (${f.restored} recharge / ${f.live} en base)` : '';
    console.error(`  DIVERGENCE ${f.table} : ${f.reason}${detail}`);
  }
  console.error(`\n${findings.length} divergence(s) — la sauvegarde N'EST PAS fidele`);
  process.exit(1);
}

if (!process.env.NODE_TEST_CONTEXT
    && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`restauration impossible : ${error.message}`);
    process.exit(2);
  });
}
