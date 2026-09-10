/**
 * Tests de la selection des comptes a purger.
 *
 * Le coeur teste est celui qui DECIDE, pas celui qui supprime : une purge se
 * teste avant de l'executer, pas apres.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { selectAccountsToPurge, DEFAULT_PATTERNS } from './purge-e2e-accounts.mjs';

const u = (username, id = username) => ({ id, username });

test('les comptes de harnais sont reconnus', () => {
  const users = [u('m3amtu9qz8hi66004'), u('m3bmtu9r1z74fbjvq'), u('m1testabc')];
  const { targets, safe } = selectAccountsToPurge(users);
  assert.equal(targets.length, 3);
  assert.equal(safe, true);
});

test('un compte reel bloque TOUTE la purge', () => {
  // Le point important : on ne supprime pas "juste les notres" dans une base
  // dont on a manifestement mal compris l'etat.
  const users = [u('m3atest'), u('jeremy')];
  const { targets, strangers, safe } = selectAccountsToPurge(users);
  assert.equal(safe, false);
  assert.equal(strangers.length, 1);
  assert.equal(strangers[0].username, 'jeremy');
  assert.equal(targets.length, 1, 'les cibles restent listees, pour le rapport');
});

test('une base vide ne declenche rien', () => {
  const { targets, safe } = selectAccountsToPurge([]);
  assert.equal(targets.length, 0);
  assert.equal(safe, true);
});

test('le motif ne mord pas sur un prefixe voisin', () => {
  // 'm3a%' ne doit pas attraper 'm3admin' par accident... mais si, il le
  // ferait. Ce test documente la limite reelle plutot que de pretendre le
  // contraire : le prefixe est une convention, pas une garantie -- d'ou le
  // refus global des le moindre compte hors motif.
  const users = [u('m3admin')];
  const { targets } = selectAccountsToPurge(users);
  assert.equal(targets.length, 1,
    'le prefixe est une convention : seule la regle du refus global protege');
});

test('un motif explicite remplace les defauts', () => {
  const users = [u('m3atest'), u('demo-42')];
  const { targets, safe } = selectAccountsToPurge(users, ['demo-%']);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].username, 'demo-42');
  assert.equal(safe, false, 'm3atest devient un etranger sous ce motif');
});

test('les caracteres speciaux d un motif ne sont pas interpretes', () => {
  const users = [u('a.b'), u('axb')];
  const { targets } = selectAccountsToPurge(users, ['a.b']);
  assert.deepEqual(targets.map((t) => t.username), ['a.b'],
    'le point doit rester litteral, sinon le motif attrape trop large');
});

test('les motifs par defaut couvrent les deux harnais', () => {
  assert.ok(DEFAULT_PATTERNS.some((p) => p.startsWith('m1test')));
  assert.ok(DEFAULT_PATTERNS.some((p) => p.startsWith('m3a')));
  assert.ok(DEFAULT_PATTERNS.some((p) => p.startsWith('m3b')));
});
