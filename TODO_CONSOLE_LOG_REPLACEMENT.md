# 📋 Remplacement des console.log Restants

**Statut** : ✅ Logs crypto critiques supprimés  
**Restant** : ~50-60 console.log non-critiques

---

## 🎯 Stratégie de Remplacement

### Pattern de Remplacement

```typescript
// ❌ AVANT
console.log('🔐 [E2EE] Session created');
console.warn('⚠️ Failed to connect');
console.error('❌ Encryption failed', error);

// ✅ APRÈS
import { debugLogger } from '@/lib/debugLogger';

debugLogger.e2ee('Session created');
debugLogger.warn('Failed to connect');
debugLogger.error('Encryption failed', error);
```

---

## 📁 Fichiers à Traiter (Par Priorité)

### 🔴 Priorité HAUTE (Sécurité)

✅ **Déjà fait** :
- [x] `lib/e2ee/x3dh.ts` - Logs de shared secrets supprimés
- [x] `lib/e2ee/doubleRatchet.ts` - Logs de message keys supprimés
- [x] `lib/e2ee/sessionManager.ts` - Logs de key fingerprints supprimés

🔄 **À faire** :
- [ ] `lib/e2ee/e2eeService.ts` - 40+ console.log (Import ajouté, remplacements à faire)
- [ ] `lib/e2ee/messagingIntegration.ts` - 7 console.log/warn
- [ ] `lib/e2ee/keyManagement.ts` - 3 console.log
- [ ] `lib/e2ee/x3dhManager.ts` - 5 console.log

**Actions** :
```bash
# Rechercher : console\.log\(`🔐
# Remplacer : debugLogger.e2ee(`
# Fichiers : lib/e2ee/*.ts
```

---

### 🟠 Priorité MOYENNE (P2P/WebSocket)

- [ ] `lib/p2p/key-exchange.ts` - 6 console.log
- [ ] `lib/p2p/webrtc.ts` - 4 console.log
- [ ] `lib/p2p/p2p-manager.ts` - 8 console.log
- [ ] `lib/p2p/signaling-client.ts` - 5 console.log
- [ ] `hooks/useSocketWithRefresh.ts` - 6 console.log

**Actions** :
```typescript
// Remplacer
console.log('🔑 [KeyExchange] ...') → debugLogger.p2p('[KeyExchange] ...')
console.log('[useSocket] ...') → debugLogger.websocket('[useSocket] ...')
```

---

### 🟡 Priorité BASSE (UI/Screens)

- [ ] `screens/Conversations.tsx` - 10 console.log
- [ ] `screens/SignupFluid.tsx` - 3 console.error
- [ ] `screens/LoginNew.tsx` - 2 console.error
- [ ] `components/BackupSettings.tsx` - 4 console.log
- [ ] `hooks/useP2P.ts` - 5 console.log

**Actions** :
```typescript
// Ces logs peuvent rester en production (info/error uniquement)
console.log('Message sent') → debugLogger.info('Message sent')
console.error('Login failed', error) → debugLogger.error('Login failed', error)
```

---

## 🔧 Commande de Remplacement Automatique

### Option 1 : Avec VS Code (Recommandé)

1. Ouvrir "Find in Files" (Ctrl+Shift+F)
2. Activer "Use Regular Expression" (Alt+R)
3. Rechercher :
   ```regex
   console\.(log|warn|error)\(([`'"])([^`'"]+)\2([^\)]*)\)
   ```
4. Remplacer manuellement selon le contexte

### Option 2 : Avec PowerShell

```powershell
# Remplacer dans tous les fichiers E2EE
Get-ChildItem -Path "apps/frontend/src/lib/e2ee" -Filter "*.ts" | ForEach-Object {
  (Get-Content $_.FullName) `
    -replace 'console\.log\(\`🔐 \[E2EE\]', 'debugLogger.e2ee(`[E2EE]' `
    -replace 'console\.warn\(\`⚠️', 'debugLogger.warn(`' `
    -replace 'console\.error\(\`❌', 'debugLogger.error(`' |
  Set-Content $_.FullName
}
```

### Option 3 : Remplacement Manuel (Safe)

Pour chaque fichier :
1. Ajouter l'import :
   ```typescript
   import { debugLogger } from '../debugLogger';
   ```
2. Remplacer selon la catégorie :
   - `console.log` crypto/e2ee → `debugLogger.e2ee()` (ou supprimer)
   - `console.log` p2p → `debugLogger.p2p()`
   - `console.log` général → `debugLogger.debug()`
   - `console.warn` → `debugLogger.warn()`
   - `console.error` → `debugLogger.error()`

---

## 📊 Statistiques

| Catégorie | Fichiers | console.log | Priorité |
|-----------|----------|-------------|----------|
| **E2EE (crypto)** | 8 | 60+ | 🔴 Haute |
| **P2P** | 7 | 30+ | 🟠 Moyenne |
| **WebSocket** | 3 | 10+ | 🟠 Moyenne |
| **UI/Screens** | 10 | 20+ | 🟡 Basse |
| **Tests** | 2 | 5+ | ⚪ Ignorer |

**Total** : ~125 console.log à traiter

**Déjà fait** : ~10 (logs crypto critiques)  
**Restant** : ~115

---

## ⚠️ Notes Importantes

1. **Ne PAS toucher** :
   - `lib/debugLogger.ts` (le logger lui-même)
   - `lib/logger.ts` (ancien logger, peut-être utilisé ailleurs)
   - Tests (`*.test.ts`)

2. **Logs à GARDER en console** :
   - Erreurs utilisateur critiques
   - Alertes de sécurité
   - Messages de démarrage/shutdown

3. **Import Path** :
   - Dans `lib/` : `import { debugLogger } from './debugLogger';`
   - Dans `components/` : `import { debugLogger } from '../../lib/debugLogger';`
   - Dans `screens/` : `import { debugLogger } from '../lib/debugLogger';`

---

## ✅ Validation Post-Remplacement

Après les remplacements, vérifier :

```bash
# 1. Aucun console.log crypto restant
rg "console\.(log|warn).*\b(key|secret|password|token)\b" apps/frontend/src

# 2. Build TypeScript OK
cd apps/frontend && npm run type-check

# 3. Tests passent
npm test

# 4. App démarre
npm run dev
```

---

## 📝 Temps Estimé

- **Automatique** (script PowerShell) : 10 minutes
- **Semi-automatique** (VS Code Find/Replace) : 30 minutes
- **Manuel** (fichier par fichier) : 2 heures

**Recommandation** : Semi-automatique (VS Code) pour garder le contrôle

---

**Dernière Mise à Jour** : 11 Décembre 2025  
**Statut** : En cours (10/125 faits)
