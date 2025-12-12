# 💳 Plan d'Implémentation Stripe - Cipher Pulse

## ✅ Étape 1 : Configuration (COMPLÉTÉ)

### Ce qui a été fait :

✅ **Structure de configuration créée**
- `apps/frontend/.env.example` - Template avec variables Stripe frontend
- `apps/bridge/.env.example` - Template avec variables Stripe backend
- `STRIPE_SETUP_GUIDE.md` - Guide complet d'installation

✅ **Variables d'environnement préparées**
- `VITE_STRIPE_PUBLISHABLE_KEY` - Clé publique Stripe (frontend)
- `STRIPE_SECRET_KEY` - Clé secrète Stripe (backend)
- `STRIPE_WEBHOOK_SECRET` - Secret webhook pour vérification
- `FRONTEND_URL` - URL de redirection après paiement
- `SUPPORTED_CURRENCIES` - EUR, USD, GBP, CNY
- `DEFAULT_CURRENCY` - EUR

✅ **Sécurité**
- `.gitignore` protège les fichiers `.env`
- Documentation des bonnes pratiques
- Checklist de sécurité pour la production

---

## 🔄 Étape 2 : À faire par le développeur (VOUS)

### Actions requises :

1. **Récupérer les clés Stripe**
   - Aller sur https://dashboard.stripe.com/test/apikeys
   - Copier `pk_test_...` et `sk_test_...`
   - Voir `STRIPE_SETUP_GUIDE.md` pour les détails

2. **Ajouter les clés dans les `.env`**
   ```bash
   # apps/frontend/.env.development
   VITE_STRIPE_PUBLISHABLE_KEY=pk_test_VOTRE_CLE_ICI
   
   # apps/bridge/.env
   STRIPE_SECRET_KEY=sk_test_VOTRE_CLE_ICI
   ```

3. **Installer Stripe CLI** (pour webhooks en dev)
   ```bash
   # Voir STRIPE_SETUP_GUIDE.md section "Webhooks"
   stripe login
   stripe listen --forward-to localhost:4000/api/v2/webhooks/stripe
   ```

4. **Créer les produits Stripe**
   - Option A : Via Dashboard (voir guide)
   - Option B : Script automatisé (je le créerai)

---

## 🚧 Étape 3 : Développement Backend (À VENIR)

### À créer :

#### 3.1 Base de données - Migration SQL

**Nouvelle table : `contributions`**
```sql
CREATE TABLE contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  stripe_customer_id VARCHAR(255),
  stripe_payment_intent_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  
  type VARCHAR(20) NOT NULL, -- 'one_time' | 'subscription'
  status VARCHAR(20) NOT NULL, -- 'pending' | 'succeeded' | 'failed' | 'canceled'
  
  amount INTEGER NOT NULL, -- en centimes (ex: 1000 = 10.00 EUR)
  currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
  
  tier VARCHAR(50), -- NULL pour one-time, 'supporter' | 'patron' | 'hero' pour subscriptions
  
  metadata JSONB, -- Données additionnelles
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_contributions_user_id ON contributions(user_id);
CREATE INDEX idx_contributions_stripe_customer_id ON contributions(stripe_customer_id);
CREATE INDEX idx_contributions_status ON contributions(status);
```

**Nouvelle colonne : `users.contribution_tier`**
```sql
ALTER TABLE users
ADD COLUMN contribution_tier VARCHAR(50) DEFAULT NULL,
ADD COLUMN contribution_active BOOLEAN DEFAULT FALSE,
ADD COLUMN contribution_since TIMESTAMP DEFAULT NULL;
```

#### 3.2 Service Stripe

**Fichier : `apps/bridge/src/services/stripe-service.ts`**

Fonctions à créer :
- `initializeStripe()` - Initialiser le client Stripe
- `createCheckoutSession()` - Créer session de paiement
- `createSubscriptionCheckout()` - Créer session d'abonnement
- `cancelSubscription()` - Annuler un abonnement
- `getCustomerPortalUrl()` - Portail de gestion client
- `handleWebhookEvent()` - Traiter les événements webhook

#### 3.3 Routes API

**Fichier : `apps/bridge/src/routes/payments.ts`**

Endpoints à créer :
```typescript
POST   /api/v2/payments/create-checkout
  Body: { type, amount?, tier?, currency? }
  Returns: { sessionId, url }

POST   /api/v2/payments/create-subscription
  Body: { tier, currency? }
  Returns: { sessionId, url }

GET    /api/v2/payments/success?session_id=xxx
  Returns: { status, contribution }

GET    /api/v2/payments/cancel
  Returns: { message }

POST   /api/v2/payments/cancel-subscription
  Body: { subscriptionId }
  Returns: { success }

GET    /api/v2/payments/portal
  Returns: { url }

GET    /api/v2/payments/my-contributions
  Returns: { contributions: [...] }
```

#### 3.4 Webhooks

**Fichier : `apps/bridge/src/webhooks/stripe-webhook.ts`**

Events à gérer :
- `checkout.session.completed` - Paiement réussi
- `checkout.session.expired` - Session expirée
- `customer.subscription.created` - Abonnement créé
- `customer.subscription.updated` - Abonnement modifié
- `customer.subscription.deleted` - Abonnement annulé
- `payment_intent.succeeded` - Paiement confirmé
- `payment_intent.payment_failed` - Paiement échoué

---

## 🎨 Étape 4 : Développement Frontend (À VENIR)

### À créer :

#### 4.1 Configuration Stripe

**Fichier : `apps/frontend/src/lib/stripe.ts`**
```typescript
import { loadStripe } from '@stripe/stripe-js';

export const stripePromise = loadStripe(
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
);
```

#### 4.2 Composants de paiement

**1. Page principale : `apps/frontend/src/screens/Contribute.tsx`**
- Présentation du projet
- Grille de prix (one-time + subscriptions)
- Statistiques (objectif mensuel, nb supporters)
- Liste des contributeurs (optionnel, anonymisé)

**2. Modal de paiement : `apps/frontend/src/components/payments/ContributionModal.tsx`**
- Sélection montant (one-time)
- Sélection tier (subscription)
- Sélection devise (EUR/USD/GBP/CNY)
- Bouton "Contribuer avec Stripe"

**3. Grille de prix : `apps/frontend/src/components/payments/PricingTiers.tsx`**
- Card pour chaque tier
- Highlights des avantages
- Boutons CTA

**4. Success page : `apps/frontend/src/components/payments/PaymentSuccess.tsx`**
- Message de remerciement
- Détails de la contribution
- Badge obtenu
- Bouton retour

**5. Badge : `apps/frontend/src/components/payments/ContributionBadge.tsx`**
- Badge "Supporter ❤️" sur profil
- Badge "Patron 🌟" sur profil
- Badge "Héros 💎" sur profil

#### 4.3 Routes

**Fichier : `apps/frontend/src/App.tsx`**
```typescript
<Route path="/contribute" element={<Contribute />} />
<Route path="/contribute/success" element={<PaymentSuccess />} />
<Route path="/contribute/cancel" element={<PaymentCancel />} />
```

#### 4.4 Traductions

**Fichiers : `apps/frontend/src/locales/*.json`**

Clés à ajouter :
```json
{
  "contribute": {
    "title": "Soutenez Cipher Pulse",
    "subtitle": "Aidez-nous à garder le projet gratuit et sans publicité",
    "one_time": "Don unique",
    "subscription": "Soutien mensuel",
    "supporter_tier": "Supporter",
    "patron_tier": "Patron",
    "hero_tier": "Héros",
    "benefits": {
      "supporter": ["Badge Supporter ❤️", "Remerciement sur le site"],
      "patron": ["Badge Patron 🌟", "Nom dans les crédits", "Accès au Discord"],
      "hero": ["Badge Héros 💎", "Accès anticipé", "Influence sur roadmap"]
    }
  }
}
```

---

## 📊 Étape 5 : Fonctionnalités avancées (OPTIONNEL)

### Phase 2 (après MVP) :

- [ ] Dashboard contributeur avec historique
- [ ] Reçus fiscaux automatiques (PDF)
- [ ] Goal widget (barre de progression vers objectif)
- [ ] Hall of Fame des top contributeurs
- [ ] Export des contributions (comptabilité)
- [ ] Refunds via interface admin
- [ ] Webhooks Slack/Discord pour notifications
- [ ] A/B testing des pricing tiers
- [ ] Coupons et codes promo

---

## 🎯 Ordre d'implémentation recommandé

1. **Backend d'abord** (plus critique)
   - Migration SQL
   - Service Stripe
   - Routes API
   - Webhooks

2. **Frontend ensuite**
   - Page Contribute
   - Modal de paiement
   - Success/Cancel pages
   - Badges sur profil

3. **Tests**
   - Paiements one-time
   - Abonnements
   - Webhooks
   - Gestion d'erreurs

4. **Production**
   - Passer en mode LIVE
   - Configurer webhooks prod
   - Monitoring Stripe
   - Support client

---

## 📦 Packages NPM à installer

### Frontend
```bash
cd apps/frontend
npm install @stripe/stripe-js @stripe/react-stripe-js
```

### Backend
```bash
cd apps/bridge
npm install stripe
npm install --save-dev @types/stripe
```

---

## 🔗 Liens utiles

- [Stripe Dashboard](https://dashboard.stripe.com)
- [Stripe API Docs](https://stripe.com/docs/api)
- [Stripe Checkout](https://stripe.com/docs/payments/checkout)
- [Stripe Webhooks](https://stripe.com/docs/webhooks)
- [Cartes de test](https://stripe.com/docs/testing)

---

## ✅ Checklist avant production

- [ ] Migration SQL exécutée en production
- [ ] Clés LIVE Stripe configurées
- [ ] Webhook HTTPS configuré dans Dashboard
- [ ] Produits créés en mode LIVE
- [ ] Tests de paiement réussis
- [ ] Emails de confirmation fonctionnels
- [ ] Badges affichés correctement
- [ ] Gestion d'erreurs complète
- [ ] Logs et monitoring en place
- [ ] Page "Contribuer" traduite dans toutes les langues

---

## 🚀 Prochaine étape

**Une fois vos clés Stripe ajoutées dans les `.env`, dites-moi et je commence à coder :**

1. ✅ Migration SQL de la table `contributions`
2. ✅ Service Stripe complet
3. ✅ Routes API backend
4. ✅ Webhooks sécurisés
5. ✅ Interface frontend élégante

**Prêt quand vous l'êtes !** 🎉
