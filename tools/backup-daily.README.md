# Sauvegarde quotidienne de la base Cipher

Trois fichiers, une seule promesse : **il existe chaque jour une copie de la
base, et on a la preuve qu'elle se recharge.**

| fichier | role |
|---|---|
| `backup-cipher-db.mjs` | exporte le contenu du schema `public` en JSON, avec rotation et deduplication |
| `restore-cipher-db.mjs` | recharge une copie et compare son contenu a la base |
| `backup-daily.ps1` | enchaine les deux, journalise, n'alerte qu'en cas d'echec |

## Ce que la sauvegarde couvre, et ce qu'elle ne couvre pas

Elle capture le **contenu** : colonnes et lignes de chaque table du schema
`public`. Elle ne capture **pas le schema lui-meme** -- index, contraintes,
sequences et types n'y sont pas. Restaurer suppose donc une base dont le
schema existe deja (une migration `migrate.mjs up` sur une base neuve suffit).

C'est une limite reelle, ecrite ici plutot que decouverte le jour ou elle
compte. Elle vient de l'absence de `pg_dump` sur le poste ; or c'est le poste
qui doit heberger la sauvegarde, puisque lui seul detient legitimement le DSN.

## La repetition de restauration

`restore-cipher-db.mjs` recharge la copie dans un schema **jetable**
(`restore_check`) de la base elle-meme, compare table par table, puis le
supprime. Trois consequences :

- les donnees ne quittent jamais la base dont elles viennent : pas de second
  hote, pas de second secret, pas de copie de messages ailleurs ;
- `CREATE TABLE ... (LIKE public.<table> INCLUDING ALL)` reproduit types,
  defauts et contraintes, ce que l'export JSON ne porte pas ;
- le schema `public` n'est jamais ecrit -- il n'est lu qu'en `SELECT`.

La comparaison porte sur le **contenu**, pas seulement sur le comptage : une
restauration peut avoir le bon nombre de lignes et de mauvaises valeurs.

Ecrire dans `public` reste possible pour une vraie restauration, mais exige
deux gestes distincts : `--into public --yes`.

## Installation de la tache planifiee

```powershell
schtasks /Create `
  /TN "Cipher - sauvegarde de la base" `
  /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Logos\cipher\tools\backup-daily.ps1" `
  /SC DAILY /ST 03:30 /RL LIMITED /F
```

03:30 local, apres la sauvegarde du registre Eidolon (00:15 UTC) et celle de
l'ancre Esoptron (00:30 UTC) : les trois etats sont ainsi pris a quelques
heures d'intervalle, ce qui limite ce qu'une reconstruction croisee aurait a
reconcilier.

Verifier : `schtasks /Query /TN "Cipher - sauvegarde de la base" /V /FO LIST`

## Ou regarder

- copies : `%LOCALAPPDATA%\cipher-db-backup\cipher-*.json` (30 conservees)
- journal : `%LOCALAPPDATA%\cipher-db-backup\backup.log` (60 lignes)
- alerte : `%LOCALAPPDATA%\cipher-db-backup\SAUVEGARDE-ECHOUEE.txt`

Le fichier d'alerte est **efface** des qu'une execution reussit : un fichier
perime ne doit pas faire croire a un probleme en cours.

## Restaurer pour de vrai

```powershell
cd C:\Logos\cipher
node apps/bridge/scripts/migrate.mjs up          # le schema d'abord
node tools/restore-cipher-db.mjs --into public --yes <copie.json>
```

## Tests

```powershell
node --test tools/backup-cipher-db.test.mjs      # 10
node --test tools/restore-cipher-db.test.mjs     # 11
```

Ils portent sur les fonctions qui *decident* si une copie est fidele. Le
scenario directeur est celui de la degenerescence : cote Esoptron, une
verification s'etait declaree conforme en comparant deux lectures vides. Un
controle qui ne peut pas echouer n'est pas un controle.
