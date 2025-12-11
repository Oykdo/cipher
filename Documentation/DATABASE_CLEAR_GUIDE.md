# 🗑️ Guide de nettoyage de la base de données

## Résumé

Un script a été créé pour effacer tous les utilisateurs et données de la base de données.

## Utilisation rapide

```bash
cd apps/bridge
npm run db:clear
```

## Ce qui est supprimé

Le script supprime dans l'ordre :
1. ✅ **Messages** (2 supprimés)
2. ✅ **Conversations** (1 supprimée)
3. ✅ **Refresh tokens** (16 supprimés)
4. ✅ **Audit logs** (23 supprimés)
5. ✅ **Users** (3 supprimés)

Puis exécute `VACUUM` pour récupérer l'espace disque.

## Script créé

**Fichier** : `apps/bridge/scripts/clear-database.cjs`

### Fonctionnalités

- ✅ Désactive temporairement les contraintes de clés étrangères
- ✅ Supprime les données dans le bon ordre
- ✅ Affiche le nombre d'éléments supprimés
- ✅ Réactive les contraintes après suppression
- ✅ Exécute VACUUM pour optimiser la base
- ✅ Gestion d'erreurs complète

### Code

```javascript
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/dead-drop.db');

const db = new Database(DB_PATH);

// Disable foreign keys temporarily
db.exec('PRAGMA foreign_keys = OFF');

// Start transaction
db.exec('BEGIN TRANSACTION');

// Delete all data in correct order
db.prepare('DELETE FROM messages').run();
db.prepare('DELETE FROM conversations').run();
db.prepare('DELETE FROM refresh_tokens').run();
db.prepare('DELETE FROM audit_logs').run();
db.prepare('DELETE FROM users').run();

// Commit transaction
db.exec('COMMIT');

// Re-enable foreign keys
db.exec('PRAGMA foreign_keys = ON');

// Vacuum to reclaim space
db.exec('VACUUM');

db.close();
```

## Commandes disponibles

### Nettoyer la base de données

```bash
npm run db:clear
```

### Vérifier le chiffrement

```bash
npm run db:check-encryption
```

### Migrer vers chiffrement

```bash
npm run migrate:encrypt
```

## Résultat de l'exécution

```
🗑️  Clearing database...
Database: C:\...\apps\bridge\data\dead-drop.db
Deleting messages...
  ✓ 2 messages deleted
Deleting conversations...
  ✓ 1 conversations deleted
Deleting refresh tokens...
  ✓ 16 tokens deleted
Deleting audit logs...
  ✓ 23 logs deleted
Deleting users...
  ✓ 3 users deleted
Vacuuming database...

✅ Database cleared successfully!

You can now create new users.
```

## Quand utiliser ce script

### Développement
- ✅ Tester le signup avec des données propres
- ✅ Réinitialiser après des tests
- ✅ Nettoyer les données de test

### Staging
- ⚠️ Utiliser avec précaution
- ⚠️ Sauvegarder avant d'exécuter

### Production
- ❌ **NE JAMAIS UTILISER EN PRODUCTION**
- ❌ Supprime toutes les données définitivement

## Sauvegarder avant de nettoyer

```bash
# Créer une sauvegarde
cp apps/bridge/data/dead-drop.db apps/bridge/data/backup-$(date +%Y%m%d-%H%M%S).db

# Nettoyer
npm run db:clear

# Restaurer si nécessaire
cp apps/bridge/data/backup-YYYYMMDD-HHMMSS.db apps/bridge/data/dead-drop.db
```

## Alternative : Supprimer et recréer

```bash
# Supprimer la base de données
rm apps/bridge/data/dead-drop.db

# Redémarrer le serveur (recrée automatiquement)
npm run dev
```

## Nettoyer aussi le frontend

```javascript
// Dans la console du navigateur
localStorage.clear();
sessionStorage.clear();
indexedDB.deleteDatabase('CipherPulseSecure');
```

## Script package.json

```json
{
  "scripts": {
    "db:clear": "node scripts/clear-database.cjs"
  }
}
```

## Sécurité

### Protection en production

Pour éviter les accidents en production, ajoutez une vérification :

```javascript
// Au début du script
if (process.env.NODE_ENV === 'production') {
  console.error('❌ Cannot clear database in production!');
  process.exit(1);
}
```

### Confirmation interactive

```javascript
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('⚠️  This will delete ALL data. Continue? (yes/no): ', (answer) => {
  if (answer.toLowerCase() !== 'yes') {
    console.log('Cancelled.');
    process.exit(0);
  }
  
  // Proceed with deletion...
  rl.close();
});
```

## Troubleshooting

### Erreur : Database file not found

```bash
# Vérifier le chemin
ls apps/bridge/data/*.db

# Mettre à jour le chemin dans le script si nécessaire
```

### Erreur : FOREIGN KEY constraint failed

Le script désactive maintenant les contraintes automatiquement.

### Erreur : Database is locked

```bash
# Arrêter le serveur
# Puis réessayer
npm run db:clear
```

---

**Date** : 15 novembre 2025
**Statut** : ✅ Fonctionnel
**Usage** : Développement uniquement
