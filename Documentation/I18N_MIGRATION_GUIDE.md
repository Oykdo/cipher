# Guide de Migration i18n - Composants React

## 📖 Introduction

Ce guide explique comment migrer les composants React pour utiliser les traductions i18n au lieu de textes hardcodés.

---

## 🎯 Objectif

Remplacer tous les textes hardcodés dans les composants par des appels à `t()` (fonction de traduction).

**Avant** :
```typescript
<h1>Créer Votre Compte</h1>
<p>Choisissez votre méthode de sécurisation</p>
```

**Après** :
```typescript
const { t } = useTranslation();

<h1>{t('signup.title')}</h1>
<p>{t('signup.subtitle')}</p>
```

---

## 🛠️ Étapes de Migration

### 1. Importer useTranslation

```typescript
import { useTranslation } from 'react-i18next';
```

### 2. Utiliser le Hook dans le Composant

```typescript
function MyComponent() {
  const { t } = useTranslation();
  
  // ... reste du composant
}
```

### 3. Remplacer les Textes Hardcodés

#### Texte Simple
```typescript
// Avant
<h1>Créer Votre Compte</h1>

// Après
<h1>{t('signup.title')}</h1>
```

#### Texte avec Variables
```typescript
// Avant
<p>Série {currentSeriesIndex + 1} / {DICE_SERIES_COUNT}</p>

// Après
<p>{t('dicekey_input.series_progress', { 
  current: currentSeriesIndex + 1, 
  total: DICE_SERIES_COUNT 
})}</p>
```

#### Texte avec HTML
```typescript
// Avant
<p>⚠️ Notez ces checksums <strong>NUMÉROTÉS</strong> sur papier</p>

// Après
<p dangerouslySetInnerHTML={{ 
  __html: t('welcome.note_numbered') 
}} />
```

---

## 📝 Exemples de Migration

### Exemple 1 : SignupFluid.tsx - ChooseMethod

**Avant** :
```typescript
function ChooseMethod({ onSelect }: { onSelect: (method: 'standard' | 'dicekey') => void }) {
  const navigate = useNavigate();
  
  return (
    <motion.div className="flex items-center justify-center min-h-screen p-8">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-12">
          <motion.h1 className="text-5xl font-black mb-4 glow-text-cyan">
            Créer Votre Compte
          </motion.h1>
          <p className="text-soft-grey text-xl">
            Choisissez votre méthode de sécurisation
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <motion.button onClick={() => onSelect('standard')} className="glass-card p-8">
            <div className="text-4xl mb-4">🔑</div>
            <h3 className="text-2xl font-bold mb-3">Standard</h3>
            <p className="text-soft-grey mb-4">
              Mot de passe classique (BIP-39 ou custom)
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="badge badge-quantum">
                <span>⚡</span>
                <span>Rapide</span>
              </span>
              <span className="badge badge-trust">
                <span>🔒</span>
                <span>256 bits</span>
              </span>
            </div>
          </motion.button>

          <motion.button onClick={() => onSelect('dicekey')} className="glass-card p-8">
            <div className="text-4xl mb-4">🎲</div>
            <h3 className="text-2xl font-bold mb-3">
              DiceKey
              <span className="ml-2 text-sm badge badge-trust">RECOMMANDÉ</span>
            </h3>
            <p className="text-soft-grey mb-4">
              300 lancers de dés physiques pour sécurité maximale
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="badge badge-quantum">
                <span>🌌</span>
                <span>775 bits</span>
              </span>
              <span className="badge badge-trust">
                <span>🛡️</span>
                <span>Quantum-resistant</span>
              </span>
            </div>
          </motion.button>
        </div>

        <motion.p className="text-center text-muted-grey text-sm mt-8">
          💡 DiceKey offre une entropie supérieure et une sécurité post-quantique
        </motion.p>

        <motion.div className="text-center mt-6">
          <motion.button onClick={() => navigate('/')} className="btn btn-ghost">
            ← Retour à l'accueil
          </motion.button>
        </motion.div>
      </div>
    </motion.div>
  );
}
```

**Après** :
```typescript
function ChooseMethod({ onSelect }: { onSelect: (method: 'standard' | 'dicekey') => void }) {
  const navigate = useNavigate();
  const { t } = useTranslation(); // ✅ Ajout du hook
  
  return (
    <motion.div className="flex items-center justify-center min-h-screen p-8">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-12">
          <motion.h1 className="text-5xl font-black mb-4 glow-text-cyan">
            {t('signup.title')} {/* ✅ Traduction */}
          </motion.h1>
          <p className="text-soft-grey text-xl">
            {t('signup.subtitle')} {/* ✅ Traduction */}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <motion.button onClick={() => onSelect('standard')} className="glass-card p-8">
            <div className="text-4xl mb-4">🔑</div>
            <h3 className="text-2xl font-bold mb-3">{t('signup.method_standard')}</h3>
            <p className="text-soft-grey mb-4">
              {t('signup.method_standard_desc')}
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="badge badge-quantum">
                <span>⚡</span>
                <span>{t('signup.fast')}</span>
              </span>
              <span className="badge badge-trust">
                <span>🔒</span>
                <span>{t('signup.bits_256')}</span>
              </span>
            </div>
          </motion.button>

          <motion.button onClick={() => onSelect('dicekey')} className="glass-card p-8">
            <div className="text-4xl mb-4">🎲</div>
            <h3 className="text-2xl font-bold mb-3">
              {t('signup.method_dicekey')}
              <span className="ml-2 text-sm badge badge-trust">{t('signup.recommended')}</span>
            </h3>
            <p className="text-soft-grey mb-4">
              {t('signup.method_dicekey_desc')}
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="badge badge-quantum">
                <span>🌌</span>
                <span>{t('signup.bits_775')}</span>
              </span>
              <span className="badge badge-trust">
                <span>🛡️</span>
                <span>{t('signup.quantum_resistant')}</span>
              </span>
            </div>
          </motion.button>
        </div>

        <motion.p className="text-center text-muted-grey text-sm mt-8">
          {t('signup.dicekey_info')}
        </motion.p>

        <motion.div className="text-center mt-6">
          <motion.button onClick={() => navigate('/')} className="btn btn-ghost">
            {t('signup.back_home')}
          </motion.button>
        </motion.div>
      </div>
    </motion.div>
  );
}
```

---

### Exemple 2 : Welcome.tsx - Checksums Display

**Avant** :
```typescript
<motion.div className="glass-card p-6 mb-6">
  <div className="flex items-center justify-between mb-4">
    <h3 className="text-lg font-bold text-pure-white flex items-center gap-2">
      <span>📝</span>
      Vos Checksums de Vérification ({checksums.length} séries)
    </h3>
    <motion.button onClick={copyAllChecksums} className="px-3 py-2 text-sm">
      {copiedChecksums ? '✓ Copié' : '📋 Copier tout'}
    </motion.button>
  </div>

  <div className="grid grid-cols-5 gap-2">
    {checksums.map((checksum, idx) => (
      <motion.div key={idx} className="flex flex-col items-center gap-1">
        <span className="text-quantum-cyan text-xs font-bold">#{idx + 1}</span>
        <span className="checksum text-center text-sm">{checksum}</span>
      </motion.div>
    ))}
  </div>

  <p className="text-xs text-muted-grey mt-4 text-center">
    ⚠️ Notez ces checksums <strong>NUMÉROTÉS</strong> sur papier avec vos 300 lancers de dés
  </p>
</motion.div>
```

**Après** :
```typescript
const { t } = useTranslation(); // ✅ Ajout du hook

<motion.div className="glass-card p-6 mb-6">
  <div className="flex items-center justify-between mb-4">
    <h3 className="text-lg font-bold text-pure-white flex items-center gap-2">
      <span>📝</span>
      {t('welcome.checksums', { count: checksums.length })} {/* ✅ Avec variable */}
    </h3>
    <motion.button onClick={copyAllChecksums} className="px-3 py-2 text-sm">
      {copiedChecksums ? t('welcome.copied') : t('welcome.copy_all')} {/* ✅ Conditionnel */}
    </motion.button>
  </div>

  <div className="grid grid-cols-5 gap-2">
    {checksums.map((checksum, idx) => (
      <motion.div key={idx} className="flex flex-col items-center gap-1">
        <span className="text-quantum-cyan text-xs font-bold">
          {t('welcome.series_number', { number: idx + 1 })} {/* ✅ Avec variable */}
        </span>
        <span className="checksum text-center text-sm">{checksum}</span>
      </motion.div>
    ))}
  </div>

  <p 
    className="text-xs text-muted-grey mt-4 text-center"
    dangerouslySetInnerHTML={{ __html: t('welcome.note_numbered') }} {/* ✅ Avec HTML */}
  />
</motion.div>
```

---

### Exemple 3 : DiceKeyInputFluid.tsx - Instructions

**Avant** :
```typescript
<AnimatePresence>
  {showInstructions && (
    <motion.div className="glass-card mb-6 p-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl">💡</span>
        <div className="flex-1">
          <h4 className="font-semibold text-pure-white mb-1">Comment procéder</h4>
          <p className="text-sm text-soft-grey">
            Lancez 10 dés physiques, saisissez leurs valeurs (1-6).
            Chaque série validée ajoute une étoile à votre constellation unique.
          </p>
        </div>
        <button onClick={() => setShowInstructions(false)}>
          ✕
        </button>
      </div>
    </motion.div>
  )}
</AnimatePresence>
```

**Après** :
```typescript
const { t } = useTranslation(); // ✅ Ajout du hook

<AnimatePresence>
  {showInstructions && (
    <motion.div className="glass-card mb-6 p-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl">💡</span>
        <div className="flex-1">
          <h4 className="font-semibold text-pure-white mb-1">
            {t('dicekey_input.instructions_title')} {/* ✅ Traduction */}
          </h4>
          <p className="text-sm text-soft-grey">
            {t('dicekey_input.instructions_desc')} {/* ✅ Traduction */}
          </p>
        </div>
        <button onClick={() => setShowInstructions(false)}>
          {t('dicekey_input.close')} {/* ✅ Traduction */}
        </button>
      </div>
    </motion.div>
  )}
</AnimatePresence>
```

---

## 🔍 Cas Particuliers

### 1. Texte avec Pluralisation

```typescript
// JSON
{
  "dicekey_input": {
    "stars_count": "{{count}} / {{total}} étoile",
    "stars_count_plural": "{{count}} / {{total}} étoiles"
  }
}

// Composant
{t('dicekey_input.stars_count', { 
  count: stars.length, 
  total: DICE_SERIES_COUNT 
})}
```

### 2. Texte avec Formatage de Date

```typescript
// JSON
{
  "settings": {
    "created_at": "Créé le {{date}}"
  }
}

// Composant
{t('settings.general_settings.created_at', { 
  date: new Date(user.createdAt).toLocaleDateString() 
})}
```

### 3. Texte avec Lien

```typescript
// JSON
{
  "auth": {
    "no_account": "Pas encore de compte ?",
    "create_now": "Créez-en un maintenant →"
  }
}

// Composant
<p>
  {t('auth.no_account')}{' '}
  <Link to="/signup">{t('auth.create_now')}</Link>
</p>
```

### 4. Texte avec Condition

```typescript
// JSON
{
  "dicekey_input": {
    "validate_series": "Valider cette série →",
    "finish_generate": "Terminer et générer les clés ✨"
  }
}

// Composant
<button>
  {currentSeriesIndex < DICE_SERIES_COUNT - 1
    ? t('dicekey_input.validate_series')
    : t('dicekey_input.finish_generate')}
</button>
```

---

## ✅ Checklist de Migration

Pour chaque composant :

- [ ] Importer `useTranslation` depuis `react-i18next`
- [ ] Ajouter `const { t } = useTranslation();` dans le composant
- [ ] Identifier tous les textes hardcodés
- [ ] Vérifier que les clés existent dans `fr.json` et `en.json`
- [ ] Remplacer les textes par `t('section.key')`
- [ ] Gérer les variables avec `t('section.key', { variable: value })`
- [ ] Gérer le HTML avec `dangerouslySetInnerHTML`
- [ ] Tester en français
- [ ] Tester en anglais
- [ ] Tester le changement de langue en temps réel
- [ ] Vérifier qu'aucun texte hardcodé ne reste

---

## 🎯 Ordre de Migration Recommandé

1. **SignupFluid.tsx** (Priorité haute)
   - ChooseMethod
   - UsernameStep
   - StandardLengthChoice
   - StandardMnemonicDisplay
   - StandardVerification
   - StandardWelcome
   - StandardPasswordForm

2. **Welcome.tsx** (Priorité haute)
   - Affichage de l'identifiant
   - Affichage des checksums
   - Vérification

3. **DiceKeyInputFluid.tsx** (Priorité moyenne)
   - Instructions
   - Progression
   - Constellation
   - Checksums

4. **CosmicLoader.tsx** (Priorité moyenne)
   - Titre
   - Étapes de génération
   - Badges

5. **DiceKeyResults.tsx** (Priorité moyenne)
   - Résultats
   - Clés générées
   - Avertissements

---

## 🧪 Tests

### Test Manuel

1. Lancer l'application en français
2. Naviguer vers chaque page migrée
3. Vérifier que tous les textes sont en français
4. Changer la langue en anglais
5. Vérifier que tous les textes changent instantanément
6. Vérifier qu'aucun texte hardcodé ne reste visible

### Test Automatisé (Optionnel)

```typescript
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n';

describe('SignupFluid', () => {
  it('should display French text', () => {
    i18n.changeLanguage('fr');
    render(
      <I18nextProvider i18n={i18n}>
        <SignupFluid />
      </I18nextProvider>
    );
    expect(screen.getByText('Créer Votre Compte')).toBeInTheDocument();
  });

  it('should display English text', () => {
    i18n.changeLanguage('en');
    render(
      <I18nextProvider i18n={i18n}>
        <SignupFluid />
      </I18nextProvider>
    );
    expect(screen.getByText('Create Your Account')).toBeInTheDocument();
  });
});
```

---

## 📚 Ressources

- [react-i18next Documentation](https://react.i18next.com/)
- [i18next Documentation](https://www.i18next.com/)
- [Interpolation](https://www.i18next.com/translation-function/interpolation)
- [Pluralization](https://www.i18next.com/translation-function/plurals)
- [Formatting](https://www.i18next.com/translation-function/formatting)

---

## 💡 Bonnes Pratiques

1. **Nommage des Clés**
   - Utiliser la notation pointée : `section.subsection.key`
   - Être descriptif : `signup.method_standard_desc` plutôt que `signup.desc1`
   - Grouper par fonctionnalité : `signup.*`, `welcome.*`, etc.

2. **Organisation**
   - Une section par page/composant principal
   - Sous-sections pour les composants enfants
   - Clés communes dans `common.*`

3. **Variables**
   - Utiliser des noms de variables clairs : `{{count}}`, `{{username}}`, `{{date}}`
   - Documenter les variables attendues dans les commentaires

4. **HTML**
   - Éviter autant que possible
   - Si nécessaire, utiliser `dangerouslySetInnerHTML`
   - Valider le HTML pour éviter les failles XSS

5. **Performance**
   - `useTranslation()` est optimisé et ne cause pas de re-renders inutiles
   - Éviter de créer des fonctions de traduction dans le render

---

## 🎉 Résultat Attendu

Après migration complète :

- ✅ Aucun texte hardcodé dans les composants
- ✅ Changement de langue instantané
- ✅ Maintenance facilitée (textes centralisés)
- ✅ Ajout de nouvelles langues simplifié
- ✅ Meilleure expérience utilisateur internationale

---

**Date de création** : 20 Janvier 2025  
**Auteur** : Équipe de développement  
**Version** : 1.0
