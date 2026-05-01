# 🔐 Cipher

<div align="center">

![Version](https://img.shields.io/badge/version-1.2.6-blue.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)

**Messagerie sécurisée avec chiffrement de bout en bout, conversations de groupe (2-10 membres), pièces jointes chiffrées, et un contrat de confidentialité public et vérifiable.**

[Fonctionnalités](#-fonctionnalités) • [Installation](#-installation) • [Architecture](#-architecture) • [Sécurité](#-sécurité) • [Contribuer](#-contribuer)

[🇬🇧 English Version](./README.md)

</div>

---

## 📖 À propos

**Cipher** est une application de messagerie sécurisée bâtie autour d'un **contrat de confidentialité public** ([`CIPHER_PRIVACY_GUARANTEES.md`](./CIPHER_PRIVACY_GUARANTEES.md)) qui dit, ligne par ligne, ce que le serveur stocke et ce qu'il **ne stocke pas**. Chaque garantie est appliquée par du code et vérifiée par des tests d'invariants en CI. Les conversations 1:1 et de groupe (2-10 membres) sont chiffrées de bout en bout via X3DH + Double Ratchet (e2ee-v2). La destruction après lecture (burn-after-reading) et le verrouillage temporel cryptographique (drand/tlock) sont disponibles en option par message.

### 🎯 Philosophie

- **Architecture Zero-Trust** : Vos clés ne quittent jamais votre appareil
- **Chiffrement de bout en bout** : Seuls vous et votre destinataire pouvez lire les messages
- **Privacy by Design** : Aucune collecte de métadonnées, aucun tracking
- **Prêt pour la décentralisation** : Communication P2P avec relais de secours

---

## ✨ Fonctionnalités

### 🔒 **Chiffrement avancé**

- **Protocole Double Ratchet** (Signal Protocol) - Confidentialité persistante & sécurité post-compromission
- **Accord de clés X3DH** - Extended Triple Diffie-Hellman pour établissement sécurisé de session
- **AES-256-GCM** - Chiffrement symétrique pour le contenu des messages
- **Ed25519/X25519** - Cryptographie à courbes elliptiques moderne
- **Argon2id** - Hachage de mot de passe résistant en mémoire (backend)
- **PBKDF2** - Dérivation de clés côté client avec 100 000 itérations

### ⏰ **Messages Time-Lock**

Verrouillage cryptographique d'un message jusqu'à une date / heure choisie, via **drand + tlock** (timelock encryption AGE, BLS12-381 IBE vers un round futur du beacon League of Entropy). Le verrou est **cryptographique, pas server-enforced** — ni un client modifié ni un serveur compromis ne peut servir le message en avance. Le destinataire voit un compte à rebours ; le message se déchiffre tout seul à la milliseconde où drand publie la signature du round cible. Voir `apps/frontend/src/lib/tlock.ts` pour l'implémentation.

### 🔥 **Burn After Reading**

Messages auto-destructeurs avec minuteurs configurables :
- **5 secondes** - Informations ultra-sensibles
- **30 secondes** - Codes de vérification rapides
- **1 minute** - Instructions temporaires
- **5 minutes** - Conversations éphémères

Les messages sont définitivement supprimés de tous les appareils après une seule lecture.

### 🔑 **Authentification**

Le flux principal est **mnémonique 12 mots + mot de passe d'appareil** (PBKDF2-SHA256, 600 000 itérations, scellé via `KeyVault` en IndexedDB). Au retour sur l'appareil, seul le mot de passe est nécessaire (Quick Unlock).

Une seconde voie d'authentification basée sur le **vault de l'écosystème Eidolon** est prévue pour la suite. Elle remplacera l'ancienne piste alternative basée sur la clé physique.

### 🌐 **Communication Peer-to-Peer**

Messagerie directe appareil-à-appareil :
- **WebRTC** data channels pour communication à faible latence
- **Découverte LAN** - Détection automatique de pairs sur réseaux locaux
- **Bootstrap DHT** - Découverte de pairs décentralisée
- **Store & Forward** - Relais de messages quand le destinataire est hors ligne
- **Traversée NAT** - Fonctionne derrière pare-feu et routeurs

### 🌍 **Support multilingue**

Internationalisation complète sur **8 langues**, traductions natives :
- 🇬🇧 English
- 🇫🇷 Français
- 🇩🇪 Deutsch
- 🇪🇸 Español
- 🇮🇹 Italiano
- 🇵🇹 Português
- 🇷🇺 Русский
- 🇨🇳 中文 (简体)

### 🛡️ **Confidentialité & Sécurité**

- **Authentification SRP** (Secure Remote Password) - Protocole à divulgation nulle de connaissance
- **JWT avec Refresh Tokens** - Gestion sécurisée des sessions (sans IP ni user-agent stockés)
- **Protection CSRF** - Prévention des attaques cross-site
- **Rate Limiting** - Protection contre les attaques par force brute
- **Content Security Policy** - Atténuation XSS
- **Force HTTPS** - Couche de transport chiffrée
- **Évènements de sécurité en mémoire** - Anneau circulaire (`services/security-events.ts`), pas de logs d'audit persistants côté serveur (supprimés en privacy-l1)

### 🔍 **Trust Star**

Représentation visuelle de votre réseau de confiance :
- Graphe 3D interactif des connexions
- Visualisation des niveaux de confiance
- Analyse réseau pour sensibilisation sécuritaire

---

## 📥 Téléchargement (utilisateurs / testeurs)

Téléchargez `Cipher-Setup-1.2.6.exe` (Windows) ou `Cipher-1.2.6.AppImage` /
`cipher_1.2.6_amd64.deb` (Linux) depuis la [dernière release](../../releases/latest).

> **À propos de l'avertissement Windows SmartScreen / antivirus** — à lire avant de lancer
>
> L'installateur Windows **n'est pas encore signé numériquement**. SmartScreen
> et certains antivirus (Defender, Avast, etc.) marquent tout `.exe` non
> signé qu'ils n'ont jamais vu — **c'est une heuristique, pas une détection
> de malware**.
>
> La signature Microsoft via **Azure Trusted Signing est prévue pour la
> prochaine release** (le workflow CI est déjà en place, voir
> [`docs/azure-trusted-signing.md`](docs/azure-trusted-signing.md) ;
> il ne reste qu'à provisionner le compte Azure — ETA semaine prochaine).
> Une fois actif, SmartScreen affichera *« Cipher · Éditeur vérifié »* et
> les antivirus se calmeront d'eux-mêmes au fil des installations.
>
> En attendant, pour vérifier toi-même que le binaire est sain :
>
> 1. **Lis le code source.** Chaque ligne du `.exe` est dans ce dépôt. Le
>    build est reproductible depuis
>    [`.github/workflows/release.yml`](.github/workflows/release.yml) —
>    tu peux le rejouer sur un fork et obtenir un binaire byte-identique.
> 2. **Soumets-le à VirusTotal** ([virustotal.com](https://www.virustotal.com)).
>    La plupart des moteurs sont verts. Les faux positifs sur les apps
>    Electron sont fréquents (les heuristiques flag le Chromium / Node
>    embarqué).
> 3. **Vérifie le SHA256** affiché sur la page de release.
>    PowerShell : `Get-FileHash .\Cipher-Setup-1.2.6.exe -Algorithm SHA256`.
>
> Pour cliquer à travers SmartScreen : **« Informations complémentaires »
> → « Exécuter quand même »**. Pour signaler un faux positif Defender :
> [aka.ms/wdsi](https://www.microsoft.com/en-us/wdsi/filesubmission).

---

## 🚀 Installation (développeurs)

### Prérequis

- **Node.js** 22.x LTS ou supérieur
- **PostgreSQL** 15+ (ou PostgreSQL cloud comme Neon/Supabase)
- **Git**

### Démarrage rapide (Développement)

```bash
# Cloner le dépôt
git clone https://github.com/Oykdo/cipher.git
cd cipher

# Installer les dépendances
npm install

# Configurer les variables d'environnement
cp apps/bridge/.env.example apps/bridge/.env
# Éditer apps/bridge/.env avec votre configuration

# Exécuter les migrations de base de données (idempotentes)
cd apps/bridge
npm run db:migrate:groups            # 007 — schéma groups + message_deliveries
npm run db:migrate:fix-group-type    # 008 — fix legacy rows mal taggées
cd ../..

# Démarrer les serveurs de développement (Backend + Frontend + Electron)
npm run dev
```

L'application s'ouvrira automatiquement dans Electron. L'interface web est disponible sur :
- **Frontend** : http://localhost:5173
- **API Backend** : http://localhost:4000

### Build de l'application desktop

```bash
# Build pour votre plateforme
npm run build:win      # Windows (installateur NSIS)
npm run build:mac      # macOS (DMG + ZIP)
npm run build:linux    # Linux (AppImage + DEB)
```

---

## 🏗️ Architecture

### Stack technique

#### Frontend
- **React 19** avec TypeScript
- **Vite** - Outil de build ultra-rapide
- **Zustand** - Gestion d'état légère
- **Framer Motion** - Animations fluides
- **i18next** - Internationalisation
- **libsodium-wrappers** - Opérations cryptographiques
- **Socket.IO Client** - Communication temps réel

#### Backend
- **Node.js 22** avec TypeScript
- **Fastify** - Framework HTTP haute performance
- **PostgreSQL** - Base de données principale
- **Socket.IO** - Serveur WebSocket
- **Argon2** - Hachage de mots de passe
- **JWT** - Tokens d'authentification
- **Zod** - Validation de types à l'exécution

#### Desktop
- **Electron 30** - Application desktop multiplateforme

### Structure du projet

```
cipher/
├── apps/
│   ├── bridge/              # API Backend
│   │   ├── src/
│   │   │   ├── routes/      # Endpoints API
│   │   │   ├── services/    # Logique métier
│   │   │   ├── db/          # Couche base de données
│   │   │   ├── websocket/   # Gestionnaires WebSocket
│   │   │   └── middleware/  # Sécurité & validation
│   │   └── package.json
│   │
│   └── frontend/            # Frontend React
│       ├── src/
│       │   ├── screens/     # Pages principales
│       │   ├── components/  # Composants UI réutilisables
│       │   ├── lib/         # Bibliothèques core
│       │   │   ├── e2ee/    # Implémentation E2EE
│       │   │   ├── p2p/     # Réseau P2P
│       │   │   └── backup/  # Sauvegarde & récupération
│       │   ├── hooks/       # Hooks React
│       │   ├── services/    # Clients API
│       │   └── store/       # Gestion d'état
│       └── package.json
│
├── main.js                  # Processus principal Electron
├── preload.cjs              # Script preload Electron
└── package.json             # Package racine
```

### Architecture de sécurité

```
┌─────────────────────────────────────────────────────────────┐
│                FLUX D'AUTHENTIFICATION                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Client                           Serveur                   │
│    │                                │                       │
│    │──── SRP Init (A) ─────────────►│                       │
│    │◄─── salt, B, sessionId ────────│                       │
│    │                                │                       │
│    │──── SRP Verify (M1) ──────────►│                       │
│    │◄─── M2, JWT tokens ────────────│                       │
│    │                                │                       │
│  La masterKey reste LOCALE (jamais envoyée au serveur)      │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                FLUX MESSAGE E2EE                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Alice                            Bob                       │
│    │                                │                       │
│    │──── KeyBundle (prekeys) ──────►│                       │
│    │◄─── KeyBundle (prekeys) ───────│                       │
│    │                                │                       │
│    │     Session Double Ratchet     │                       │
│    │◄──────────────────────────────►│                       │
│    │                                │                       │
│    │──── Message chiffré ──────────►│                       │
│    │     (Serveur ne peut pas      │                       │
│    │      déchiffrer)              │                       │
│    │◄─── Réponse chiffrée ─────────│                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Schéma de base de données (PostgreSQL)

| Table | Objectif |
|-------|---------|
| `users` | Comptes utilisateurs (email, passwordHash, clés publiques) |
| `conversations` | Métadonnées des conversations |
| `messages` | Contenus de messages chiffrés |
| `conversation_members` | Relation many-to-many |
| `conversation_requests` | Invitations de conversation en attente |
| `key_bundles` | Bundles de clés publiques E2EE (X3DH) |
| `x3dh_sessions` | Sessions E2EE actives |
| `settings` | Préférences utilisateur |
| `attachments` | Métadonnées de fichiers |
| `refresh_tokens` | Tokens de rafraîchissement JWT (sans IP ni user-agent) |
| `message_deliveries` | ACK par-destinataire pour les groupes (depuis 1.2.0) |

---

## 🔒 Sécurité

### Primitives cryptographiques

| Algorithme | Usage | Taille clé |
|-----------|-------|----------|
| **Ed25519** | Signatures numériques | 256 bits |
| **X25519** | Échange de clés (ECDH) | 256 bits |
| **AES-256-GCM** | Chiffrement de messages | 256 bits |
| **Argon2id** | Hachage de mots de passe | N/A |
| **PBKDF2-SHA512** | Dérivation de clés | N/A |
| **SHA-512** | Hachage | N/A |
| **HKDF-SHA256** | Expansion de clés | N/A |

### Modèle de menace

**Protégé contre :**
- ✅ Attaques man-in-the-middle (E2EE)
- ✅ Compromission du serveur (Architecture zero-knowledge)
- ✅ Écoute réseau (TLS + E2EE)
- ✅ Attaques par force brute (Rate limiting + Argon2id)
- ✅ Attaques par rejeu (Nonces + timestamps)
- ✅ Compromission de clés (Perfect forward secrecy)
- ✅ Attaques XSS (CSP + DOMPurify)
- ✅ Attaques CSRF (Tokens CSRF)
- ✅ Injection SQL (Requêtes paramétrées)

**Non protégé contre :**
- ❌ Compromission de l'appareil (malware, accès physique)
- ❌ Ordinateurs quantiques (menace future - crypto post-quantique prévue)
- ❌ Ingénierie sociale
- ❌ Capture d'écran / keyloggers

### Contrat de confidentialité (vérifiable en CI)

Plutôt qu'un audit ponctuel, Cipher publie un [**contrat de confidentialité**](./CIPHER_PRIVACY_GUARANTEES.md) qui énumère ce que le serveur stocke et ce qu'il **ne stocke pas**, ligne par ligne. Chaque garantie a une contrepartie sous forme de test d'invariants exécuté en CI (`apps/bridge/src/__tests__/privacy-invariants.test.ts`) — toute PR qui violerait une garantie casse le build par construction.

### Signalement de vulnérabilités

Voir [`SECURITY.md`](./SECURITY.md) pour la procédure complète. En résumé : ouvrez un **GitHub Security Advisory privé** sur https://github.com/Oykdo/cipher/security/advisories. Ne créez pas d'issue publique pour une faille.

---

## 📚 Documentation

- [**Contrat de confidentialité**](./CIPHER_PRIVACY_GUARANTEES.md) — ce que le serveur stocke et ne stocke PAS, vérifié en CI
- [**Changelog**](./CHANGELOG.md) — historique des releases
- [**Guide contributeur**](./CONTRIBUTING.md) — workflow PR / convention de commit
- [**Politique de sécurité**](./SECURITY.md) — comment signaler une vulnérabilité
- [**Notes infra**](./INFRA_NOTES.md) — déploiement Fly + Neon + Render
- [**Code signing Windows**](./docs/azure-trusted-signing.md) — setup Azure Trusted Signing pour la prochaine release
- [**CLAUDE.md**](./CLAUDE.md) — guide d'orientation pour les contributeurs assistés par IA

---

## 🤝 Contribuer

Les contributions sont les bienvenues ! Veuillez consulter notre [**Guide de contribution**](./CONTRIBUTING.md) pour plus de détails.

### Configuration développement

```bash
# Forker et cloner le dépôt
git clone https://github.com/VOTRE_NOM/cipher.git
cd cipher

# Créer une branche feature
git checkout -b feature/votre-fonctionnalité

# Installer les dépendances
npm install

# Exécuter les tests
npm test

# Faire vos changements et commiter
git commit -m "feat: ajouter fonctionnalité géniale"

# Pousser vers votre fork
git push origin feature/votre-fonctionnalité

# Créer une Pull Request
```

---

## 💖 Soutenir le projet

Si vous trouvez Cipher utile, soutenez son développement :

### Dons en cryptomonnaies

| Devise | Adresse |
|--------|---------|
| **Bitcoin (BTC)** | `bc1pqu5zya672tma8q36ww9c6mzk7uryq6cuavqn04jqka43qjm6nxtqs8am6t` |
| **EVM (0x)** | `0x979a6093d3a1662054b89667e6dbfac001fa2617` |
| **Solana (SOL)** | `HshrizaXzs6i6yse3YjkpDsQ4S7WjRoDALeVr6tN1yM8` |
| **XRP (XRP)** | `rspbrWJkPr8jSyz9wVVLwpxuSfosBM8ocM` |
| **Pi** | `GCUGVJDK4TY6KTVWFYXTDH2OXRSTTFQUYPLU2CH523AHCZOPWUVEVDC6` |

### Autres façons de soutenir

- ⭐ Mettre une étoile au dépôt
- 🐛 Signaler bugs et problèmes
- 📖 Améliorer la documentation
- 💻 Contribuer du code
- 🌍 Traduire dans votre langue
- 📢 Faire connaître le projet

---

## 📄 Licence

Ce projet est sous licence **MIT** - voir le fichier [LICENSE](./LICENSE) pour plus de détails.

---

## 🙏 Remerciements

- **Signal Foundation** - Pour la spécification du protocole Double Ratchet
- **libsodium** - Pour d'excellentes primitives cryptographiques
- **The Diceware Project** - Pour les phrases de passe mémorables
- **Bitcoin Core** - Pour l'inspiration du verrouillage temporel blockchain
- Tous les contributeurs qui ont aidé à rendre ce projet possible

---

## 📞 Contact

- **GitHub** : [@Oykdo](https://github.com/Oykdo)
- **Dépôt** : [https://github.com/Oykdo/cipher](https://github.com/Oykdo/cipher)
- **Issues** : [https://github.com/Oykdo/cipher/issues](https://github.com/Oykdo/cipher/issues)

---

<div align="center">

**Construit avec ❤️ pour la confidentialité et la sécurité**

*Vos messages, vos clés, zéro confiance.*

</div>
