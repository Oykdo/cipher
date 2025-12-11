# Cipher Pulse - Architecture des Composants

> Document généré automatiquement - Vue d'ensemble de tous les composants de l'application

---

## Table des matières

1. [Frontend - Screens](#frontend---screens)
2. [Frontend - Components](#frontend---components)
3. [Frontend - Hooks](#frontend---hooks)
4. [Frontend - Libraries](#frontend---libraries)
5. [Frontend - Services](#frontend---services)
6. [Frontend - Core](#frontend---core)
7. [Frontend - Store](#frontend---store)
8. [Backend - Routes](#backend---routes)
9. [Backend - Services](#backend---services)
10. [Backend - Domain](#backend---domain)
11. [Backend - Infrastructure](#backend---infrastructure)
12. [Sécurité & Cryptographie](#sécurité--cryptographie)

---

## Frontend - Screens

Pages principales de l'application.

| Fichier | Description |
|---------|-------------|
| `Welcome.tsx` | Page d'accueil / splash screen |
| `Landing.tsx` | Page de présentation publique |
| `Discover.tsx` | Découverte de l'application |
| `Login.tsx` | Page de connexion (legacy) |
| `LoginFluid.tsx` | Page de connexion avec animations fluides |
| `LoginNew.tsx` | **Page de connexion principale** - SRP, Avatar, DiceKey |
| `Signup.tsx` | Page d'inscription (legacy) |
| `SignupFluid.tsx` | **Page d'inscription principale** - Standard & DiceKey |
| `Conversations.tsx` | **Écran principal** - Liste et chat des conversations |
| `P2PChat.tsx` | Chat peer-to-peer direct |
| `Settings.tsx` | Page des paramètres utilisateur |
| `Recovery.tsx` | Récupération de compte |
| `MonitoringDashboard.tsx` | Tableau de bord de monitoring (admin) |
| `NotFound.tsx` | Page 404 |

---

## Frontend - Components

### Composants UI de base

| Fichier | Description |
|---------|-------------|
| `ui/Button/Button.tsx` | Bouton réutilisable |
| `ui/Input/Input.tsx` | Champ de saisie |
| `ui/Dialog/Dialog.tsx` | Modal / dialogue |
| `ui/Tooltip/Tooltip.tsx` | Infobulle |
| `ui/Spinner/Spinner.tsx` | Indicateur de chargement |
| `ui/Skeleton/Skeleton.tsx` | Placeholder de chargement |
| `ui/EmptyState/EmptyState.tsx` | État vide |
| `ui/LiveRegion/LiveRegion.tsx` | Zone ARIA live pour accessibilité |

### Composants de conversation

| Fichier | Description |
|---------|-------------|
| `conversations/ConversationList.tsx` | Liste des conversations |
| `conversations/ChatHeader.tsx` | En-tête du chat |
| `conversations/MessageList.tsx` | Liste des messages |
| `conversations/MessageInput.tsx` | Zone de saisie de message |
| `conversations/EncryptionStatusBadge.tsx` | Badge de statut E2EE |

### Composants d'authentification

| Fichier | Description |
|---------|-------------|
| `QuickUnlock.tsx` | Déverrouillage rapide (style MetaMask) |
| `FileLoginForm.tsx` | Formulaire de connexion par fichier avatar |
| `DiceKeyInput.tsx` | Saisie des 300 dés (legacy) |
| `DiceKeyInputFluid.tsx` | Saisie des dés avec animations |
| `DiceKeyResults.tsx` | Affichage des résultats DiceKey |
| `CosmicLoader.tsx` | Loader animé pour génération de clés |

### Composants de sécurité

| Fichier | Description |
|---------|-------------|
| `e2ee/FingerprintDisplay.tsx` | Affichage d'empreinte de clé |
| `e2ee/MyKeyFingerprint.tsx` | Mon empreinte de clé |
| `SafetyNumberVerification.tsx` | Vérification du numéro de sécurité |
| `ConnectionStatus.tsx` | Statut de connexion (online/offline) |

### Composants de messages

| Fichier | Description |
|---------|-------------|
| `BurnCountdown.tsx` | Compte à rebours avant destruction |
| `BurnAnimation.tsx` | Animation de destruction |
| `BurnDelaySelector.tsx` | Sélecteur de délai de destruction |
| `TimeLockCountdown.tsx` | Compte à rebours time-lock (blockchain) |
| `DateSeparator.tsx` | Séparateur de date dans les messages |
| `ScrollToBottom.tsx` | Bouton scroll vers le bas |

### Composants de paramètres

| Fichier | Description |
|---------|-------------|
| `settings/GeneralSettings.tsx` | Paramètres généraux |
| `settings/SecuritySettings.tsx` | Paramètres de sécurité |
| `settings/BackupSettings.tsx` | Sauvegarde et récupération |
| `settings/ContributionSettings.tsx` | Paramètres de contribution |

### Composants divers

| Fichier | Description |
|---------|-------------|
| `Avatar.tsx` | Avatar utilisateur |
| `Logo.tsx` | Logo de l'application |
| `TrustStar3D.tsx` | Étoile de confiance 3D (WebGL) |
| `TrustStar2D.tsx` | Étoile de confiance 2D |
| `TrustStarWidget.tsx` | Widget étoile de confiance |
| `UserSearch.tsx` | Recherche d'utilisateurs |
| `UserStatusSelector.tsx` | Sélecteur de statut (online/away/invisible) |
| `ConversationRequests.tsx` | Demandes de conversation |
| `LanguageSelector.tsx` | Sélecteur de langue |
| `LanguageSwitcher.tsx` | Changeur de langue |
| `LanguageSwitch.tsx` | Switch de langue |
| `MobileHeader.tsx` | En-tête mobile |
| `ShortcutsModal.tsx` | Modal des raccourcis clavier |
| `ErrorBoundary.tsx` | Gestion des erreurs React |

---

## Frontend - Hooks

| Fichier | Description |
|---------|-------------|
| `useSocket.ts` | Connexion WebSocket |
| `useSocketWithRefresh.ts` | WebSocket avec auto-refresh token |
| `useWebSocket.ts` | WebSocket de base |
| `useP2P.ts` | Gestion P2P |
| `useResilientMessaging.ts` | Messagerie résiliente (fallback P2P/Relay) |
| `useConversationMessages.ts` | Messages d'une conversation |
| `useSettings.ts` | Paramètres utilisateur |
| `useCryptoWorker.ts` | Worker de cryptographie |
| `useKeyboardShortcuts.ts` | Raccourcis clavier |
| `useFocusTrap.ts` | Piège de focus (accessibilité) |
| `useKonamiCode.ts` | Easter egg Konami Code |
| `useErrorHandler.ts` | Gestion d'erreurs |

---

## Frontend - Libraries

### Cryptographie & E2EE

| Fichier | Description |
|---------|-------------|
| `e2ee/doubleRatchet.ts` | **Double Ratchet Algorithm** (Signal Protocol) |
| `e2ee/sessionManager.ts` | Gestion des sessions E2EE |
| `e2ee/keyManagement.ts` | Gestion des clés |
| `e2ee/e2eeService.ts` | Service E2EE principal |
| `e2ee/messagingIntegration.ts` | Intégration avec messagerie |
| `e2ee/index.ts` | Exports E2EE |
| `encryption.ts` | Chiffrement AES-GCM |
| `keyGeneration.ts` | Génération de clés Ed25519/X25519 |
| `kdf.ts` | Key Derivation Function (Argon2) |
| `kdfSimple.ts` | KDF simplifié (PBKDF2) |
| `crypto.ts` | Utilitaires crypto |

### Stockage sécurisé

| Fichier | Description |
|---------|-------------|
| `keyVault.ts` | Coffre-fort de clés (IndexedDB chiffré) |
| `keyStore.ts` | Stockage de clés |
| `secureStorage.ts` | Stockage sécurisé |
| `secureKeyAccess.ts` | Accès sécurisé aux clés |
| `masterKeyResolver.ts` | Résolution de la masterKey (non-extractable CryptoKey) |
| `localStorage.ts` | Utilitaires localStorage |
| `storageMigration.ts` | Migration de stockage |

### P2P & Réseau

| Fichier | Description |
|---------|-------------|
| `p2p/webrtc.ts` | Connexions WebRTC |
| `p2p/p2p-manager.ts` | Gestionnaire P2P |
| `p2p/signaling-client.ts` | Client de signaling |
| `p2p/presence.ts` | Présence P2P |
| `p2p/lan-discovery.ts` | Découverte LAN |
| `p2p/store-forward.ts` | Store & Forward |
| `p2p/key-exchange.ts` | Échange de clés P2P |
| `p2p/dht/dht-manager.ts` | Gestionnaire DHT |
| `p2p/dht/bootstrap.ts` | Bootstrap DHT |
| `p2p/dht/types.ts` | Types DHT |

### Fédération

| Fichier | Description |
|---------|-------------|
| `federation/federation-client.ts` | Client de fédération |
| `federation/types.ts` | Types fédération |
| `federation/index.ts` | Exports fédération |

### Utilitaires

| Fichier | Description |
|---------|-------------|
| `diceKey.ts` | Logique DiceKey |
| `validation.ts` | Validation des entrées |
| `sanitize.ts` | Sanitization XSS (DOMPurify) |
| `psi.ts` | Private Set Intersection |
| `utils.ts` | Utilitaires généraux |
| `logger.ts` | Logging |
| `dataExport.ts` | Export de données RGPD |

---

## Frontend - Services

| Fichier | Description |
|---------|-------------|
| `api-v2.ts` | API v2 principale |
| `api-interceptor.ts` | Intercepteur API avec refresh token |
| `messageService.ts` | Service de messages |
| `trustStar.ts` | Service Trust Star |
| `sanitization.ts` | Service de sanitization |

---

## Frontend - Core

### Messagerie

| Fichier | Description |
|---------|-------------|
| `messaging/MessageRouter.ts` | Routeur de messages |
| `messaging/MessageTransport.ts` | Interface transport |
| `messaging/transports/WebSocketTransport.ts` | Transport WebSocket |
| `messaging/transports/P2PTransport.ts` | Transport P2P |

### Cryptographie

| Fichier | Description |
|---------|-------------|
| `crypto/DoubleRatchet.ts` | Double Ratchet (core) |
| `crypto/KeyRotationManager.ts` | Rotation de clés |
| `crypto/PeerAuthenticator.ts` | Authentification de pairs |
| `crypto/index.ts` | Exports crypto |

### Résilience

| Fichier | Description |
|---------|-------------|
| `resilience/CircuitBreaker.ts` | Circuit breaker |
| `resilience/RateLimiter.ts` | Rate limiter |
| `resilience/index.ts` | Exports résilience |

### Télémétrie & Monitoring

| Fichier | Description |
|---------|-------------|
| `telemetry/PerformanceMonitor.ts` | Monitoring de performance |
| `telemetry/MetricsCollector.ts` | Collecte de métriques |
| `health/HealthChecker.ts` | Vérification de santé |
| `logger/index.ts` | Logger structuré |

### Sécurité

| Fichier | Description |
|---------|-------------|
| `security/AuditLogger.ts` | Logger d'audit |
| `security/index.ts` | Exports sécurité |

---

## Frontend - Store

| Fichier | Description |
|---------|-------------|
| `auth.ts` | État d'authentification (Zustand) |
| `authSecure.ts` | État d'authentification sécurisé |

---

## Backend - Routes

| Fichier | Description |
|---------|-------------|
| `auth.ts` | **Authentification** - Signup, Login (SRP), Refresh |
| `users.ts` | Gestion des utilisateurs |
| `conversations.ts` | Gestion des conversations |
| `conversationRequests.ts` | Demandes de conversation |
| `messages.ts` | Envoi/réception de messages |
| `e2ee.ts` | Endpoints E2EE (key bundles) |
| `attachments.ts` | Pièces jointes |
| `avatar.ts` | Avatars utilisateurs |
| `blockchain.ts` | Intégration blockchain (time-lock) |
| `trustStar.ts` | Trust Star API |
| `settings.ts` | Paramètres utilisateur |
| `recovery.ts` | Récupération de compte |
| `health.ts` | Health check |
| `acknowledge.ts` | Accusés de réception |

---

## Backend - Services

| Fichier | Description |
|---------|-------------|
| `avatarService.ts` | Génération d'avatars |
| `backupService.ts` | Service de backup |
| `blockchain-bitcoin.ts` | Intégration Bitcoin (time-lock) |
| `burn-scheduler.ts` | Planificateur de destruction |
| `psi.ts` | Private Set Intersection |
| `settingsService.ts` | Service de paramètres |
| `trust-star.ts` | Service Trust Star |

---

## Backend - Domain

### Entités

| Fichier | Description |
|---------|-------------|
| `entities/User.ts` | Entité Utilisateur |
| `entities/Conversation.ts` | Entité Conversation |
| `entities/Message.ts` | Entité Message |

### Value Objects

| Fichier | Description |
|---------|-------------|
| `value-objects/SecurityTier.ts` | Niveau de sécurité (standard/dice-key) |

### Erreurs

| Fichier | Description |
|---------|-------------|
| `errors/AuthErrors.ts` | Erreurs d'authentification |
| `errors/MessageErrors.ts` | Erreurs de messages |
| `errors/ConversationErrors.ts` | Erreurs de conversations |
| `errors/UserErrors.ts` | Erreurs utilisateurs |
| `errors/ValidationErrors.ts` | Erreurs de validation |
| `errors/BaseError.ts` | Classe d'erreur de base |

### Repositories (Interfaces)

| Fichier | Description |
|---------|-------------|
| `repositories/IUserRepository.ts` | Interface repo utilisateurs |
| `repositories/IConversationRepository.ts` | Interface repo conversations |
| `repositories/IMessageRepository.ts` | Interface repo messages |

---

## Backend - Infrastructure

### Database

| Fichier | Description |
|---------|-------------|
| `database.js` | **Service de base de données** (PostgreSQL) |
| `kysely.ts` | Query builder Kysely |
| `schema.ts` | Schéma TypeScript |
| `migrate-srp.ts` | Migration SRP |

### Repositories (Implémentations)

| Fichier | Description |
|---------|-------------|
| `database/repositories/UserRepository.ts` | Repository utilisateurs |
| `database/repositories/ConversationRepository.ts` | Repository conversations |
| `database/repositories/MessageRepository.ts` | Repository messages |

### Services Infrastructure

| Fichier | Description |
|---------|-------------|
| `services/JWTService.ts` | Service JWT |
| `services/BlockchainService.ts` | Service Blockchain |

### Container

| Fichier | Description |
|---------|-------------|
| `container/DIContainer.ts` | Conteneur d'injection de dépendances |

---

## Backend - Application (Use Cases)

### Auth

| Fichier | Description |
|---------|-------------|
| `use-cases/auth/SignupUseCase.ts` | Cas d'utilisation inscription |
| `use-cases/auth/LoginUseCase.ts` | Cas d'utilisation connexion |

### Messages

| Fichier | Description |
|---------|-------------|
| `use-cases/message/SendMessageUseCase.ts` | Envoi de message |
| `use-cases/message/BurnMessagesUseCase.ts` | Destruction de messages |
| `use-cases/message/UnlockTimeLockedMessagesUseCase.ts` | Déverrouillage time-lock |
| `use-cases/message/AcknowledgeMessageUseCase.ts` | Accusé de réception |

### Conversations

| Fichier | Description |
|---------|-------------|
| `use-cases/conversation/CreateConversationUseCase.ts` | Création de conversation |
| `use-cases/conversation/ListConversationsUseCase.ts` | Liste des conversations |

---

## Backend - Middleware

| Fichier | Description |
|---------|-------------|
| `security.ts` | Middleware de sécurité (Helmet, CORS) |
| `rateLimiter.ts` | Rate limiting |
| `csrfProtection.ts` | Protection CSRF |
| `cspNonce.ts` | Content Security Policy nonce |
| `httpsEnforcement.ts` | Force HTTPS |

---

## Backend - WebSocket

| Fichier | Description |
|---------|-------------|
| `socketServer.ts` | Serveur WebSocket (Socket.IO) |
| `signaling/server.ts` | Serveur de signaling WebRTC |

---

## Sécurité & Cryptographie

### Algorithmes utilisés

| Algorithme | Utilisation |
|------------|-------------|
| **Double Ratchet** | E2EE - Perfect Forward Secrecy |
| **X25519** | Échange de clés Diffie-Hellman |
| **Ed25519** | Signatures numériques |
| **AES-256-GCM** | Chiffrement symétrique |
| **Argon2id** | Hachage de mot de passe (backend) |
| **PBKDF2** | Dérivation de clés (frontend) |
| **SHA-256/512** | Hachage |
| **HKDF** | Dérivation de clés |
| **SRP** | Secure Remote Password (Zero-Knowledge) |

### Flux de sécurité

```
┌─────────────────────────────────────────────────────────────┐
│                    AUTHENTIFICATION                         │
├─────────────────────────────────────────────────────────────┤
│  Client                           Serveur                   │
│    │                                │                       │
│    │──── SRP Init (A) ─────────────►│                       │
│    │◄─── salt, B, sessionId ────────│                       │
│    │                                │                       │
│    │──── SRP Verify (M1) ──────────►│                       │
│    │◄─── M2, JWT tokens ────────────│                       │
│    │                                │                       │
│  masterKey reste LOCAL (jamais envoyée au serveur)          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    CHIFFREMENT E2EE                         │
├─────────────────────────────────────────────────────────────┤
│  Alice                            Bob                       │
│    │                                │                       │
│    │──── KeyBundle (via serveur) ──►│                       │
│    │◄─── KeyBundle (via serveur) ───│                       │
│    │                                │                       │
│    │     Double Ratchet Session     │                       │
│    │◄──────────────────────────────►│                       │
│    │                                │                       │
│  Messages chiffrés E2E - Serveur ne peut PAS déchiffrer     │
└─────────────────────────────────────────────────────────────┘
```

### Stockage des clés

| Donnée | Stockage | Protection |
|--------|----------|------------|
| masterKey | Client (RAM) | Non-extractable CryptoKey |
| Session keys | Client (IndexedDB) | Chiffré avec masterKey |
| Identity keys | Client (IndexedDB) | Chiffré avec masterKey |
| Ratchet state | Client (IndexedDB) | Chiffré avec masterKey |
| JWT tokens | Client (Memory/Secure) | HTTPOnly cookies option |
| Password hash | Serveur (PostgreSQL) | Argon2id |

---

## Stack Technique

### Frontend

- **React 18** + TypeScript
- **Vite** (bundler)
- **Zustand** (state management)
- **React Router** (navigation)
- **Framer Motion** (animations)
- **i18next** (internationalisation)
- **libsodium** (cryptographie)
- **Socket.IO Client** (WebSocket)

### Backend

- **Node.js** + TypeScript
- **Fastify** (framework HTTP)
- **Socket.IO** (WebSocket)
- **PostgreSQL** (base de données)
- **Argon2** (hachage)
- **JWT** (authentification)

### Desktop

- **Electron** (application desktop)

---

*Document généré le 2024 - Cipher Pulse v1.0*
