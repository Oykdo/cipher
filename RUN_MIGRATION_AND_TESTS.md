# 🚀 Guide d'Exécution - Migration & Tests e2ee-v2

Ce guide vous explique comment exécuter la migration SQL et les tests e2ee-v2 en **une seule commande**.

---

## Option 1 : Script Automatique (Recommandé) ✅

### Windows (PowerShell)

```powershell
# À la racine du projet
.\run-e2ee-v2-setup.ps1
```

### Linux / Mac (Bash)

```bash
# À la racine du projet
chmod +x run-e2ee-v2-setup.sh
./run-e2ee-v2-setup.sh
```

**Ce script fait tout automatiquement** :
1. ✅ Exécute la migration SQL (ajout des colonnes `public_key`, `sign_public_key`)
2. ✅ Lance les tests e2ee-v2 (~130 tests)
3. ✅ Génère un rapport (`E2EE_V2_SETUP_REPORT.md`)

---

## Option 2 : Étape par Étape (Manuel)

### Étape 1 : Migration SQL

```bash
# Aller dans le dossier backend
cd apps/bridge

# Exécuter la migration
node scripts/run-migration.js

# Vérifier les changements
# (optionnel - via psql)
psql -U postgres -d cipher_pulse -c "\d users"
```

**Résultat attendu** :
```
✅ Database connection successful
📄 Executing migration: 001_add_public_keys.sql
✅ Migration completed successfully!

📊 Verification - New columns added:
  - public_key: text (nullable: YES)
  - sign_public_key: text (nullable: YES)
  - updated_at: timestamp without time zone (nullable: YES)

🔍 Indexes created:
  - idx_users_public_key
  - idx_users_sign_public_key
  - update_users_updated_at

🎉 Migration successful! Database is ready for e2ee-v2.
```

### Étape 2 : Tests

```bash
# Aller dans le dossier frontend
cd apps/frontend

# Installer les dépendances (si nécessaire)
npm install

# Exécuter les tests e2ee-v2
npm run test:e2ee-v2
```

**Résultat attendu** :
```
✓ apps/frontend/src/lib/e2ee/__tests__/keyManager.test.ts (50 tests)
✓ apps/frontend/src/lib/e2ee/__tests__/publicKeyService.test.ts (30 tests)
✓ apps/frontend/src/lib/e2ee/__tests__/selfEncryptingMessage.test.ts (40 tests)
✓ apps/frontend/src/lib/e2ee/__tests__/e2ee-v2-integration.test.ts (10 tests)

Test Files  4 passed (4)
     Tests  130 passed (130)
  Duration  X.XXs
```

---

## Prérequis

### 1. PostgreSQL en cours d'exécution

```bash
# Vérifier que PostgreSQL est actif
pg_isready

# Ou via Docker
docker ps | grep postgres
```

### 2. Variable d'environnement DATABASE_URL

**Fichier** : `apps/bridge/.env`

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/cipher_pulse
```

Remplacez par vos propres identifiants.

### 3. Node.js et npm installés

```bash
node --version   # v18+ recommandé
npm --version
```

---

## Dépannage

### ❌ Erreur : "ECONNREFUSED"

**Cause** : PostgreSQL n'est pas démarré

**Solution** :
```bash
# Windows
net start postgresql-x64-14

# Linux
sudo systemctl start postgresql

# Docker
docker start postgres-container
```

### ❌ Erreur : "relation 'users' does not exist"

**Cause** : La table `users` n'existe pas encore

**Solution** : Exécutez d'abord le schéma initial de la base de données
```bash
cd apps/bridge
psql -U postgres -d cipher_pulse -f scripts/schema_postgresql.sql
```

### ❌ Erreur : "column already exists"

**Cause** : La migration a déjà été exécutée

**Solution** : C'est normal ! Le script utilise `IF NOT EXISTS`, vous pouvez l'ignorer.

### ❌ Tests échouent : "Cannot find module"

**Cause** : Dépendances manquantes

**Solution** :
```bash
cd apps/frontend
rm -rf node_modules package-lock.json
npm install
npm run test:e2ee-v2
```

### ❌ Tests échouent : "API mock error"

**Cause** : Les mocks de `api-v2.ts` ne sont pas configurés

**Solution** : C'est normal si vous n'avez pas encore démarré le serveur backend. Les tests unitaires utilisent des mocks et devraient fonctionner sans serveur.

---

## Vérification Post-Migration

### Base de Données

```sql
-- Vérifier les nouvelles colonnes
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN ('public_key', 'sign_public_key', 'updated_at');

-- Vérifier les index
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'users' 
AND indexname LIKE '%public_key%';

-- Compter les utilisateurs
SELECT COUNT(*) FROM users;
```

### Frontend Tests

```bash
# Tests avec UI interactive
cd apps/frontend
npm run test:ui

# Tests avec couverture de code
npm run test:coverage
```

---

## Après Succès

Une fois la migration et les tests validés, vous êtes **prêt pour Phase 3** ! 🎉

### Prochaines étapes :

1. ✅ Migration SQL terminée
2. ✅ Tests e2ee-v2 validés
3. ➡️ **NEXT** : Intégration dans le workflow de messagerie

**Dites à l'assistant** : "Continue avec Phase 3" ou "Implémente Phase 3"

---

## Résumé des Commandes

```bash
# Option automatique (recommandé)
.\run-e2ee-v2-setup.ps1              # Windows
./run-e2ee-v2-setup.sh               # Linux/Mac

# Option manuelle
cd apps/bridge && node scripts/run-migration.js
cd ../frontend && npm run test:e2ee-v2

# Vérification
psql -U postgres -d cipher_pulse -c "\d users"
```

---

**Bon courage ! 🚀**
