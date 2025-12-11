# 🔐 Dead Drop - Guide d'installation pour testeurs

Bienvenue ! Merci de tester Dead Drop, le messenger sécurisé avec chiffrement de bout en bout.

---

## 📋 Prérequis

Avant de commencer, assurez-vous d'avoir installé :

- **Node.js v18 ou supérieur** → [Télécharger ici](https://nodejs.org/)
  - Pour vérifier votre version : ouvrez un terminal et tapez `node --version`

---

## 🚀 Installation rapide

### 1. Extraire les fichiers
Décompressez le fichier ZIP dans un dossier de votre choix (par exemple : `C:\dead-drop-test`)

### 2. Installer les dépendances

Ouvrez un terminal (PowerShell ou CMD) dans le dossier extrait et exécutez :

```bash
npm install
```

⏳ Cette étape peut prendre 2-5 minutes selon votre connexion internet.

### 3. Lancer l'application

Dans le même terminal, exécutez :

```bash
npm run dev
```

✅ L'application démarre sur deux services :
- **Backend** : http://localhost:3000
- **Frontend** : http://localhost:5173

### 4. Ouvrir dans votre navigateur

Ouvrez automatiquement ou manuellement : **http://localhost:5173**

---

## 🎯 Comment tester

### Premier lancement - Créer un compte

1. Cliquez sur **"Créer un compte"**
2. Choisissez votre méthode de sécurité :
   - **Standard** : Phrase mnémonique BIP-39 (12 ou 24 mots)
   - **DiceKey** : Clé physique Dice-Key (6 mots)
3. **IMPORTANT** : Notez précieusement votre phrase de récupération sur papier !
4. Choisissez un nom d'utilisateur
5. Confirmez votre phrase de récupération

### Connexion

1. Cliquez sur **"Se connecter"**
2. Entrez votre nom d'utilisateur
3. Saisissez votre phrase de récupération (les mots notés précédemment)

### Fonctionnalités à tester

#### 💬 Messagerie de base
- Envoyer des messages texte
- Créer plusieurs conversations
- Rechercher des utilisateurs

#### ⏰ Time-Lock (Messages temporisés)
1. Dans la composition du message, cliquez sur l'icône horloge ⏰
2. Choisissez une durée (5min, 30min, 1h, etc.) ou date personnalisée
3. Envoyez le message
4. ✅ Le message sera verrouillé et débloqué automatiquement à l'heure choisie

#### 🔥 Burn After Reading (Auto-destruction)
1. Dans la composition du message, cliquez sur l'icône flamme 🔥
2. Choisissez une durée avant destruction (5s, 30s, 1min, etc.)
3. Envoyez le message
4. ✅ Le message s'autodétruira après lecture au temps défini

#### 🔒 Vérifier le chiffrement
- Tous les messages sont automatiquement chiffrés (AES-GCM-256)
- Le serveur ne peut jamais lire vos messages
- L'icône de cadenas 🔒 confirme le chiffrement actif

---

## 🛑 Comment arrêter l'application

Dans le terminal où l'application tourne, appuyez sur :
- **Windows** : `Ctrl + C`
- **Mac/Linux** : `Ctrl + C`

---

## 🐛 Problèmes courants

### L'application ne démarre pas
1. Vérifiez que Node.js v18+ est installé : `node --version`
2. Réinstallez les dépendances : `npm install`
3. Vérifiez que les ports 3000 et 5173 sont libres

### "Port already in use" (port déjà utilisé)
Fermez toutes les autres applications utilisant les ports 3000 ou 5173, puis relancez.

### La page ne charge pas
1. Vérifiez que le backend tourne (vous devriez voir des logs dans le terminal)
2. Actualisez la page avec `Ctrl + R` ou `F5`
3. Essayez en navigation privée

### Impossible de se connecter
1. Vérifiez que vous avez bien noté votre phrase de récupération
2. Les mots doivent être dans le bon ordre et correctement orthographiés
3. Pour DiceKey : vérifiez que vous avez bien 6 mots

---

## 📝 Ce qu'il faut tester et noter

### Général
- [ ] L'installation s'est déroulée sans erreurs
- [ ] L'interface se charge correctement
- [ ] La navigation entre les pages fonctionne

### Inscription/Connexion
- [ ] Création de compte (Standard)
- [ ] Création de compte (DiceKey)
- [ ] Connexion avec phrase de récupération
- [ ] Message d'erreur si mauvais identifiants

### Messagerie
- [ ] Envoyer un message simple
- [ ] Recevoir un message
- [ ] Créer plusieurs conversations
- [ ] Messages affichés dans le bon ordre
- [ ] Indicateur de frappe ("est en train d'écrire...")

### Time-Lock
- [ ] Créer un message Time-Lock (5 minutes)
- [ ] Le message apparaît verrouillé
- [ ] Le message se déverrouille automatiquement après le délai
- [ ] Impossible de lire le message avant l'heure

### Burn After Reading
- [ ] Créer un message auto-destructible (30 secondes)
- [ ] Lire le message
- [ ] Le message disparaît après le délai
- [ ] Timer visible avant destruction

### Performance
- [ ] L'application réagit rapidement
- [ ] Pas de lag lors de l'envoi de messages
- [ ] Le chargement des conversations est fluide

---

## 🔍 Rapporter un bug

Si vous rencontrez un problème, veuillez noter :

1. **Description du problème** : Qu'est-ce qui ne fonctionne pas ?
2. **Étapes pour reproduire** : Comment avez-vous obtenu l'erreur ?
3. **Message d'erreur** : Copiez les messages affichés dans le terminal ou le navigateur
4. **Environnement** :
   - Système d'exploitation (Windows 10/11, macOS, Linux)
   - Version de Node.js (`node --version`)
   - Navigateur utilisé (Chrome, Firefox, Edge, Safari)

### Où envoyer vos retours
- **Email** : [VOTRE_EMAIL]
- **Messages dans le terminal** : Envoyez une capture d'écran des logs
- **Console du navigateur** : Appuyez sur `F12` → onglet "Console" → copiez les erreurs

---

## 🔐 Sécurité et confidentialité

### Ce que nous collectons
- **Uniquement local** : Vos messages et clés sont stockés localement
- **Serveur aveugle** : Le serveur ne peut pas déchiffrer vos messages
- **Pas de tracking** : Aucune donnée analytique n'est collectée en phase de test

### Précautions
- **Sauvegardez votre phrase de récupération** : Si vous la perdez, vos messages seront irrécupérables
- **Ne partagez jamais votre phrase** : Comme un mot de passe, gardez-la secrète
- **Version de test** : Ceci est une version alpha, ne l'utilisez pas pour des données critiques

---

## ✅ Version de test

- **Version** : 0.0.1-alpha
- **Date** : 2025-11-09
- **Statut** : Alpha (test privé)

---

## 🙏 Merci !

Merci infiniment de prendre le temps de tester Dead Drop. Vos retours sont essentiels pour améliorer l'application avant la sortie publique.

**Bon test ! 🚀**

---

## 📞 Support

En cas de besoin urgent, contactez-nous :
- **Email support** : [VOTRE_EMAIL]
- **Disponibilité** : Lundi-Vendredi, 9h-18h

---

**Dead Drop** - *Your messages, your keys, zero trust.* 🔐
