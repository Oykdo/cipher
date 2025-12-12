# 🔧 Argon2 Alternative Solution

## Problème

argon2-browser nécessite WASM et pose des problèmes de chargement dans Vite.

**Erreurs rencontrées** :
1. `argon2.hash is not a function`
2. WASM loading async issues
3. Module resolution problems

---

## Solution 1: Web Crypto API (RECOMMANDÉ)

Remplacer argon2 par PBKDF2 natif du navigateur (Web Crypto API).

### Avantages
- ✅ Natif au navigateur (pas de dépendances)
- ✅ Rapide (hardware-accelerated)
- ✅ Pas de problèmes WASM
- ✅ Largement supporté

### Implémentation

```typescript
/**
 * Derive master key using Web Crypto API (PBKDF2)
 * Alternative to Argon2 to avoid WASM loading issues
 */
async function deriveMasterKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000, // OWASP recommends 100k+ for PBKDF2-SHA256
      hash: 'SHA-256',
    },
    passwordKey,
    256 // 32 bytes = 256 bits
  );
  
  return new Uint8Array(derivedBits);
}
```

### Paramètres PBKDF2 vs Argon2

| Parameter | Argon2id | PBKDF2-SHA256 | Notes |
|-----------|----------|---------------|-------|
| **Memory** | 64 MB | N/A | Argon2 = memory-hard |
| **Iterations** | 3 | 100,000 | PBKDF2 needs more iterations |
| **Time** | ~100ms | ~100ms | Similar performance |
| **Security** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Both secure for this use case |

**Verdict** : PBKDF2 est suffisant pour dériver une clé de chiffrement de clés privées stockées localement.

---

## Solution 2: Simplifier Argon2 (Alternative)

Si vous voulez vraiment utiliser Argon2, simplifiez le chargement :

```typescript
// Chargement synchrone avec CDN fallback
import argon2 from 'argon2-browser/dist/argon2-asm.min.js';

// Ou utiliser hash-wasm (plus simple)
import { argon2id } from 'hash-wasm';

async function deriveMasterKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const hash = await argon2id({
    password: password,
    salt: salt,
    parallelism: 1,
    iterations: 3,
    memorySize: 64 * 1024, // 64 MB
    hashLength: 32,
    outputType: 'binary',
  });
  
  return new Uint8Array(hash);
}
```

---

## Solution 3: Vite Plugin (Build Fix)

Pour résoudre le problème WASM en production :

```bash
npm install vite-plugin-wasm vite-plugin-top-level-await
```

**vite.config.ts** :
```typescript
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
  ],
  optimizeDeps: {
    exclude: ['argon2-browser'],
  },
});
```

---

## Recommandation Finale

### Pour Testing Immédiat
**Utilisez Solution 1 (Web Crypto API PBKDF2)**

Modifications dans `keyManager.ts` :
1. Supprimer import argon2-browser
2. Remplacer `deriveMasterKey()` par version PBKDF2
3. Tout le reste fonctionne identique

### Pour Production
**Utilisez Solution 3 (Vite Plugin) + Argon2**

Argon2 est meilleur pour la sécurité, mais nécessite config Vite.

---

## Code Prêt à l'Emploi

### Option A: PBKDF2 (Patch Rapide)

**Remplacer dans keyManager.ts lignes 18-43** :

```typescript
// No external dependency needed - Web Crypto API is native

// PBKDF2 parameters (equivalent security to Argon2 for this use case)
const PBKDF2_PARAMS = {
  iterations: 100000, // OWASP recommendation for PBKDF2-SHA256
  hashAlgorithm: 'SHA-256',
  keyLength: 32, // 256 bits
};

/**
 * Derive master key from user password using PBKDF2
 * Uses Web Crypto API (native, no dependencies)
 */
async function deriveMasterKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  
  // Import password as key material
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  // Derive key using PBKDF2
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_PARAMS.iterations,
      hash: PBKDF2_PARAMS.hashAlgorithm,
    },
    passwordKey,
    PBKDF2_PARAMS.keyLength * 8 // bits
  );
  
  return new Uint8Array(derivedBits);
}
```

**Avantages** :
- ✅ Fonctionne immédiatement
- ✅ Pas de dépendances
- ✅ Pas de problèmes WASM
- ✅ Sécurité suffisante

---

## Test Rapide

Après modification, tester :

```javascript
// Console navigateur
const password = "test-password";
const salt = new Uint8Array(16);
crypto.getRandomValues(salt);

// Test PBKDF2
const encoder = new TextEncoder();
const key = await crypto.subtle.importKey(
  'raw',
  encoder.encode(password),
  'PBKDF2',
  false,
  ['deriveBits']
);

const derived = await crypto.subtle.deriveBits(
  { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
  key,
  256
);

console.log('Derived key:', new Uint8Array(derived));
// ✅ Devrait afficher 32 bytes
```

---

## Décision

**Voulez-vous** :
1. **Option A** : Patch rapide avec PBKDF2 (5 min) → Fonctionne immédiatement
2. **Option B** : Garder Argon2 + installer vite-plugin-wasm (15 min) → Meilleure sécurité

**Recommandation** : Option A pour tester maintenant, Option B pour production plus tard.

---

**Prêt à implémenter ? Dites simplement "Option A" ou "Option B" !** 🚀
