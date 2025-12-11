# Mapping des traductions pour LoginNew.tsx

## Textes à remplacer

### Titres et en-têtes

| Texte hardcodé | Clé i18n | Statut |
|----------------|----------|--------|
| "Connexion" | `auth.login` | ✅ Existe |
| "🔑 Connexion Standard" | `auth.standard_login` | ✅ Existe |
| "📝 Phrase Mnémonique" | `auth.mnemonic_title` | ✅ Existe |
| "🎲 Connexion DiceKey" | `auth.dicekey_login` | ✅ Existe |

### Boutons

| Texte hardcodé | Clé i18n | Statut |
|----------------|----------|--------|
| "Se connecter 🔐" | `auth.login_button` + " 🔐" | ✅ Existe |
| "Connexion..." | `auth.connecting` | ✅ Existe |
| "← Retour" | `common.back` | ✅ Existe |

### Messages d'erreur

| Texte hardcodé | Clé i18n | Statut |
|----------------|----------|--------|
| "Erreur de connexion" | `auth.login_error` | ✅ Existe |
| "Échec de la connexion" | `auth.login_failed` | ✅ Existe |

### Placeholders

| Texte hardcodé | Clé i18n | Statut |
|----------------|----------|--------|
| "Votre nom d'utilisateur" | `auth.your_username` | ✅ Existe |
| "Mot de passe" | `auth.password` | ✅ Existe |

### Descriptions

| Texte hardcodé | Clé i18n | Statut |
|----------------|----------|--------|
| "Quick Unlock" | `auth.quick_unlock` | ✅ Existe |
| "Rapide" | `auth.fast` | ✅ Existe |
| "Cet appareil" | `auth.this_device` | ✅ Existe |
| "Portable" | `auth.portable` | ✅ Existe |
| "Multi-appareils" | `auth.multi_device` | ✅ Existe |
| "ULTRA-SÉCURISÉ" | `auth.ultra_secure` | ✅ Existe |

## Approche de migration

### Étape 1 : Ajouter t aux props des composants

```typescript
interface ComponentProps {
  // ... autres props
  t: TFunction; // Ajouter cette ligne
}
```

### Étape 2 : Remplacer les textes hardcodés

```typescript
// Avant
<h2>Connexion</h2>

// Après
<h2>{t('auth.login')}</h2>
```

### Étape 3 : Gérer les textes composés

```typescript
// Avant
<button>Se connecter 🔐</button>

// Après
<button>{t('auth.login_button')} 🔐</button>
```

## Composants à migrer

### 1. MethodChoice

- [x] Ajouter `t` aux props
- [ ] Remplacer "Connexion"
- [ ] Remplacer "Quick Unlock"
- [ ] Remplacer "Phrase Mnémonique"
- [ ] Remplacer "DiceKey"

### 2. StandardLoginForm

- [x] Ajouter `t` aux props
- [ ] Remplacer "🔑 Connexion Standard"
- [ ] Remplacer placeholders
- [ ] Remplacer boutons
- [ ] Remplacer messages d'erreur

### 3. MnemonicLoginForm

- [x] Ajouter `t` aux props
- [ ] Remplacer "📝 Phrase Mnémonique"
- [ ] Remplacer placeholders
- [ ] Remplacer boutons

### 4. DiceKeyCredentialsForm

- [x] Ajouter `t` aux props
- [ ] Remplacer "🎲 Connexion DiceKey"
- [ ] Remplacer placeholders
- [ ] Remplacer boutons

### 5. SetPasswordForm

- [x] Ajouter `t` aux props
- [ ] Remplacer "Définir un mot de passe"
- [ ] Remplacer placeholders
- [ ] Remplacer boutons

### 6. LoginFailure

- [ ] Ajouter `t` aux props
- [ ] Remplacer "Échec de Connexion"
- [ ] Remplacer messages

## Estimation

- **Temps estimé** : 2-3 heures
- **Complexité** : Élevée
- **Nombre de remplacements** : ~150-200
- **Nombre de composants** : 6

## Statut

- [x] Import useTranslation ajouté
- [x] Hook t ajouté dans LoginNew
- [x] Props t ajoutées aux composants enfants
- [ ] Textes remplacés dans MethodChoice
- [ ] Textes remplacés dans StandardLoginForm
- [ ] Textes remplacés dans MnemonicLoginForm
- [ ] Textes remplacés dans DiceKeyCredentialsForm
- [ ] Textes remplacés dans SetPasswordForm
- [ ] Textes remplacés dans LoginFailure

