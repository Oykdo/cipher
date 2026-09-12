#!/usr/bin/env node
/**
 * Reconcile the four registries that describe a vault.
 *
 * Why this exists
 * ---------------
 * The same fingerprint identifies a vault in four systems that never talk to
 * each other:
 *
 *   Eidolon local registry     vault_id            the origin (this machine)
 *   Eidolon server registry    vaults[<id>]        the economy
 *   Cipher database            users.linked_vault_id   the social link
 *   Esoptron grants ledger     vault_fp_hex        signed attributions
 *
 * Nothing asserted that the four agreed. That is how a server registry sat
 * empty for months while the vault existed locally, and how the Cipher link
 * stayed wired-but-dead without anyone noticing.
 *
 * The important design point: a pure structural diff would have reported
 * "all consistent" during that entire period. Identity checks are necessary
 * and insufficient -- so half the invariants here check LIVENESS: is the tick
 * running, is activity actually arriving, is the resonance moving the way a
 * fed economy moves. Those are the ones that catch a chain that is plumbed
 * but empty.
 *
 * Read-only. `--fix` PRINTS the repair commands, never runs them: the objects
 * at stake (founder vault numbers, unique relics, production registries) are
 * mostly irreversible, and a reconciler that repairs on its own is a hazard,
 * not a tool.
 *
 * Usage
 * -----
 *   node tools/reconcile-vaults.mjs [--json] [--fix] [--strict]
 *
 *   --json    machine-readable findings
 *   --fix     print suggested repair commands
 *   --strict  exit non-zero on warnings too (default: only on errors)
 *
 * Configuration is read from apps/bridge/.env (DATABASE_URL,
 * CIPHER_WEBHOOK_SECRET) and the environment:
 *   EIDOLON_API_URL       default https://api.eidolon.logos-project.xyz
 *   ESOPTRON_ANCHOR_URL   default https://esoptron.logos-project.xyz/anchor
 *   EIDOLON_DATA_DIR      default %LOCALAPPDATA%/Eidolon
 *   REPORT_INTERVAL_MS    default 4h, must match the bridge reporter
 */

import { createHmac } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// `info` ne fait jamais echouer, meme en --strict : c'est un etat attendu
// qu'on tient a voir ecrit, pas une derive.
export const SEVERITY = { ERROR: 'error', WARN: 'warn', INFO: 'info', OK: 'ok' };

const DEFAULT_REPORT_INTERVAL_MS = 4 * 60 * 60 * 1000;
const RESONANCE_BASELINE = 50;

// ===========================================================================
// The pure core: snapshot in, findings out. No I/O, so it is testable
// without a network, a database or a production registry.
// ===========================================================================

/**
 * @param {object} snapshot  {local, server, cipher, esoptron, now, reportIntervalMs}
 * @returns {Array<{id,severity,title,detail,fix?}>}
 */
export function evaluate(snapshot) {
  const findings = [];
  const {
    local = {}, server = {}, cipher = {}, esoptron = {},
    now = new Date(), reportIntervalMs = DEFAULT_REPORT_INTERVAL_MS,
  } = snapshot;

  const serverById = server.byId || {};
  const localVaults = local.vaults || [];
  const users = cipher.users || [];
  const linkedUsers = users.filter((u) => u.linked_vault_id);

  // Une source injoignable rend certains constats INDECIDABLES. Sans ce
  // distinguo, une base illisible se lit comme "aucun compte lie" et le
  // reconciliateur affirme le contraire de la verite avec aplomb. Le silence
  // d'une source n'est pas une observation.
  const cipherKnown = !cipher.error;
  const serverKnown = !server.error;

  const add = (id, severity, title, detail, fix) =>
    findings.push({ id, severity, title, detail, ...(fix ? { fix } : {}) });

  // Un lien sans le moindre message dans la base du bridge n'a rien a
  // rapporter : le reporter ne POSTe que sur un signal (messages,
  // conversations, verifications de cle), en miroir de is_active() cote
  // Eidolon. Dans cet etat, « jamais alimente » et « resonance sous la ligne
  // de base » sont la consequence attendue d'un ecosysteme a un seul
  // utilisateur, pas une derive -- et une alerte qui sonne chaque jour pour
  // rien cesse d'etre lue. Verifie en production : 0 message, 0 conversation,
  // et deux avertissements par jour depuis le 10 septembre.
  //   true       au moins un compte lie a du signal dans la base
  //   false      des comptes lies, aucun signal
  //   undefined  compteurs absents (instantane ancien) : on garde l'alerte
  const bridgeSignalFor = (vaultId) => {
    const holders = linkedUsers.filter((u) => u.linked_vault_id === vaultId);
    if (!holders.length || holders.some((u) => u.messages_sent === undefined)) return undefined;
    return holders.some((u) => (u.messages_sent || 0) > 0 || (u.conversations || 0) > 0);
  };

  for (const [name, src] of Object.entries({
    'registre local': local, 'registre serveur': server,
    'base Cipher': cipher, 'octrois Esoptron': esoptron,
  })) {
    if (src?.error) {
      add('SOURCE_UNREACHABLE', SEVERITY.WARN,
        `Source injoignable : ${name}`,
        `${src.error}. Les invariants qui en dependent sont suspendus : `
        + `la reconciliation est partielle, pas rassurante.`);
    }
  }

  // --- 1. Structural: a vault known here must exist in the economy ---------
  // Suspendu si le serveur se tait : son silence n'est pas une absence.
  for (const v of (serverKnown ? localVaults : [])) {
    if (!serverById[v.vault_id]) {
      add('LOCAL_MISSING_ON_SERVER', SEVERITY.ERROR,
        `Vault ${v.vault_name || v.vault_id.slice(0, 12)} absent du registre serveur`,
        `Le vault existe sur cette machine (#${v.vault_number}) mais le serveur `
        + `ne le connait pas : le tick ne le fera jamais gagner quoi que ce soit.`,
        `POST /api/v1/cipher/vault/register avec vault_id=${v.vault_id}`);
    }
  }

  // --- 2. Structural: a Cipher link must point at something ----------------
  // Suspendu si la base est muette : on ne sait pas quels liens existent.
  for (const u of (cipherKnown && serverKnown ? linkedUsers : [])) {
    if (!serverById[u.linked_vault_id]) {
      add('CIPHER_LINK_DANGLING', SEVERITY.ERROR,
        `Compte Cipher ${u.username} lie a un vault inconnu du serveur`,
        `users.linked_vault_id = ${u.linked_vault_id.slice(0, 16)}... `
        + `n'existe pas au registre : son activite est comptee pour personne.`,
        `Enregistrer le vault, ou corriger linked_vault_id pour ${u.username}`);
    }
  }

  // --- 3. Structural: numbering is a scarce, irreversible resource ---------
  const numbers = Object.values(serverById)
    .map((e) => e.vault_number)
    .filter((n) => typeof n === 'number' && n > 0);
  const duplicates = numbers.filter((n, i) => numbers.indexOf(n) !== i);
  if (duplicates.length) {
    add('SERVER_NUMBERING', SEVERITY.ERROR,
      'Numeros de vault en double au registre serveur',
      `Numero(s) ${[...new Set(duplicates)].join(', ')} attribue(s) plusieurs fois. `
      + `Le tier decoule du numero : un doublon duplique un rang de fondateur.`);
  }
  const maxNumber = numbers.length ? Math.max(...numbers) : 0;
  if (server.next_vault_number !== undefined && server.next_vault_number <= maxNumber) {
    add('SERVER_NUMBERING', SEVERITY.ERROR,
      'next_vault_number est en retard sur les numeros attribues',
      `next=${server.next_vault_number} <= max=${maxNumber} : la prochaine `
      + `creation reattribuerait un numero deja pris.`);
  }

  // --- 4. Structural: a signed attribution must have a subject ------------
  for (const g of (serverKnown ? (esoptron.grants || []) : [])) {
    if (!serverById[g.vault_fp_hex]) {
      add('GRANT_ORPHAN', SEVERITY.ERROR,
        `Octroi ${g.egg_id || ''} porte par un vault inconnu du serveur`,
        `L'empreinte ${g.vault_fp_hex.slice(0, 16)}... detient un bien signe `
        + `mais n'existe pas au registre de l'economie.`);
    }
  }

  // --- 5. LIVENESS: the link is wired, but is anything flowing? -----------
  // This is the invariant a structural diff cannot express, and the one that
  // would have caught the months-long silence.
  const nowMs = now.getTime();
  for (const [id, entry] of Object.entries(cipherKnown ? serverById : {})) {
    const linkedHere = linkedUsers.some((u) => u.linked_vault_id === id);
    if (!linkedHere) continue;

    const recorded = entry.activity_recorded_at
      ? Date.parse(entry.activity_recorded_at) : null;
    if (!recorded && bridgeSignalFor(id) === false) {
      add('LINK_NEVER_FED', SEVERITY.INFO,
        `${entry.vault_name || id.slice(0, 12)} : lie a Cipher, en attente d'activite`,
        `Aucun message ni conversation dans la base du bridge pour les comptes `
        + `lies : le reporter n'a rien a envoyer, et activity_recorded_at reste `
        + `vide a juste titre. Le lien sera juge au premier message.`);
    } else if (!recorded) {
      add('LINK_NEVER_FED', SEVERITY.WARN,
        `${entry.vault_name || id.slice(0, 12)} : lie a Cipher, jamais alimente`,
        `Des comptes Cipher pointent sur ce vault mais activity_recorded_at `
        + `est vide : aucun rapport d'activite n'est jamais arrive.`,
        'Verifier EIDOLON_ACTIVITY_REPORT_ENABLED et le secret partage');
    } else if (nowMs - recorded > 2 * reportIntervalMs) {
      const hours = Math.round((nowMs - recorded) / 3600000);
      add('LINK_STALE', SEVERITY.WARN,
        `${entry.vault_name || id.slice(0, 12)} : activite figee depuis ${hours} h`,
        `Le dernier rapport remonte a plus de deux intervalles `
        + `(${Math.round(reportIntervalMs / 3600000)} h) : le lien est probablement rompu.`);
    }
  }

  // --- 6. LIVENESS: a fed economy does not only decay --------------------
  for (const [id, entry] of Object.entries(cipherKnown ? serverById : {})) {
    const linkedHere = linkedUsers.some((u) => u.linked_vault_id === id);
    if (linkedHere && typeof entry.resonance === 'number'
        && entry.resonance < RESONANCE_BASELINE) {
      if (bridgeSignalFor(id) === false) {
        add('RESONANCE_DECAYING', SEVERITY.INFO,
          `${entry.vault_name || id.slice(0, 12)} : resonance ${entry.resonance}, sans activite a rapporter`,
          `Sous la ligne de base (${RESONANCE_BASELINE}) parce qu'aucun message ne `
          + `transite par le bridge : elle decroit par construction a chaque epoque `
          + `inactive et remontera avec les premiers echanges.`);
      } else {
        add('RESONANCE_DECAYING', SEVERITY.WARN,
          `${entry.vault_name || id.slice(0, 12)} : resonance ${entry.resonance} sous la ligne de base`,
          `Un vault lie a des comptes actifs devrait remonter vers ${RESONANCE_BASELINE}. `
          + `Une decroissance signifie que le tick ne voit aucune activite.`);
      }
    }
  }

  // --- 7. LIVENESS: the registry believes in a link that no longer exists --
  const registeredViaCipher = Object.values(serverById)
    .filter((e) => (e.registered_via || '').startsWith('cipher')
                || (e.registered_via || '') === 'eidolon');
  // Angle mort observe en conditions reelles : onze comptes existaient, aucun
  // n'etait lie, et le verdict restait vert -- les invariants de vivacite ne
  // portent que sur les vaults LIES, donc ils se taisaient tous.
  if (cipherKnown && users.length > 0 && linkedUsers.length === 0
      && Object.keys(serverById).length > 0) {
    add('NO_LINK_AT_ALL', SEVERITY.WARN,
      `${users.length} compte(s) Cipher, aucun lie a un vault`,
      `Le registre porte ${Object.keys(serverById).length} vault(s) et la base `
      + `${users.length} compte(s), mais aucun linked_vault_id : la chaine est `
      + `complete et pourtant rien ne peut circuler.`,
      'Lier un vault depuis Cipher desktop (login vault-bridge)');
  }

  if (cipherKnown && users.length === 0 && registeredViaCipher.length > 0) {
    add('CIPHER_EMPTY_BUT_REGISTERED', SEVERITY.WARN,
      'Le registre porte des vaults lies alors que Cipher n\'a aucun compte',
      `${registeredViaCipher.length} vault(s) enregistre(s) via Cipher, mais la `
      + `base compte 0 utilisateur : la base a ete purgee sans que l'economie `
      + `en soit informee, et plus aucune activite ne peut remonter.`);
  }

  // Des informations ne sont pas des constats : elles n'empechent pas de
  // conclure que les registres concordent.
  if (!findings.some((f) => f.severity !== SEVERITY.INFO)) {
    add('CONSISTENT', SEVERITY.OK, 'Les quatre registres concordent',
      `${localVaults.length} vault(s) local(aux), ${Object.keys(serverById).length} `
      + `au serveur, ${linkedUsers.length} lien(s) Cipher.`);
  }

  return findings;
}

export function exitCodeFor(findings, { strict = false } = {}) {
  if (findings.some((f) => f.severity === SEVERITY.ERROR)) return 1;
  if (strict && findings.some((f) => f.severity === SEVERITY.WARN)) return 1;
  return 0;
}

// ===========================================================================
// Collectors (I/O). Each returns {error} instead of throwing: a reconciler
// that dies on its first unreachable source reconciles nothing.
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

export function localRegistryPath(env = process.env) {
  const root = env.EIDOLON_DATA_DIR
    || join(env.LOCALAPPDATA || env.HOME || '.', 'Eidolon');
  return join(root, 'data', 'vaults', 'identities', 'vault_registry.json');
}

async function collectLocal(env) {
  const path = localRegistryPath(env);
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    return {
      path,
      vaults: Object.entries(raw.vaults || {}).map(([id, v]) => ({
        vault_id: v.vault_id || id,
        vault_number: v.vault_number,
        vault_name: v.vault_name,
        is_active: v.is_active !== false,
      })),
    };
  } catch (error) {
    return { path, vaults: [], error: error.message };
  }
}

async function collectServer(vaultIds, { base, secret }) {
  const byId = {};
  let next_vault_number;
  let registry_vault_count;
  const errors = [];

  for (const id of vaultIds) {
    const sig = 'sha256=' + createHmac('sha256', secret).update(id).digest('hex');
    try {
      const res = await fetch(`${base}/api/v1/cipher/vault/${id}`, {
        headers: { 'X-Cipher-Signature': sig },
      });
      if (res.status === 404) continue;          // absent: invariant 1 le dira
      if (!res.ok) { errors.push(`${id.slice(0, 12)}: HTTP ${res.status}`); continue; }
      const entry = await res.json();
      byId[entry.vault_id] = entry;
      next_vault_number = entry.next_vault_number;
      registry_vault_count = entry.registry_vault_count;
    } catch (error) {
      errors.push(`${id.slice(0, 12)}: ${error.message}`);
    }
  }
  return { byId, next_vault_number, registry_vault_count, ...(errors.length ? { error: errors.join('; ') } : {}) };
}

async function collectCipher(dsn) {
  if (!dsn) return { users: [], error: 'DATABASE_URL absent' };
  try {
    // `pg` est une dependance du bridge, pas de tools/ : on le resout d'abord
    // normalement (l'outil peut tourner depuis apps/bridge), puis la ou il se
    // trouve reellement. Dupliquer le pilote pour ce seul outil ferait deux
    // versions a maintenir.
    const pg = await import('pg')
      .catch(() => import(pathToFileURL(
        join(process.cwd(), 'apps', 'bridge', 'node_modules', 'pg', 'lib', 'index.js')).href))
      .then((m) => m.default ?? m);
    const client = new pg.Client({ connectionString: dsn });
    await client.connect();
    try {
      // Les deux compteurs disent si le bridge a quelque chose a rapporter
      // pour ce compte, toutes periodes confondues : les memes tables que
      // cipherActivityReporter, sans borne de temps. Un compte a zero des
      // deux cotes n'a rien a envoyer, et les invariants de vivacite le
      // liront comme une attente, pas comme une panne.
      const { rows } = await client.query(
        `SELECT u.id, u.username, u.linked_vault_id, u.last_known_resonance,
                (SELECT COUNT(*)::int FROM messages m WHERE m.sender_id = u.id) AS messages_sent,
                (SELECT COUNT(DISTINCT m.conversation_id)::int
                   FROM messages m
                   JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
                  WHERE cm.user_id = u.id) AS conversations
           FROM users u ORDER BY u.username`);
      return { users: rows };
    } finally {
      await client.end();
    }
  } catch (error) {
    return { users: [], error: error.message };
  }
}

async function collectEsoptron(vaultIds, base) {
  const grants = [];
  const errors = [];
  for (const id of vaultIds) {
    try {
      const res = await fetch(`${base}/api/v1/eggs/grants/${id}`);
      if (!res.ok) { errors.push(`${id.slice(0, 12)}: HTTP ${res.status}`); continue; }
      const payload = await res.json();
      for (const g of payload.grants || []) grants.push(g);
    } catch (error) {
      errors.push(`${id.slice(0, 12)}: ${error.message}`);
    }
  }
  return { grants, ...(errors.length ? { error: errors.join('; ') } : {}) };
}

// ===========================================================================
// CLI
// ===========================================================================

const COLOURS = {
  error: '\x1b[31m', warn: '\x1b[33m', info: '\x1b[36m', ok: '\x1b[32m',
  dim: '\x1b[2m', bold: '\x1b[1m', reset: '\x1b[0m',
};

function report(findings, snapshot, { fix }) {
  const c = COLOURS;
  console.log(`\n${c.bold}RECONCILIATION DES REGISTRES${c.reset}`);
  console.log(`${c.dim}${'-'.repeat(60)}${c.reset}`);

  for (const [name, src] of Object.entries({
    'registre local': snapshot.local, 'registre serveur': snapshot.server,
    'base Cipher': snapshot.cipher, 'octrois Esoptron': snapshot.esoptron,
  })) {
    const state = src?.error
      ? `${c.warn}injoignable : ${src.error}${c.reset}`
      : `${c.ok}lu${c.reset}`;
    console.log(`  ${name.padEnd(20)} ${state}`);
  }
  console.log();

  for (const f of findings) {
    const col = c[f.severity] || c.reset;
    console.log(`  ${col}[${f.severity.toUpperCase()}]${c.reset} ${c.bold}${f.title}${c.reset}`);
    console.log(`      ${c.dim}${f.detail}${c.reset}`);
    if (fix && f.fix) console.log(`      ${c.bold}reparer :${c.reset} ${f.fix}`);
  }
  console.log();
}

async function main() {
  const args = process.argv.slice(2);
  const opts = {
    json: args.includes('--json'),
    fix: args.includes('--fix'),
    strict: args.includes('--strict'),
  };

  const bridgeEnv = readEnvFile(join(process.cwd(), 'apps', 'bridge', '.env'));
  const env = { ...bridgeEnv, ...process.env };

  const secret = env.CIPHER_WEBHOOK_SECRET || env.EIDOLON_CONNECT_SESSION_SECRET;
  const eidolonBase = (env.EIDOLON_API_URL || 'https://api.eidolon.logos-project.xyz').replace(/\/$/, '');
  const anchorBase = (env.ESOPTRON_ANCHOR_URL || 'https://esoptron.logos-project.xyz/anchor').replace(/\/$/, '');

  const local = await collectLocal(env);
  const cipher = await collectCipher(env.DATABASE_URL);

  // The union of every fingerprint any source mentions: a vault missing from
  // one of them is exactly what we are looking for, so we cannot key the scan
  // on a single source.
  const ids = [...new Set([
    ...local.vaults.map((v) => v.vault_id),
    ...cipher.users.map((u) => u.linked_vault_id).filter(Boolean),
  ])];

  const server = secret
    ? await collectServer(ids, { base: eidolonBase, secret })
    : { byId: {}, error: 'CIPHER_WEBHOOK_SECRET absent' };
  const esoptron = await collectEsoptron(ids, anchorBase);

  const snapshot = {
    local, server, cipher, esoptron,
    now: new Date(),
    reportIntervalMs: Number(env.REPORT_INTERVAL_MS) || DEFAULT_REPORT_INTERVAL_MS,
  };

  const findings = evaluate(snapshot);
  if (opts.json) console.log(JSON.stringify({ findings, snapshot }, null, 2));
  else report(findings, snapshot, opts);

  process.exit(exitCodeFor(findings, opts));
}

// N'agit que lorsque CE fichier est le point d'entree. Un repli sur le nom de
// argv[1] declenchait main() a l'import -- y compris sous `node --test`, ou le
// module est importe par le fichier de tests.
// Deux garde-fous, parce que cet outil interroge la PRODUCTION :
//   - le module ne s'execute que s'il est le point d'entree ;
//   - NODE_TEST_CONTEXT, pose par le lanceur de tests, l'exclut en plus au
//     cas ou une invocation le designerait comme fichier de test.
if (!process.env.NODE_TEST_CONTEXT
    && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`reconciliation impossible : ${error.message}`);
    process.exit(2);
  });
}
