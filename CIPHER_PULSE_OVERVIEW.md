# Cipher Pulse — Présentation (générale, orientée usage)

> Objectif : fournir une description la plus complète possible du projet **sans** entrer dans les détails techniques/cryptographiques.

## 1) En une phrase

**Cipher Pulse** (anciennement *Dead Drop*) est une application de messagerie sécurisée et résiliente qui met l’accent sur la **confidentialité**, la **souveraineté de l’utilisateur**, et des modes de communication adaptés aux contextes sensibles (messages chiffrés, temporisés, auto-destructibles, avec options P2P).

## 2) Le problème que Cipher Pulse adresse

La messagerie moderne est souvent un compromis :

1. **Confiance dans un serveur** (ou dans un opérateur) pour la confidentialité.
2. **Sur-collecte** (métadonnées, tracking, analytics) qui crée des risques.
3. **Dépendance à une infrastructure unique** (si le serveur est indisponible, la communication tombe).
4. **Manque de fonctionnalités “opérationnelles”** : messages programmés, “capsules temporelles”, destruction après lecture, etc.

Cipher Pulse vise à proposer une messagerie qui reste utile même dans des contextes dégradés (réseau instable, destinataire hors-ligne, besoin d’envoi direct), tout en gardant une philosophie “privacy first”.

## 3) Principes du projet

- **Confidentialité par défaut** : l’application cherche à réduire au maximum ce qui peut être exposé.
- **Contrôle utilisateur** : l’utilisateur garde le contrôle de ses accès et de ses sauvegardes.
- **Résilience** : plusieurs modes de transport (et comportements) pour s’adapter aux contraintes réseau.
- **Open-source** : le code peut être audité et discuté publiquement.

## 4) Fonctionnalités principales (côté utilisateur)

### 4.1 Messagerie chiffrée de bout en bout

- Les messages sont conçus pour être lisibles **uniquement par les participants** d’une conversation.
- Le serveur sert d’acheminement et de stockage, mais l’objectif est de ne jamais le rendre “nécessairement digne de confiance” pour le contenu.

### 4.2 Temps réel (présence + messages instantanés)

- Indication d’utilisateurs en ligne.
- Réception en temps réel lorsque les participants sont connectés.

### 4.3 Communication P2P (optionnelle) + relais

- Lorsque possible, l’application peut établir une communication directe entre appareils.
- Si ce n’est pas possible (NAT, réseau, etc.), elle utilise un mode relai.

### 4.4 Time‑Lock (capsules temporelles)

- Possibilité d’envoyer un message / une pièce jointe avec une **date de déverrouillage**.
- Idéal pour : annonces programmées, “time capsule”, messages post-datés, etc.

### 4.5 Burn After Reading (auto-destruction)

- Possibilité d’envoyer des messages/objets qui se détruisent après lecture / téléchargement.
- Utile pour des informations très sensibles.

### 4.6 Pièces jointes

- Envoi de fichiers (images, documents, etc.) avec gestion côté application.
- Support des pièces jointes “time‑lock” et “burn after reading”.
- L’application permet d’ajouter un **texte** (caption) en même temps qu’une pièce jointe.

### 4.7 Multi‑langues

Traductions intégrées :

- English
- Français
- Deutsch
- Español
- Italiano
- 中文 (简体)

### 4.8 Authentification / récupération

- Création de compte avec une approche qui privilégie la récupération et la robustesse.
- Possibilité d’utiliser une méthode « standard » (phrase de récupération) ou une méthode à très forte entropie (DiceKey).

## 5) Plateformes & distribution

- **Application desktop** (Electron)
- **Web app** (hébergement possible en service web)

Le projet est organisé en monorepo : backend + frontend + desktop.

## 6) Don / contribution

Le projet propose des moyens de contribution (crypto et Stripe).

- Crypto : adresses visibles dans l’app (avec un mécanisme de vérification d’intégrité côté client).
- Carte : redirection vers un paiement via Stripe Checkout.

## 7) Limites (à annoncer honnêtement)

- Aucune application de messagerie ne peut protéger contre un **appareil compromis** (malware, keylogger, etc.).
- La confidentialité dépend aussi du comportement utilisateur (captures d’écran, partage volontaire, etc.).
- L’anonymat “niveau Tor” n’est pas l’objectif principal ; le focus est la confidentialité du contenu.

## 8) Cas d’usage concrets

- Conversations privées “classiques” (avec meilleure posture de confidentialité)
- Envoi d’informations sensibles à durée de vie limitée
- Transfert de fichiers sensibles + texte contextuel
- Annonces temporisées (capsule temporelle)
- Communication directe P2P sur réseau local quand possible

## 9) Pitch prêt à poster (forums / Reddit)

Copie/colle ce texte (puis adapte selon le subreddit) :

> Je développe **Cipher Pulse**, une messagerie open‑source orientée confidentialité et résilience. Elle propose du chiffrement de bout en bout, des messages auto‑destructibles (burn after reading), des messages temporisés (time‑lock / “capsules temporelles”), des pièces jointes chiffrées, et un mode P2P optionnel avec relai si besoin. L’objectif n’est pas de faire du marketing, mais de partager un projet auditable, itératif, et d’obtenir des retours (threat model, UX, features). Je cherche des avis et des contributeurs.

## 10) Prompt “grave” pour générer une présentation par LLM

> Tu peux donner ce prompt à un LLM et lui joindre aussi `CIPHER_PULSE_CRYPTOGRAPHY.md` si tu veux une version plus technique.

```text
Tu es un excellent rédacteur technique et community manager. À partir des informations ci-dessous, écris :
1) un post Reddit court (150-250 mots) pour présenter Cipher Pulse,
2) un post Reddit long (600-900 mots) plus détaillé,
3) une FAQ (10 questions/réponses),
4) un "pitch" en 3 phrases.

Contraintes :
- ton neutre, pas de buzzwords gratuits
- mettre en avant la philosophie (confidentialité, résilience, open-source)
- mentionner clairement les limites (endpoint compromise, etc.)
- proposer des questions aux lecteurs (feedback recherché)

Contenu source :
- Cipher Pulse (Dead Drop) : messagerie secure orientée confidentialité
- fonctionnalités : E2EE, time-lock, burn-after-reading, P2P optionnel, pièces jointes + caption, multi-langues
- projet open-source, contribution via crypto + Stripe
```
