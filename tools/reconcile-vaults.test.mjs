/**
 * Tests du reconciliateur — `node --test tools/`
 *
 * Ils portent tous sur `evaluate()`, le coeur pur : un instantane entre, des
 * constats sortent. Aucun reseau, aucune base, aucun registre de production
 * n'est touche, ce qui permet de tester les cas de derive que l'on n'a
 * justement pas envie de reproduire pour de vrai.
 *
 * Le scenario le plus important est `SILENCE_STRUCTURELLEMENT_PARFAIT` : les
 * quatre registres concordent parfaitement et pourtant rien ne circule. Un
 * diff structurel classique l'aurait declare sain -- c'est l'etat exact dans
 * lequel le lien Cipher-Eidolon est reste des mois.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluate, exitCodeFor, SEVERITY } from './reconcile-vaults.mjs';

const VAULT = '444d0a1dd4e9bf68ec769938db47df1e7fc7ad6beec505af42696e19dfb0e7ab';
const OTHER = 'aa'.repeat(32);
const NOW = new Date('2026-09-10T12:00:00Z');
const HOUR = 3600 * 1000;

const ids = (findings) => findings.map((f) => f.id);

/** Un instantane sain : quatre registres d'accord, et un lien vivant. */
function healthy(overrides = {}) {
  return {
    now: NOW,
    reportIntervalMs: 4 * HOUR,
    local: { vaults: [{ vault_id: VAULT, vault_number: 1, vault_name: 'zgo' }] },
    server: {
      byId: {
        [VAULT]: {
          vault_id: VAULT, vault_number: 1, vault_name: 'zgo',
          resonance: 62, eidolon_balance: 800, registered_via: 'cipher',
          activity_recorded_at: new Date(NOW.getTime() - HOUR).toISOString(),
        },
      },
      next_vault_number: 2,
    },
    cipher: { users: [{ id: 'u1', username: 'alice', linked_vault_id: VAULT }] },
    esoptron: { grants: [{ vault_fp_hex: VAULT, egg_id: 'GE-111' }] },
    ...overrides,
  };
}

test('un systeme sain ne produit qu un constat OK', () => {
  const findings = evaluate(healthy());
  assert.deepEqual(ids(findings), ['CONSISTENT']);
  assert.equal(findings[0].severity, SEVERITY.OK);
  assert.equal(exitCodeFor(findings), 0);
});

test('SILENCE STRUCTURELLEMENT PARFAIT : tout concorde, rien ne circule', () => {
  // Aucune divergence d'identite : le vault est partout, les numeros sont
  // bons, l'octroi a bien un sujet. Seule la vivacite trahit la panne.
  const snapshot = healthy();
  snapshot.server.byId[VAULT].activity_recorded_at = null;
  snapshot.server.byId[VAULT].resonance = 45.71;

  const findings = evaluate(snapshot);
  const found = ids(findings);

  assert.ok(found.includes('LINK_NEVER_FED'),
    'le lien jamais alimente doit etre signale');
  assert.ok(found.includes('RESONANCE_DECAYING'),
    'une resonance sous la ligne de base sur un vault lie doit etre signalee');
  // Et surtout : aucune anomalie structurelle. C'est tout le sujet.
  assert.ok(!found.some((id) =>
    ['LOCAL_MISSING_ON_SERVER', 'CIPHER_LINK_DANGLING', 'SERVER_NUMBERING',
     'GRANT_ORPHAN'].includes(id)),
    'aucun invariant structurel ne doit se declencher');
});

test('1. un vault local absent du serveur est une erreur', () => {
  const snapshot = healthy({ server: { byId: {}, next_vault_number: 2 } });
  const findings = evaluate(snapshot);
  assert.ok(ids(findings).includes('LOCAL_MISSING_ON_SERVER'));
  assert.equal(exitCodeFor(findings), 1);
  assert.match(findings[0].fix, /vault\/register/);
});

test('2. un lien Cipher vers un vault inconnu est une erreur', () => {
  const snapshot = healthy();
  snapshot.cipher.users = [{ id: 'u1', username: 'bob', linked_vault_id: OTHER }];
  const findings = evaluate(snapshot);
  assert.ok(ids(findings).includes('CIPHER_LINK_DANGLING'));
  assert.equal(exitCodeFor(findings), 1);
});

test('3. des numeros en double sont une erreur', () => {
  const snapshot = healthy();
  snapshot.server.byId[OTHER] = {
    vault_id: OTHER, vault_number: 1, vault_name: 'clone', resonance: 50,
  };
  snapshot.server.next_vault_number = 3;
  const findings = evaluate(snapshot);
  const numbering = findings.filter((f) => f.id === 'SERVER_NUMBERING');
  assert.equal(numbering.length, 1);
  assert.match(numbering[0].detail, /plusieurs fois/);
});

test('3bis. un next_vault_number en retard reattribuerait un numero pris', () => {
  const snapshot = healthy();
  snapshot.server.next_vault_number = 1;
  const findings = evaluate(snapshot);
  assert.ok(findings.some((f) => f.id === 'SERVER_NUMBERING'
    && /en retard/.test(f.title)));
});

test('4. un octroi porte par un vault inconnu est une erreur', () => {
  const snapshot = healthy();
  snapshot.esoptron.grants = [{ vault_fp_hex: OTHER, egg_id: 'GE-111' }];
  const findings = evaluate(snapshot);
  assert.ok(ids(findings).includes('GRANT_ORPHAN'));
  assert.equal(exitCodeFor(findings), 1);
});

test('5. une activite figee au-dela de deux intervalles est signalee', () => {
  const snapshot = healthy();
  snapshot.server.byId[VAULT].activity_recorded_at =
    new Date(NOW.getTime() - 9 * HOUR).toISOString();
  const findings = evaluate(snapshot);
  const stale = findings.find((f) => f.id === 'LINK_STALE');
  assert.ok(stale, 'un rapport vieux de 9 h avec un intervalle de 4 h doit alerter');
  assert.match(stale.title, /9 h/);
});

test('5bis. une activite recente ne declenche rien', () => {
  const snapshot = healthy();
  snapshot.server.byId[VAULT].activity_recorded_at =
    new Date(NOW.getTime() - 3 * HOUR).toISOString();
  assert.deepEqual(ids(evaluate(snapshot)), ['CONSISTENT']);
});

test('6. la resonance n est jugee que sur un vault effectivement lie', () => {
  const snapshot = healthy();
  snapshot.server.byId[VAULT].resonance = 30;
  snapshot.cipher.users = [];          // plus aucun lien
  const findings = evaluate(snapshot);
  assert.ok(!ids(findings).includes('RESONANCE_DECAYING'),
    'sans compte lie, une resonance basse n est pas une anomalie de lien');
});

test('7. un registre lie alors que Cipher est vide est signale', () => {
  const snapshot = healthy();
  snapshot.cipher.users = [];
  const findings = evaluate(snapshot);
  assert.ok(ids(findings).includes('CIPHER_EMPTY_BUT_REGISTERED'));
});

test('les avertissements ne font echouer qu en mode strict', () => {
  const snapshot = healthy();
  snapshot.server.byId[VAULT].activity_recorded_at = null;
  const findings = evaluate(snapshot);
  assert.ok(findings.every((f) => f.severity !== SEVERITY.ERROR));
  assert.equal(exitCodeFor(findings), 0);
  assert.equal(exitCodeFor(findings, { strict: true }), 1);
});

test('une source injoignable ne permet AUCUNE conclusion a son sujet', () => {
  // Le piege observe en conditions reelles : la base Cipher illisible se
  // lisait comme "aucun compte", et le reconciliateur affirmait une purge
  // qui n'avait pas eu lieu. Le silence d'une source n'est pas une
  // observation -- il rend les invariants qui en dependent indecidables.
  const snapshot = healthy({ cipher: { users: [], error: 'pg introuvable' } });
  const found = ids(evaluate(snapshot));

  assert.ok(found.includes('SOURCE_UNREACHABLE'),
    'la source muette doit etre signalee comme telle');
  assert.ok(!found.includes('CIPHER_EMPTY_BUT_REGISTERED'),
    'une base illisible ne prouve pas une base vide');
  assert.ok(!found.includes('LINK_NEVER_FED'),
    'sans la liste des liens, la vivacite du lien est indecidable');
});

test('un serveur muet ne fait pas conclure a l absence d un vault', () => {
  const snapshot = healthy({ server: { byId: {}, error: 'HTTP 503' } });
  const found = ids(evaluate(snapshot));

  assert.ok(found.includes('SOURCE_UNREACHABLE'));
  assert.ok(!found.includes('LOCAL_MISSING_ON_SERVER'),
    'un serveur injoignable n est pas un registre vide');
  assert.ok(!found.includes('GRANT_ORPHAN'),
    'un octroi ne devient pas orphelin parce que le serveur se tait');
});

test('une reconciliation partielle n est jamais couronnee CONSISTENT', () => {
  const snapshot = healthy({ cipher: { users: [], error: 'pg introuvable' } });
  const found = ids(evaluate(snapshot));
  assert.ok(!found.includes('CONSISTENT'),
    'on ne declare pas la concordance de quatre registres quand un seul manque');
});

test('plusieurs vaults sont evalues independamment', () => {
  const snapshot = healthy();
  snapshot.local.vaults.push({ vault_id: OTHER, vault_number: 2, vault_name: 'second' });
  const findings = evaluate(snapshot);
  const missing = findings.filter((f) => f.id === 'LOCAL_MISSING_ON_SERVER');
  assert.equal(missing.length, 1);
  assert.match(missing[0].title, /second/);
});

test('8. des comptes sans aucun lien sont signales', () => {
  // Angle mort trouve en production : les invariants de vivacite ne portent
  // que sur les vaults LIES, donc onze comptes non lies passaient inapercus
  // pendant que l'economie decroissait.
  const snapshot = healthy();
  snapshot.cipher.users = [
    { id: 'u1', username: 'alice', linked_vault_id: null },
    { id: 'u2', username: 'bob', linked_vault_id: null },
  ];
  const found = ids(evaluate(snapshot));
  assert.ok(found.includes('NO_LINK_AT_ALL'));
  assert.ok(!found.includes('CONSISTENT'),
    'un systeme ou rien ne circule ne doit pas etre declare concordant');
});

test('8bis. un lien existant fait taire l alerte', () => {
  const found = ids(evaluate(healthy()));
  assert.ok(!found.includes('NO_LINK_AT_ALL'));
});
