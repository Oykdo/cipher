# 💳 Guide d'Installation Stripe pour Cipher Pulse

Ce guide vous explique comment configurer Stripe pour accepter les contributions.

---

## 📋 Prérequis

- ✅ Compte Stripe créé sur https://stripe.com
- ✅ Vérification d'identité complétée (pour passer en mode LIVE)
- ✅ Accès aux clés API Stripe

---

## 🔑 Étape 1 : Récupérer vos clés Stripe

### Mode TEST (Développement)

1. Connectez-vous à https://dashboard.stripe.com
2. Activez le **mode TEST** (toggle en haut à droite)
3. Allez dans **Developers → API keys** : https://dashboard.stripe.com/test/apikeys
4. Copiez les deux clés :
   - **Publishable key** (commence par `pk_test_...`)
   - **Secret key** (commence par `sk_test_...`)

### Mode LIVE (Production)

⚠️ **À faire uniquement quand vous êtes prêt à accepter de vrais paiements !**

1. Désactivez le mode TEST
2. Allez dans **Developers → API keys** : https://dashboard.stripe.com/apikeys
3. Copiez les clés LIVE :
   - **Publishable key** (commence par `pk_live_...`)
   - **Secret key** (commence par `sk_live_...`)

---

## 🛠️ Étape 2 : Configurer les variables d'environnement

### Frontend (`apps/frontend/.env.development`)

```env
# Décommentez et remplacez avec votre vraie clé
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_VOTRE_CLE_PUBLIQUE_ICI
```

### Backend (`apps/bridge/.env`)

```env
# Décommentez et remplacez avec vos vraies clés
STRIPE_SECRET_KEY=sk_test_VOTRE_CLE_SECRETE_ICI
STRIPE_WEBHOOK_SECRET=whsec_VOTRE_SECRET_WEBHOOK_ICI
```

⚠️ **IMPORTANT** : 
- La `Secret key` ne doit **JAMAIS** être partagée ou commitée dans Git
- Le `.gitignore` est déjà configuré pour protéger vos `.env`

---

## 🪝 Étape 3 : Configurer les Webhooks Stripe

Les webhooks permettent à Stripe de notifier votre serveur quand un paiement réussit.

### 3.1 En développement local (avec Stripe CLI)

1. **Installez Stripe CLI** : https://stripe.com/docs/stripe-cli

   ```bash
   # Windows (avec Scoop)
   scoop install stripe
   
   # macOS (avec Homebrew)
   brew install stripe/stripe-cli/stripe
   
   # Linux
   wget https://github.com/stripe/stripe-cli/releases/download/v1.19.4/stripe_1.19.4_linux_x86_64.tar.gz
   tar -xvf stripe_1.19.4_linux_x86_64.tar.gz
   ```

2. **Authentifiez-vous** :
   ```bash
   stripe login
   ```

3. **Démarrez le webhook forwarding** :
   ```bash
   stripe listen --forward-to localhost:4000/api/v2/webhooks/stripe
   ```

4. **Copiez le webhook secret** affiché (commence par `whsec_...`)
5. **Ajoutez-le** dans `apps/bridge/.env` :
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_LE_SECRET_AFFICHE_PAR_STRIPE_CLI
   ```

### 3.2 En production (webhook Stripe Dashboard)

1. Allez dans **Developers → Webhooks** : https://dashboard.stripe.com/webhooks
2. Cliquez sur **Add endpoint**
3. Configurez :
   - **Endpoint URL** : `https://votre-domaine.com/api/v2/webhooks/stripe`
   - **Events à écouter** :
     - `checkout.session.completed`
     - `checkout.session.expired`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`
4. Cliquez sur **Add endpoint**
5. Copiez le **Signing secret** (commence par `whsec_...`)
6. Ajoutez-le dans votre `.env` de production

---

## 🏗️ Étape 4 : Créer les produits Stripe

### Option A : Via Stripe Dashboard (Recommandé pour débuter)

1. Allez dans **Products** : https://dashboard.stripe.com/test/products
2. Cliquez sur **Add product**

#### Produit 1 : Contribution unique

- **Name** : Contribution Cipher Pulse
- **Description** : Soutenez le développement de Cipher Pulse
- **Pricing** :
  - Type : **One-time**
  - Price : Cochez **Customer chooses price**
  - Suggested amounts : 5, 10, 20, 50 (en EUR)
  - Minimum : 1 EUR
  - Maximum : 999 EUR
- **Payment method types** : Card, Google Pay, Apple Pay
- Cliquez sur **Save product**

#### Produit 2 : Abonnement Supporter (5€/mois)

- **Name** : Supporter Cipher Pulse
- **Description** : Soutien mensuel - Badge Supporter ❤️
- **Pricing** :
  - Type : **Recurring**
  - Price : 5 EUR
  - Billing period : **Monthly**
- **Payment method types** : Card
- Cliquez sur **Save product**

#### Produit 3 : Abonnement Patron (10€/mois)

- **Name** : Patron Cipher Pulse
- **Description** : Soutien mensuel - Badge Patron 🌟
- **Pricing** :
  - Type : **Recurring**
  - Price : 10 EUR
  - Billing period : **Monthly**
- **Payment method types** : Card
- Cliquez sur **Save product**

#### Produit 4 : Abonnement Héros (20€/mois)

- **Name** : Héros Cipher Pulse
- **Description** : Soutien mensuel - Badge Héros 💎 + Accès anticipé
- **Pricing** :
  - Type : **Recurring**
  - Price : 20 EUR
  - Billing period : **Monthly**
- **Payment method types** : Card
- Cliquez sur **Save product**

### Option B : Via code (je créerai un script automatisé)

Le backend créera automatiquement les produits au premier lancement si vous le souhaitez.

---

## ✅ Étape 5 : Vérifier l'installation

1. **Démarrez le backend** :
   ```bash
   cd apps/bridge
   npm run dev
   ```

2. **Démarrez le frontend** :
   ```bash
   cd apps/frontend
   npm run dev
   ```

3. **Testez un paiement** :
   - Allez sur `http://localhost:5173/contribute`
   - Cliquez sur "Contribuer"
   - Utilisez une **carte de test Stripe** : https://stripe.com/docs/testing
     - Carte qui réussit : `4242 4242 4242 4242`
     - Date : N'importe quelle date future
     - CVC : N'importe quel 3 chiffres
     - Code postal : N'importe lequel

4. **Vérifiez dans Stripe Dashboard** :
   - Allez dans **Payments** : https://dashboard.stripe.com/test/payments
   - Vous devriez voir votre paiement de test ✅

---

## 💳 Cartes de test Stripe

Pour tester différents scénarios :

| Carte | Résultat |
|-------|----------|
| `4242 4242 4242 4242` | ✅ Paiement réussi |
| `4000 0000 0000 0002` | ❌ Carte refusée |
| `4000 0000 0000 9995` | ❌ Fonds insuffisants |
| `4000 0025 0000 3155` | 🔐 Requiert 3D Secure |

Plus de cartes : https://stripe.com/docs/testing

---

## 🌍 Support multi-devises

Les devises suivantes sont configurées :

- **EUR** (Euro) - Par défaut
- **USD** (Dollar américain)
- **GBP** (Livre sterling)
- **CNY** (Yuan chinois)

Stripe convertit automatiquement selon le pays du donateur.

---

## 🔐 Sécurité - Checklist

Avant de passer en production :

- [ ] Les clés `sk_test_` sont remplacées par `sk_live_`
- [ ] Le webhook de production est configuré avec HTTPS
- [ ] Les variables `.env` ne sont PAS commitées dans Git
- [ ] Le mode TEST est désactivé dans Stripe Dashboard
- [ ] La vérification d'identité Stripe est complétée
- [ ] Les webhooks sont testés en production

---

## 🆘 Dépannage

### Erreur : "No such price"

→ Vous devez créer les produits dans Stripe Dashboard (Étape 4)

### Erreur : "Invalid API key"

→ Vérifiez que vous avez bien décommenté et rempli `STRIPE_SECRET_KEY` dans `.env`

### Erreur : "Webhook signature verification failed"

→ Vérifiez que `STRIPE_WEBHOOK_SECRET` correspond au secret du webhook actif

### Les paiements fonctionnent mais pas les webhooks

→ Assurez-vous que Stripe CLI est lancé (`stripe listen`) OU que le webhook est configuré dans le Dashboard

---

## 📚 Ressources

- [Documentation Stripe](https://stripe.com/docs)
- [Stripe CLI](https://stripe.com/docs/stripe-cli)
- [Cartes de test](https://stripe.com/docs/testing)
- [Webhooks](https://stripe.com/docs/webhooks)
- [Support Stripe](https://support.stripe.com)

---

## 🎉 Prêt à coder !

Une fois cette configuration terminée, je créerai :
1. ✅ Backend : Routes API + Service Stripe + Gestion webhooks
2. ✅ Frontend : Page Contribution + Modal de paiement + Badges
3. ✅ Base de données : Table `contributions` pour tracker les donateurs
4. ✅ UI élégante avec design glass-morphism cohérent avec Cipher Pulse

**Dites-moi quand vos clés Stripe sont prêtes et on commence le développement !** 🚀
