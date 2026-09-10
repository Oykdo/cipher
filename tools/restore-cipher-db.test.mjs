/**
 * Tests de la repetition de restauration Cipher.
 *
 * Ce qui est teste : la fonction qui DECIDE si un rechargement est fidele.
 * Le reste (creer un schema, inserer, deposer) est de l'entree-sortie.
 *
 * Le scenario directeur reste celui de la degenerescence : la verification
 * Esoptron s'etait declaree conforme en comparant deux chaines vides. On
 * verifie ici qu'aucun chemin ne permet a compareRestored() de conclure
 * "fidele" sans avoir reellement compare des valeurs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { compareRestored, rowsFingerprint } from './restore-cipher-db.mjs';

test('un rechargement identique ne produit aucune divergence', () => {
  const rows = [{ id: 1, nom: 'alice' }, { id: 2, nom: 'bob' }];
  assert.deepEqual(compareRestored({ users: rows }, { users: [...rows] }), []);
});

test('une ligne perdue au rechargement est detectee', () => {
  const [d] = compareRestored({ users: [{ id: 1 }] }, { users: [{ id: 1 }, { id: 2 }] });
  assert.equal(d.table, 'users');
  assert.equal(d.reason, 'comptage');
  assert.equal(d.restored, 1);
  assert.equal(d.live, 2);
});

test('un comptage egal mais un contenu different est detecte', () => {
  // Le cas le plus insidieux : la restauration a le bon nombre de lignes et
  // des valeurs fausses. Un controle par count(*) seul le laisserait passer.
  const divergences = compareRestored(
    { users: [{ id: 1, nom: 'alice' }] },
    { users: [{ id: 1, nom: 'mallory' }] },
  );
  assert.equal(divergences.length, 1);
  assert.equal(divergences[0].reason, 'contenu');
});

test('une table absente du rechargement est detectee', () => {
  const [d] = compareRestored({}, { messages: [{ id: 1 }] });
  assert.equal(d.table, 'messages');
  assert.equal(d.reason, 'absente du rechargement');
});

test('une table apparue au rechargement est detectee', () => {
  const [d] = compareRestored({ fantome: [{ id: 1 }] }, {});
  assert.equal(d.reason, 'absente de la base');
});

test('deux tables vides concordent sans faux positif', () => {
  // La contrepartie du test de degenerescence : le vide legitime doit passer.
  assert.deepEqual(compareRestored({ sessions: [] }, { sessions: [] }), []);
});

test('l empreinte ignore l ordre des lignes', () => {
  // Ni le rechargement ni la lecture de la base ne garantissent un ordre :
  // sans normalisation, toute table de plus d'une ligne divergerait au hasard.
  const a = [{ id: 1 }, { id: 2 }];
  const b = [{ id: 2 }, { id: 1 }];
  assert.equal(rowsFingerprint(a), rowsFingerprint(b));
  assert.deepEqual(compareRestored({ t: a }, { t: b }), []);
});

test('l empreinte ignore l ordre des colonnes', () => {
  const a = [{ id: 1, nom: 'x' }];
  const b = [{ nom: 'x', id: 1 }];
  assert.equal(rowsFingerprint(a), rowsFingerprint(b));
});

test('l empreinte distingue null et chaine vide', () => {
  // Postgres les distingue ; une restauration qui transforme l'un en l'autre
  // n'est pas fidele, meme si l'affichage se ressemble.
  assert.notEqual(rowsFingerprint([{ v: null }]), rowsFingerprint([{ v: '' }]));
});

test('l empreinte du vide n est pas celle d une ligne', () => {
  // Le piege Esoptron, en une assertion : si les deux cotes echouaient a lire,
  // ils rendraient la meme empreinte. Ici la comparaison se fait sur des
  // tableaux reels, jamais sur le produit d'une lecture ratee.
  assert.notEqual(rowsFingerprint([]), rowsFingerprint([{ id: 1 }]));
});

test('plusieurs tables divergentes sont toutes rapportees', () => {
  const divergences = compareRestored(
    { a: [{ id: 1 }], b: [{ id: 1 }] },
    { a: [], b: [{ id: 2 }] },
  );
  assert.equal(divergences.length, 2);
});
