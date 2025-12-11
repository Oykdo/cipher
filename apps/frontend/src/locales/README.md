# 🌍 Internationalisation (i18n)

Ce dossier contient tous les fichiers de traduction pour l'application.

---

## 📁 Structure

```
locales/
├── fr.json      # Français (100% - 527 clés) ✅
├── en.json      # Anglais (100% - 527 clés) ✅
├── de.json      # Allemand (100% - 527 clés) ✅
├── es.json      # Espagnol (100% - 527 clés) ✅
├── zh-CN.json   # Chinois (100% - 527 clés) ✅
├── it.json      # Italien (100% - 527 clés) ✅
└── README.md    # Ce fichier
```

---

## 🎯 Langues Supportées

| Langue | Code | Statut | Clés | Couverture |
|--------|------|--------|------|------------|
| 🇫🇷 Français | `fr` | ✅ Complet | 527 | 100% |
| 🇬🇧 Anglais | `en` | ✅ Complet | 527 | 100% |
| 🇩🇪 Allemand | `de` | ✅ Complet | 527 | 100% |
| 🇪🇸 Espagnol | `es` | ✅ Complet | 527 | 100% |
| 🇨🇳 Chinois | `zh-CN` | ✅ Complet | 527 | 100% |
| 🇮🇹 Italien | `it` | ✅ Complet | 527 | 100% |

---

## 📚 Sections Disponibles

### Sections Principales (527 clés)

| Section | Clés | Description |
|---------|------|-------------|
| `common` | 17 | Textes communs (boutons, labels, etc.) |
| `app` | 2 | Informations de l'application |
| `auth` | 121 | Authentification et connexion |
| `landing` | 17 | Page d'accueil |
| `conversations` | 9 | Liste des conversations |
| `messages` | 6 | Messages et fonctionnalités |
| `settings` | 106 | Paramètres de l'application |
| `discover` | 59 | Page de découverte |
| `recovery` | 19 | Récupération de compte |
| `errors` | 3 | Messages d'erreur |
| `notfound` | 5 | Page 404 |

### Nouvelles Sections (163 clés) 🆕

| Section | Clés | Description |
|---------|------|-------------|
| `signup` | 65 | Processus d'inscription |
| `welcome` | 29 | Page de bienvenue après création |
| `dicekey_input` | 25 | Saisie des 300 dés |
| `cosmic_loader` | 15 | Animation de génération |
| `dicekey_results` | 29 | Résultats de génération |

---

## 🛠️ Utilisation

### Dans un Composant React

```typescript
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation();
  
  return (
    <div>
      <h1>{t('signup.title')}</h1>
      <p>{t('signup.subtitle')}</p>
    </div>
  );
}
```

### Avec Variables

```typescript
// JSON
{
  "dicekey_input": {
    "series_progress": "Série {{current}} / {{total}}"
  }
}

// Composant
{t('dicekey_input.series_progress', { 
  current: 5, 
  total: 30 
})}
```

### Avec HTML

```typescript
// JSON
{
  "welcome": {
    "note_numbered": "⚠️ Notez ces checksums <strong>NUMÉROTÉS</strong> sur papier"
  }
}

// Composant
<p dangerouslySetInnerHTML={{ 
  __html: t('welcome.note_numbered') 
}} />
```

### Changement de Langue

```typescript
import { useTranslation } from 'react-i18next';

function LanguageSelector() {
  const { i18n } = useTranslation();
  
  return (
    <select 
      value={i18n.language} 
      onChange={(e) => i18n.changeLanguage(e.target.value)}
    >
      <option value="fr">Français</option>
      <option value="en">English</option>
      <option value="de">Deutsch</option>
      <option value="es">Español</option>
      <option value="zh-CN">中文</option>
      <option value="it">Italiano</option>
    </select>
  );
}
```

---

## ✅ Vérification des Traductions

Un script de vérification est disponible pour s'assurer que toutes les clés sont présentes :

```bash
node scripts/check-i18n-keys.cjs
```

Ce script vérifie :
- ✅ Nombre de clés par langue
- ✅ Cohérence entre FR et EN
- ✅ Couverture des autres langues
- ✅ Sections principales
- ✅ Nouvelles sections ajoutées

---

## 📝 Ajouter une Nouvelle Traduction

### 1. Ajouter la Clé dans `fr.json` et `en.json`

```json
// fr.json
{
  "section": {
    "new_key": "Nouveau texte en français"
  }
}

// en.json
{
  "section": {
    "new_key": "New text in English"
  }
}
```

### 2. Utiliser dans le Composant

```typescript
{t('section.new_key')}
```

### 3. Vérifier

```bash
node scripts/check-i18n-keys.cjs
```

---

## 🌍 Ajouter une Nouvelle Langue

### 1. Créer le Fichier

Créer un nouveau fichier `xx.json` (où `xx` est le code de langue) :

```json
{
  "common": {
    "save": "...",
    "cancel": "...",
    // ... copier toutes les clés depuis fr.json ou en.json
  }
}
```

### 2. Configurer i18n

Ajouter la langue dans `apps/frontend/src/i18n.ts` :

```typescript
import xx from './locales/xx.json';

i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
    xx: { translation: xx }, // ✅ Nouvelle langue
  },
  // ...
});
```

### 3. Ajouter au Sélecteur

Ajouter l'option dans le sélecteur de langue :

```typescript
<option value="xx">Langue</option>
```

---

## 📖 Conventions de Nommage

### Structure des Clés

```
section.subsection.key
```

**Exemples** :
- `signup.title` - Titre de la page d'inscription
- `signup.method_standard` - Méthode standard
- `dicekey_input.series_progress` - Progression des séries

### Bonnes Pratiques

1. **Être descriptif** : `signup.method_standard_desc` plutôt que `signup.desc1`
2. **Grouper par fonctionnalité** : `signup.*`, `welcome.*`, etc.
3. **Utiliser des noms de variables clairs** : `{{count}}`, `{{username}}`, `{{date}}`
4. **Éviter le HTML** : Sauf si absolument nécessaire
5. **Rester cohérent** : Suivre la structure existante

---

## 🔧 Outils

### Script de Vérification

```bash
node scripts/check-i18n-keys.cjs
```

Affiche :
- 📊 Statistiques générales
- 🔍 Cohérence FR ↔ EN
- 🌍 Couverture des autres langues
- 📁 Sections principales
- 🆕 Nouvelles sections
- 📋 Résumé

### Extraction des Clés Manquantes

```bash
node -e "
const fr = require('./apps/frontend/src/locales/fr.json');
const de = require('./apps/frontend/src/locales/de.json');

const getAllKeys = (obj, prefix = '') => {
  let keys = [];
  for (const key in obj) {
    const fullKey = prefix + key;
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      keys = keys.concat(getAllKeys(obj[key], fullKey + '.'));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
};

const frKeys = getAllKeys(fr);
const deKeys = getAllKeys(de);
const missing = frKeys.filter(k => !deKeys.includes(k));

console.log('Clés manquantes dans de.json:', missing.length);
missing.forEach(k => console.log('  -', k));
"
```

---

## 📚 Documentation Complète

Pour plus d'informations, consultez :

- **Documentation/I18N_FINALIZATION_COMPLETE_2025-01-20.md** - Résumé complet
- **Documentation/I18N_MIGRATION_GUIDE.md** - Guide de migration React
- **I18N_COMPLETE_SUMMARY.md** - Vue d'ensemble du projet

---

## 🎉 Statut Actuel

- ✅ **FR et EN** : 100% complétés (527 clés chacun)
- ✅ **DE, ES, ZH-CN, IT** : 100% complétés (527 clés chacun)
- ✅ **Nouvelles sections** : Toutes créées et traduites (Toutes langues)
- ✅ **Migration React** : Terminée

---

**Dernière mise à jour** : 20 Novembre 2025
**Version** : 1.1
**Mainteneur** : Équipe de développement
