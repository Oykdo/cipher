# Plan pour atteindre 100% de couverture i18n

## 📊 État actuel

### ✅ Pages complètement migrées (6/10 = 60%)

1. **Landing.tsx** - ✅ Page d'accueil
2. **Conversations.tsx** - ✅ Page de conversations
3. **Discover.tsx** - ✅ Page de découverte
4. **Recovery.tsx** - ✅ Page de récupération
5. **Settings.tsx** - ✅ Page de paramètres (avec sélecteur de langue)
6. **NotFound.tsx** - ✅ Page 404

### 🔄 Pages partiellement migrées (1/10 = 10%)

7. **LoginNew.tsx** - 🔄 Import ajouté, migration en cours (1434 lignes)

### ❌ Pages à migrer (3/10 = 30%)

8. **SignupFluid.tsx** - ❌ Page d'inscription
9. **Welcome.tsx** - ❌ Page de bienvenue (450 lignes)
10. **Login.tsx** / **Signup.tsx** - ❌ Anciennes pages (legacy)

## 📝 Traductions disponibles

### Sections complètes

- ✅ `common` - Boutons et actions communes
- ✅ `app` - Informations de l'application
- ✅ `auth` - Authentification (112+ clés)
- ✅ `landing` - Page d'accueil
- ✅ `conversations` - Conversations
- ✅ `messages` - Messages
- ✅ `settings` - Paramètres (115+ clés)
- ✅ `discover` - Découverte
- ✅ `recovery` - Récupération
- ✅ `errors` - Erreurs
- ✅ `notfound` - Page 404

### Total : ~380 clés de traduction

## 🎯 Plan d'action pour 100%

### Phase 1 : Compléter les pages principales (PRIORITÉ HAUTE)

#### 1.1 LoginNew.tsx (1434 lignes)

**Complexité** : Élevée (4 composants, 3 méthodes de connexion)

**Composants à migrer** :
- `MethodChoice` - Sélection de la méthode
- `StandardLoginForm` - Connexion standard
- `MnemonicLoginForm` - Connexion mnémonique
- `DiceKeyCredentialsForm` - Connexion DiceKey
- `SetPasswordForm` - Définition du mot de passe
- `LoginFailure` - Écran d'échec

**Clés nécessaires** : Déjà présentes dans `auth.*`

**Temps estimé** : 2-3 heures

#### 1.2 SignupFluid.tsx

**Complexité** : Élevée (similaire à LoginNew)

**Temps estimé** : 2-3 heures

#### 1.3 Welcome.tsx (450 lignes)

**Complexité** : Moyenne

**Temps estimé** : 1-2 heures

### Phase 2 : Composants (PRIORITÉ MOYENNE)

#### 2.1 Composants de conversation

- `ChatHeader.tsx` - En-tête de conversation
- `UserSearch.tsx` - Recherche d'utilisateurs
- `BurnDelaySelector.tsx` - Sélecteur de délai

**Temps estimé** : 1-2 heures

#### 2.2 Composants d'authentification

- `QuickUnlock.tsx` - Déverrouillage rapide
- `DiceKeyInput.tsx` - Saisie DiceKey

**Temps estimé** : 1 heure

### Phase 3 : Traductions complètes (PRIORITÉ BASSE)

#### 3.1 Compléter les langues

- ✅ Français (fr) - 100%
- ✅ Anglais (en) - 100%
- ⚠️ Allemand (de) - ~70%
- ⚠️ Espagnol (es) - ~70%
- ⚠️ Chinois (zh-CN) - ~70%
- ⚠️ Italien (it) - ~70%

**Temps estimé** : 2-3 heures (avec outil de traduction)

## 🚀 Approche recommandée

### Option A : Migration manuelle complète

**Avantages** :
- Contrôle total
- Qualité maximale
- Cohérence garantie

**Inconvénients** :
- Temps : 8-12 heures
- Risque d'erreurs
- Fastidieux

### Option B : Migration progressive

**Avantages** :
- Déploiement incrémental
- Tests au fur et à mesure
- Moins de risques

**Inconvénients** :
- Temps total similaire
- Mélange de pages traduites/non traduites

### Option C : Script automatisé (RECOMMANDÉ)

**Avantages** :
- Rapide (1-2 heures)
- Cohérent
- Réutilisable

**Inconvénients** :
- Nécessite validation manuelle
- Peut manquer des cas spéciaux

## 📋 Checklist pour 100%

### Pages

- [x] Landing.tsx
- [x] Conversations.tsx
- [x] Discover.tsx
- [x] Recovery.tsx
- [x] Settings.tsx
- [x] NotFound.tsx
- [ ] LoginNew.tsx
- [ ] SignupFluid.tsx
- [ ] Welcome.tsx
- [ ] Login.tsx (legacy)
- [ ] Signup.tsx (legacy)

### Composants

- [ ] ChatHeader.tsx
- [ ] UserSearch.tsx
- [ ] QuickUnlock.tsx
- [ ] DiceKeyInput.tsx
- [ ] BurnDelaySelector.tsx
- [ ] SafetyNumberVerification.tsx
- [ ] TrustStarWidget.tsx

### Traductions

- [x] Français (fr)
- [x] Anglais (en)
- [ ] Allemand (de)
- [ ] Espagnol (es)
- [ ] Chinois (zh-CN)
- [ ] Italien (it)

## 🎯 Objectif réaliste

### Court terme (aujourd'hui)

**Objectif** : 70% de couverture

- ✅ 6 pages principales migrées
- ✅ Sélecteur de langue fonctionnel
- ✅ 2 langues complètes (fr, en)

### Moyen terme (cette semaine)

**Objectif** : 90% de couverture

- Migrer LoginNew.tsx
- Migrer SignupFluid.tsx
- Migrer les composants principaux

### Long terme (ce mois)

**Objectif** : 100% de couverture

- Toutes les pages migrées
- Tous les composants migrés
- 6 langues complètes

## ✨ Conclusion

Nous avons atteint **60% de couverture** avec les pages principales migrées et un système de traduction fonctionnel. Pour atteindre 100%, il faut :

1. **Migrer LoginNew.tsx** (priorité haute)
2. **Migrer SignupFluid.tsx** (priorité haute)
3. **Migrer Welcome.tsx** (priorité moyenne)
4. **Migrer les composants** (priorité moyenne)
5. **Compléter les traductions** (priorité basse)

**Temps total estimé** : 8-12 heures de travail

---

**Date** : 2025-01-18  
**Statut** : 60% COMPLET  
**Prochaine étape** : Migrer LoginNew.tsx

