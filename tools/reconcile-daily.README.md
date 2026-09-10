# Réconciliation quotidienne des registres

`reconcile-vaults.mjs` compare les quatre registres qui décrivent un vault.
`reconcile-daily.ps1` l'exécute tous les jours et **ne parle que si quelque
chose cloche** — une surveillance bavarde cesse d'être lue.

## Pourquoi depuis le poste de travail, et non depuis un serveur

Seul le poste détient légitimement le DSN de la base Cipher **et** le secret
partagé d'Eidolon. Déposer l'un sur l'hôte de l'autre pour pouvoir les
comparer reviendrait à mélanger les secrets de deux systèmes indépendants —
un prix disproportionné pour une comparaison.

## Installation

```powershell
schtasks /Create `
  /TN "Cipher - reconciliation des registres" `
  /TR "powershell.exe -ExecutionPolicy Bypass -NonInteractive -WindowStyle Hidden -File `"C:\Logos\cipher\tools\reconcile-daily.ps1`"" `
  /SC DAILY /ST 09:00 /RL LIMITED /F
```

Aucun droit administrateur : la tâche s'exécute sous ton compte, qui est
justement celui qui a accès aux deux secrets.

## Lecture des résultats

| Où | Quoi |
|---|---|
| `%LOCALAPPDATA%\cipher-reconcile\reconcile.log` | une ligne par exécution, 60 dernières |
| `%LOCALAPPDATA%\cipher-reconcile\DERIVE-DETECTEE.txt` | détails **uniquement** en cas de dérive |
| Planificateur de tâches → « Dernier résultat » | `0` sain, `1` dérive, `2` exécution impossible |

Le fichier d'alerte est **supprimé** dès qu'une exécution redevient saine :
un fichier périmé qui traîne finit par faire croire à un problème en cours.

## Mode strict

La tâche passe `--strict` : un avertissement de vivacité compte comme une
dérive. Un lien mort n'est pas moins grave qu'une incohérence de registre —
il est seulement plus discret, ce qui le rend pire.

## À la main

```powershell
cd C:\Logos\cipher
node tools/reconcile-vaults.mjs --fix      # rapport lisible + réparations suggérées
node tools/reconcile-vaults.mjs --json     # pour un autre outil
node --test tools/reconcile-vaults.test.mjs
```

`--fix` **imprime** les commandes, ne les exécute jamais : les objets en jeu
(numéros de fondateur, reliques uniques, registres de production) sont pour
la plupart irréversibles.

## Désinstallation

```powershell
schtasks /Delete /TN "Cipher - reconciliation des registres" /F
```
