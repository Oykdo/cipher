# Login avec Avatar - Guide Complet

## 📋 Vue d'ensemble

Le système de login avec avatar permet aux utilisateurs DiceKey de se connecter en uploadant simplement leur fichier avatar `.blend` au lieu d'entrer leurs checksums.

## 🔄 Flux Automatique (Nouveaux Utilisateurs)

### 1. Création du Compte DiceKey

Quand un utilisateur crée un compte DiceKey, le processus suivant se déroule automatiquement:

1. **Frontend** (`LoginNew.tsx`):
   - Génère les checksums à partir du DiceKey
   - Appelle `/api/generate-dicekey-avatar` avec les 30 checksums
   - Reçoit le `avatarHash` et `avatarUrl`
   - Stocke le hash dans `pendingSignup` (sessionStorage)

2. **Backend** (`/api/generate-dicekey-avatar`):
   - Génère un fichier `.blend` basé sur les checksums
   - Calcule le hash SHA-256 du fichier
   - Retourne le hash et l'URL du fichier

3. **Page Welcome** (`Welcome.tsx`):
   - Après vérification des checksums
   - Envoie le `avatarHash` dans la requête de signup

4. **Backend** (`/api/v2/auth/signup`):
   - Crée l'utilisateur
   - **Stocke automatiquement le `avatarHash`** dans la colonne `users.avatar_hash`
   - L'utilisateur peut maintenant se connecter avec son fichier avatar!

### 2. Login avec Avatar

1. **Frontend** (`LoginNew.tsx`):
   - L'utilisateur sélectionne son fichier `.blend`
   - Upload vers `/api/v2/auth/login-with-avatar`

2. **Backend** (`/api/v2/auth/login-with-avatar`):
   - Calcule le hash SHA-256 du fichier uploadé
   - Cherche un utilisateur avec ce hash dans `users.avatar_hash`
   - Si trouvé: génère les tokens et connecte l'utilisateur
   - Si non trouvé: retourne une erreur 401

## 🛠️ Modifications Apportées

### Backend

1. **Migration de la base de données** (`add_avatar_hash_column.sql`):
   ```sql
   ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_hash VARCHAR(64);
   CREATE INDEX IF NOT EXISTS idx_users_avatar_hash ON users(avatar_hash);
   ```

2. **Interface SignupBody** (`auth.ts`):
   ```typescript
   interface SignupBody {
     // ... autres champs
     avatarHash?: string; // Hash SHA-256 du fichier avatar .blend
   }
   ```

3. **Logique de signup DiceKey** (`auth.ts`):
   ```typescript
   // Store avatar hash if provided (for avatar login)
   if (body.avatarHash) {
     await db.updateUserAvatarHash(user.id, body.avatarHash);
   }
   ```

4. **Endpoint de login** (`auth.ts`):
   - Logs détaillés pour le débogage
   - Calcul du hash du fichier uploadé
   - Recherche de l'utilisateur par hash
   - Génération des tokens d'authentification

### Frontend

Le frontend envoie déjà le `avatarHash` lors du signup (ligne 129 de `Welcome.tsx`).

## 📝 Scripts Utilitaires

### Pour les utilisateurs existants

Si vous avez des utilisateurs créés avant cette mise à jour, utilisez:

```bash
# Générer un avatar pour un utilisateur existant
node apps/bridge/scripts/generate_user_avatar.js <username>

# Lister tous les utilisateurs
node apps/bridge/scripts/list_users.js

# Trouver les fichiers avatar correspondants
node apps/bridge/scripts/find_avatar_files.js

# Vérifier un fichier avatar spécifique
node apps/bridge/scripts/check_avatar_file.js <path/to/file.blend>
```

## ✅ Vérification

Pour vérifier que tout fonctionne:

1. **Créer un nouveau compte DiceKey**
2. **Télécharger le fichier avatar** depuis l'URL fournie
3. **Se déconnecter**
4. **Utiliser "Login with Avatar"** et uploader le fichier
5. **Vous devriez être connecté automatiquement!**

## 🔍 Débogage

Les logs du serveur affichent maintenant:
- Le hash calculé du fichier uploadé
- Le hash prefix pour comparaison rapide
- Si un utilisateur correspondant est trouvé
- Le succès ou l'échec du login

Exemple de logs:
```
Avatar file received for login
  filename: "avatar.blend"
  fileSize: 34
  calculatedHash: "ed38167ce378c..."
  hashPrefix: "ed38167ce378c..."

Avatar login successful
  userId: "61a52b414eb8"
  username: "test22"
```

## 🚨 Points Importants

1. **Le hash est calculé côté frontend** lors de la génération de l'avatar
2. **Le hash est stocké automatiquement** lors du signup
3. **Pas besoin d'action manuelle** pour les nouveaux utilisateurs
4. **Pour les anciens utilisateurs**, utilisez le script `generate_user_avatar.js`

## 🔐 Sécurité

- Le fichier avatar est unique par utilisateur (basé sur les checksums)
- Le hash SHA-256 garantit l'intégrité du fichier
- Aucune information sensible n'est stockée dans le fichier
- Le fichier agit comme une "clé physique" pour l'authentification
