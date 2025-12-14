# 🔐 Cipher Pulse (Dead Drop)

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)

**Messagerie sécurisée avec chiffrement de bout en bout, verrouillage temporel blockchain et fonctionnalités avancées de confidentialité**

[Fonctionnalités](#-fonctionnalités) • [Installation](#-installation) • [Architecture](#-architecture) • [Sécurité](#-sécurité) • [Contribuer](#-contribuer)

[🇬🇧 English Version](./README.md)

</div>

---

## 📖 À propos

**Cipher Pulse** (anciennement Dead Drop) est une application de messagerie sécurisée de nouvelle génération qui combine un chiffrement de qualité militaire avec des fonctionnalités innovantes de confidentialité. Construit sur l'algorithme Double Ratchet du protocole Signal, il garantit une confidentialité persistante tout en offrant des fonctionnalités uniques comme les messages verrouillés temporellement via blockchain et la destruction automatique après lecture.

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

Les messages peuvent être verrouillés jusqu'à une heure précise grâce à **l'ancrage blockchain** :
- Intégration Bitcoin pour horodatage inviolable
- Preuve cryptographique de validité du verrouillage temporel
- Impossible à déverrouiller avant l'heure prévue (même par vous !)
- Cas d'usage : annonces programmées, messages posthumes, capsules temporelles

### 🔥 **Burn After Reading**

Messages auto-destructeurs avec minuteurs configurables :
- **5 secondes** - Informations ultra-sensibles
- **30 secondes** - Codes de vérification rapides
- **1 minute** - Instructions temporaires
- **5 minutes** - Conversations éphémères

Les messages sont définitivement supprimés de tous les appareils après une seule lecture.

### 🎲 **Authentification DiceKey**

Authentification par clé de sécurité physique utilisant le [système DiceKey](https://dicekeys.com) :
- **775 bits d'entropie** (vs 256 bits pour une seed standard de 24 mots)
- Génération de seed basée sur le matériel
- Immunisé contre les keyloggers et le shoulder surfing
- Compatible avec le standard BIP-39 (phrase de récupération de 6 mots)

### 🌐 **Communication Peer-to-Peer**

Messagerie directe appareil-à-appareil :
- **WebRTC** data channels pour communication à faible latence
- **Découverte LAN** - Détection automatique de pairs sur réseaux locaux
- **Bootstrap DHT** - Découverte de pairs décentralisée
- **Store & Forward** - Relais de messages quand le destinataire est hors ligne
- **Traversée NAT** - Fonctionne derrière pare-feu et routeurs

### 🌍 **Support multilingue**

Internationalisation complète avec traductions natives :
- 🇬🇧 English
- 🇫🇷 Français
- 🇩🇪 Deutsch
- 🇪🇸 Español
- 🇮🇹 Italiano
- 🇨🇳 中文 (简体)

### 🛡️ **Confidentialité & Sécurité**

- **Authentification SRP** (Secure Remote Password) - Protocole à divulgation nulle de connaissance
- **JWT avec Refresh Tokens** - Gestion sécurisée des sessions
- **Protection CSRF** - Prévention des attaques cross-site
- **Rate Limiting** - Protection contre les attaques par force brute
- **Content Security Policy** - Atténuation XSS
- **Force HTTPS** - Couche de transport chiffrée
- **Logs d'audit** - Suivi des événements de sécurité

### 🔍 **Trust Star**

Représentation visuelle de votre réseau de confiance :
- Graphe 3D interactif des connexions
- Visualisation des niveaux de confiance
- Analyse réseau pour sensibilisation sécuritaire

---

## 🚀 Installation

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

# Exécuter les migrations de base de données
cd apps/bridge
npm run db:migrate
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
cipher-pulse/
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
| `refresh_tokens` | Tokens de rafraîchissement JWT |
| `audit_logs` | Événements de sécurité |

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

### Audit de sécurité

Un rapport d'audit de sécurité complet est disponible dans [`SECURITY_AUDIT_REPORT.md`](./SECURITY_AUDIT_REPORT.md).

**Résultats clés :**
- ✅ Implémentation cryptographique solide
- ⚠️ Améliorations du contrôle d'accès WebSocket nécessaires (corrigé en v1.0)
- ⚠️ Migration du stockage de clés vers IndexedDB recommandée (prévu pour v1.1)

### Signalement de vulnérabilités

Si vous découvrez une vulnérabilité de sécurité, veuillez envoyer un email à **[security@cipherpulse.io]** (ou créer un advisory de sécurité privé sur GitHub). Ne créez pas d'issues publiques pour les vulnérabilités de sécurité.

---

## 📚 Documentation

- [**Guide de déploiement**](./DEPLOYMENT_GUIDE.md) - Instructions de déploiement en production
- [**Vue d'ensemble des composants**](./COMPONENTS_OVERVIEW.md) - Documentation détaillée de l'architecture
- [**Audit de sécurité**](./SECURITY_AUDIT_REPORT.md) - Analyse et recommandations de sécurité
- [**POC DiceKey**](./POC_DICEKEY.md) - Implémentation de l'authentification DiceKey
- [**POC Time-Lock**](./POC_TIMELOCK_BLOCKCHAIN.md) - Implémentation du verrouillage temporel blockchain
- [**X3DH + Double Ratchet**](./X3DH_DOUBLE_RATCHET_IMPLEMENTATION_PLAN.md) - Détails du protocole E2EE

---

## 🛣️ Roadmap

Les dates sont des estimations et peuvent évoluer selon les priorités (sécurité, stabilité, livraison).

### Version 1.0 (Déc 2025) — Base actuelle
- [x] Déploiement web (Bridge + Frontend)
- [x] Base E2EE v2 (X3DH + Double Ratchet)
- [x] Pièces jointes E2EE + cycle burn-after-reading
- [x] Time-lock blockchain (hauteur de bloc)

### Version 1.1 (T1 2026) — Stabilité & durcissement sécurité
- [ ] Migration KeyVault vers IndexedDB (réduction du risque localStorage)
- [ ] Durcissement WebSocket/Socket.IO (auth + contrôle d'accès + rate limits)
- [ ] Revue CSP/CORS (réduire les faux positifs, scripts stricts)
- [ ] Observabilité prod (logs actionnables, health, erreurs)

### Version 1.2 (T2 2026) — UX & fonctionnalités collaboratives
- [ ] Conversations de groupe (implémentation initiale ; recherche MLS en parallèle)
- [ ] Accusés de lecture + indicateurs de frappe (opt-in)
- [ ] Meilleure UX pièces jointes (quotas, cleanup, retries)

### Version 2.0 (S2 2026+) — Recherche / fonctionnalités avancées
- [ ] Échange de clés hybride post-quantique (Kyber) derrière feature flag
- [ ] Fédération / interopérabilité (serveur-à-serveur)
- [ ] Support Tor (option endpoint onion)
- [ ] Exploration DID / ZK privacy
- [ ] Appels vocaux & vidéo (chiffrés)

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

Si vous trouvez Cipher Pulse utile, soutenez son développement :

### Dons en cryptomonnaies

| Devise | Adresse |
|--------|---------|
| **Bitcoin (BTC)** | `[VOTRE_ADRESSE_BTC]` |
| **Ethereum (ETH)** | `[VOTRE_ADRESSE_ETH]` |
| **Monero (XMR)** | `[VOTRE_ADRESSE_XMR]` |
| **Solana (SOL)** | `[VOTRE_ADRESSE_SOL]` |

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
