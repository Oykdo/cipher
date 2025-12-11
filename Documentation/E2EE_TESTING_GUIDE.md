# E2EE Testing Guide

## 🎯 Objectif

Ce guide vous permet de tester l'intégration E2EE complète dans Project Chimera.

## 📋 Prérequis

1. ✅ Backend lancé (`cd apps/bridge && npm run dev`)
2. ✅ Frontend lancé (`cd apps/frontend && npm run dev`)
3. ✅ Base de données initialisée
4. ✅ Deux navigateurs ou fenêtres en navigation privée

## 🧪 Scénario de test complet

### Étape 1 : Préparation

#### 1.1 Créer le compte Alice

1. Ouvrir le navigateur 1 (ou fenêtre privée 1)
2. Aller sur `http://localhost:5173`
3. Créer un compte :
   - Username : `alice`
   - Security Tier : Standard
   - Générer une phrase mnémonique
   - **IMPORTANT** : Noter la phrase mnémonique
4. Définir un mot de passe pour QuickUnlock
5. Se connecter

#### 1.2 Créer le compte Bob

1. Ouvrir le navigateur 2 (ou fenêtre privée 2)
2. Aller sur `http://localhost:5173`
3. Créer un compte :
   - Username : `bob`
   - Security Tier : Standard
   - Générer une phrase mnémonique
   - **IMPORTANT** : Noter la phrase mnémonique
4. Définir un mot de passe pour QuickUnlock
5. Se connecter

### Étape 2 : Vérifier l'initialisation E2EE

#### 2.1 Vérifier les clés d'Alice

1. Dans le navigateur d'Alice, ouvrir la console (F12)
2. Taper :
   ```javascript
   import { getMyFingerprint } from './src/lib/e2ee/e2eeService';
   getMyFingerprint();
   ```
3. **Résultat attendu** : Une empreinte (fingerprint) s'affiche

#### 2.2 Vérifier les clés de Bob

1. Dans le navigateur de Bob, ouvrir la console (F12)
2. Taper la même commande
3. **Résultat attendu** : Une empreinte différente s'affiche

### Étape 3 : Créer une conversation

#### 3.1 Alice crée une conversation avec Bob

1. Dans le navigateur d'Alice, cliquer sur "New Conversation"
2. Chercher "bob"
3. Sélectionner Bob
4. **Vérifier dans la console** :
   ```
   🔑 [E2EE] Exchanging keys with bob...
   ✅ [E2EE] Published my key bundle
   ✅ [E2EE] Keys exchanged with bob
   ```

#### 3.2 Vérifier le statut de chiffrement

1. Dans la conversation avec Bob
2. **Vérifier** que le badge affiche "🔓 Legacy" (jaune)
   - C'est normal : les clés sont échangées mais pas encore vérifiées

### Étape 4 : Envoyer des messages

#### 4.1 Alice envoie un message à Bob

1. Dans le navigateur d'Alice
2. Taper un message : "Hello Bob! This is E2EE test"
3. Envoyer
4. **Vérifier dans la console** :
   ```
   🔒 [E2EE] Encrypted message #1 for bob
   ```

#### 4.2 Bob reçoit le message

1. Dans le navigateur de Bob
2. Rafraîchir ou attendre la notification
3. Ouvrir la conversation avec Alice
4. **Vérifier** que le message s'affiche : "Hello Bob! This is E2EE test"
5. **Vérifier dans la console** :
   ```
   🔓 [E2EE] Decrypted message from alice
   ```

#### 4.3 Bob répond

1. Bob tape : "Hi Alice! E2EE works!"
2. Envoyer
3. Alice devrait recevoir le message

### Étape 5 : Vérifier les clés

#### 5.1 Alice vérifie la clé de Bob

1. Dans la conversation avec Bob
2. Cliquer sur le bouton "🔑 Verify"
3. **Vérifier** que le modal s'ouvre
4. **Vérifier** que deux empreintes s'affichent :
   - Empreinte d'Alice (en haut)
   - Empreinte de Bob (en bas)
5. **Vérifier** que les QR codes s'affichent

#### 5.2 Comparer les empreintes

**Option 1 : Comparaison manuelle**

1. Alice lit son empreinte à Bob (par téléphone, vidéo, etc.)
2. Bob vérifie que c'est la même dans son navigateur
3. Bob lit son empreinte à Alice
4. Alice vérifie que c'est la même

**Option 2 : QR Code**

1. Alice scanne le QR code de Bob avec son téléphone
2. Vérifie que l'empreinte correspond

#### 5.3 Confirmer la vérification

1. Cliquer sur "Proceed to Manual Verification"
2. Copier l'empreinte de Bob depuis son navigateur
3. Coller dans le champ de texte
4. Cliquer sur "Verify Match"
5. **Vérifier** : Message "✅ Fingerprints match!"
6. Cliquer sur "Confirm Verification"
7. **Vérifier** : Message "✅ Key verified for bob"

#### 5.4 Vérifier le changement de statut

1. Fermer le modal
2. **Vérifier** que le badge affiche maintenant "🔒 E2EE" (vert)
3. **Vérifier** dans la console :
   ```
   ✅ [E2EE] Marked peer key as verified: bob
   ```

### Étape 6 : Tester le chiffrement E2EE

#### 6.1 Envoyer un message après vérification

1. Alice envoie : "This message is E2EE encrypted!"
2. **Vérifier** que le badge est toujours "🔒 E2EE" (vert)
3. Bob reçoit le message

#### 6.2 Vérifier dans la base de données

1. Ouvrir la base de données SQLite
2. Requête :
   ```sql
   SELECT body FROM messages ORDER BY created_at DESC LIMIT 1;
   ```
3. **Vérifier** que le body est chiffré (format JSON avec `version: "e2ee-v1"`)

### Étape 7 : Tester le fallback legacy

#### 7.1 Créer un nouveau compte sans E2EE

1. Ouvrir un troisième navigateur
2. Créer un compte `charlie`
3. Ne PAS échanger de clés avec Alice

#### 7.2 Alice envoie un message à Charlie

1. Alice crée une conversation avec Charlie
2. Envoie un message
3. **Vérifier** que le badge affiche "🔓 Legacy" (jaune)
4. **Vérifier** dans la console :
   ```
   ⚠️ [E2EE] No public key for charlie, using legacy encryption
   ```

## ✅ Critères de réussite

### Backend

- [ ] Routes E2EE enregistrées sans erreur
- [ ] Table `e2ee_key_bundles` créée
- [ ] Endpoint `/api/v2/e2ee/publish-keys` fonctionne
- [ ] Endpoint `/api/v2/e2ee/keys/:username` fonctionne

### Frontend - Initialisation

- [ ] E2EE s'initialise automatiquement au login
- [ ] Empreinte (fingerprint) générée pour chaque utilisateur
- [ ] Key bundle créé et stocké dans KeyVault

### Frontend - Échange de clés

- [ ] Clés échangées lors de la création d'une conversation
- [ ] Key bundle publié sur le serveur
- [ ] Key bundle du peer récupéré du serveur
- [ ] Clé publique du peer stockée localement

### Frontend - Chiffrement

- [ ] Messages chiffrés avec E2EE quand les clés sont disponibles
- [ ] Messages chiffrés avec legacy quand les clés ne sont pas disponibles
- [ ] Format E2EE détecté (`version: "e2ee-v1"`)
- [ ] Fallback vers legacy fonctionne

### Frontend - Déchiffrement

- [ ] Messages E2EE déchiffrés correctement
- [ ] Messages legacy déchiffrés correctement
- [ ] Détection automatique du format
- [ ] Gestion des erreurs de déchiffrement

### Frontend - UI

- [ ] Badge de statut affiché dans ChatHeader
- [ ] Badge affiche "🔒 E2EE" (vert) quand vérifié
- [ ] Badge affiche "🔓 Legacy" (jaune) quand non vérifié
- [ ] Bouton "🔑 Verify" visible et fonctionnel
- [ ] Modal de vérification s'ouvre correctement
- [ ] Empreintes affichées correctement
- [ ] QR codes générés correctement
- [ ] Vérification fonctionne
- [ ] Statut mis à jour après vérification

## 🐛 Problèmes courants

### Problème 1 : E2EE not initialized

**Symptôme** : Message "E2EE not initialized" dans la console

**Solution** :
1. Vérifier que l'utilisateur est connecté
2. Vérifier que `initializeE2EE()` est appelé dans `authSecure.ts`
3. Vérifier que libsodium est chargé

### Problème 2 : No public key found

**Symptôme** : Message "No public key found for peer"

**Solution** :
1. Vérifier que les clés ont été échangées
2. Vérifier que le key bundle est publié sur le serveur
3. Vérifier que le key bundle du peer est récupéré

### Problème 3 : Decryption failed

**Symptôme** : Message "[Decryption failed]" affiché

**Solution** :
1. Vérifier que les clés sont correctes
2. Vérifier que le format du message est correct
3. Vérifier les logs de la console pour plus de détails

## 📊 Logs attendus

### Lors de la connexion

```
🔐 [E2EE Service] Initializing for user: alice
🔑 [E2EE] Generating user identity keys...
✅ [E2EE] Identity key pair generated
✅ [E2EE] Signing key pair generated
✅ [E2EE] Signed prekey generated
✅ [E2EE] Generated 100 one-time prekeys
✅ [E2EE] Identity keys stored for user: alice
✅ [E2EE Service] Initialized for alice
🔑 [E2EE Service] Fingerprint: A1B2 C3D4 E5F6 ...
```

### Lors de l'échange de clés

```
🔑 [E2EE] Exchanging keys with bob...
✅ [E2EE] Published my key bundle
✅ [E2EE] Keys exchanged with bob
```

### Lors de l'envoi d'un message

```
🔒 [E2EE] Encrypted message #1 for bob
```

### Lors de la réception d'un message

```
🔓 [E2EE] Decrypted message from alice
```

---

**Date de création** : 2025-01-18  
**Version** : 1.0.0

