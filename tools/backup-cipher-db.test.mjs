/**
 * Tests de la sauvegarde de la base Cipher.
 *
 * Ils portent sur les deux fonctions qui DECIDENT si une sauvegarde est
 * fidele : la comparaison des comptages et l'empreinte de contenu. Le reste
 * est de l'entree-sortie.
 *
 * Le scenario qui compte est celui de la degenerescence : un controle qui ne
 * peut pas echouer n'est pas un controle. La verification de restauration
 * cote Esoptron s'etait declaree conforme en comparant du vide a du vide --
 * on teste ici que ce piege est ferme.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { compareCounts, contentFingerprint } from './backup-cipher-db.mjs';

const table = (rows) => ({ columns: Object.keys(rows[0] || {}), rows });

test('des comptages egaux ne produisent aucune divergence', () => {
  const dump = { users: table([{ id: 1 }, { id: 2 }]) };
  assert.deepEqual(compareCounts(dump, { users: 2 }), []);
});

test('une table tronquee est detectee', () => {
  const dump = { users: table([{ id: 1 }]) };
  const [d] = compareCounts(dump, { users: 2 });
  assert.equal(d.table, 'users');
  assert.equal(d.dump, 1);
  assert.equal(d.live, 2);
});

test('une table absente du fichier est detectee', () => {
  // Le cas dangereux : la sauvegarde a simplement oublie une table, et un
  // controle qui n'itere que sur le fichier ne verrait jamais rien.
  const divergences = compareCounts({}, { messages: 12 });
  assert.equal(divergences.length, 1);
  assert.equal(divergences[0].dump, null);
  assert.equal(divergences[0].live, 12);
});

test('une table apparue en trop est detectee', () => {
  const dump = { fantome: table([{ id: 1 }]) };
  const divergences = compareCounts(dump, {});
  assert.equal(divergences.length, 1);
  assert.equal(divergences[0].live, null);
});

test('deux bases vides concordent, sans faux positif', () => {
  assert.deepEqual(compareCounts({ users: table([]) }, { users: 0 }), []);
});

test('l empreinte ignore l ordre des lignes', () => {
  // Un SELECT sans ORDER BY ne garantit pas l'ordre : sans normalisation, la
  // deduplication ne mordrait jamais et la retention garderait trente fois le
  // meme etat en croyant garder trente etats.
  const a = { users: table([{ id: 1 }, { id: 2 }]) };
  const b = { users: table([{ id: 2 }, { id: 1 }]) };
  assert.equal(contentFingerprint(a), contentFingerprint(b));
});

test('l empreinte ignore l ordre des colonnes', () => {
  const a = { users: { columns: ['id', 'nom'], rows: [{ id: 1, nom: 'x' }] } };
  const b = { users: { columns: ['nom', 'id'], rows: [{ nom: 'x', id: 1 }] } };
  assert.equal(contentFingerprint(a), contentFingerprint(b));
});

test('l empreinte change des qu une valeur change', () => {
  const a = { users: table([{ id: 1, nom: 'alice' }]) };
  const b = { users: table([{ id: 1, nom: 'bob' }]) };
  assert.notEqual(contentFingerprint(a), contentFingerprint(b));
});

test('l empreinte change quand une ligne disparait', () => {
  const a = { users: table([{ id: 1 }, { id: 2 }]) };
  const b = { users: table([{ id: 1 }]) };
  assert.notEqual(contentFingerprint(a), contentFingerprint(b));
});

test('l empreinte distingue deux tables au contenu permute', () => {
  const a = { users: table([{ id: 1 }]), messages: table([{ id: 2 }]) };
  const b = { users: table([{ id: 2 }]), messages: table([{ id: 1 }]) };
  assert.notEqual(contentFingerprint(a), contentFingerprint(b));
});
