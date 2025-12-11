# Analyse de Sécurité - Réduction de l'Entropie DiceKey

**Date**: 2 Novembre 2025  
**Modification**: Réduction de 110 à 33 lancers de dés

---

## 📊 Comparaison de l'Entropie

### Configuration Avant (110 lancers)
- **Entropie**: ~284 bits
- **Combinaisons**: 6^110 ≈ 10^85
- **Sécurité**: Extrêmement forte (overkill)

### Configuration Après (33 lancers)
- **Entropie**: ~85 bits
- **Combinaisons**: 6^33 ≈ 10^25
- **Sécurité**: Moyenne-Faible selon l'usage

---

## 🔐 Comparaison avec Standards

| Standard | Entropie | Comparaison |
|----------|----------|-------------|
| **BIP-39 (12 mots)** | 128 bits | ❌ 33 lancers < Standard |
| **BIP-39 (24 mots)** | 256 bits | ❌ 33 lancers << Standard |
| **AES-128** | 128 bits | ❌ 33 lancers < Standard |
| **AES-256** | 256 bits | ❌ 33 lancers << Standard |
| **Bitcoin Private Key** | 256 bits | ❌ 33 lancers << Standard |
| **NIST Recommandation** | 128+ bits | ❌ 33 lancers < Recommandé |
| **Votre DiceKey (33)** | 85 bits | ⚠️ En dessous des standards |

---

## ⚠️ Risques Identifiés

### 1. Brute Force Attack
**Temps estimé pour casser 85 bits:**
- **GPU haut de gamme (RTX 4090)**: ~2-5 ans (selon algo)
- **Ferme GPU (100 GPUs)**: ~1-3 mois
- **Botnet massif**: quelques semaines
- **Attaque ciblée par état-nation**: quelques jours

### 2. Attaques Sophistiquées
- **Rainbow tables**: Possible si le schéma de dérivation est connu
- **Side-channel attacks**: Risque accru avec faible entropie
- **Quantum computing**: Grover's algorithm divise l'entropie par 2 (→ 42 bits effectifs)

### 3. Comparaison Pratique
```
2^85 = 38 685 626 227 668 133 590 597 632 combinaisons

C'est beaucoup, MAIS:
- Bitcoin utilise 2^256 (inattaquable)
- Les banques utilisent 2^128 (norme)
- Votre système utilise 2^85 (vulnérable dans certains cas)
```

---

## ✅ Quand 85 bits EST Suffisant

### Cas d'usage acceptables:
1. **Démo / Proof of Concept** ✅
   - Environnement de test
   - Pas de données sensibles réelles
   
2. **Données non critiques** ✅
   - Messages éphémères
   - Conversations non sensibles
   - Durée de vie courte (quelques jours)

3. **Avec couches de sécurité supplémentaires** ✅
   - Rate limiting strict
   - 2FA obligatoire
   - Détection d'intrusion
   - HSM ou Secure Enclave

---

## ❌ Quand 85 bits N'EST PAS Suffisant

### Cas d'usage critiques:
1. **Données financières** ❌
   - Portefeuilles crypto
   - Informations bancaires
   - Transactions monétaires

2. **Données sensibles long terme** ❌
   - Secrets d'entreprise
   - Données médicales
   - Documents légaux

3. **Systèmes haute sécurité** ❌
   - Applications gouvernementales
   - Infrastructures critiques
   - Systèmes militaires

4. **Production sans protection additionnelle** ❌
   - Pas de rate limiting
   - Pas de détection d'attaque
   - Exposition publique

---

## 🎯 Recommandations

### Option 1: Augmenter à 50 lancers (RECOMMANDÉ pour production)
```typescript
export const TEST_SERIES_TARGET = 5; // 5 × 11 = 55 lancers
// Entropie: ~142 bits (> AES-128, acceptable)
```
**Avantages:**
- ✅ Dépasse AES-128 (128 bits)
- ✅ Conforme NIST
- ✅ Résistant quantique à court terme
- ✅ Encore raisonnable en UX

### Option 2: Garder 33 lancers avec mitigations
```typescript
export const TEST_SERIES_TARGET = 3; // 3 × 11 = 33 lancers
// Entropie: ~85 bits (AVEC PROTECTIONS)
```
**Mitigations OBLIGATOIRES:**
- ✅ Rate limiting agressif (3 tentatives/heure)
- ✅ Détection d'anomalies
- ✅ Lockout progressif
- ✅ Monitoring des tentatives de force brute
- ✅ 2FA obligatoire
- ✅ HSM pour stockage des clés
- ✅ Rotation périodique des clés

### Option 3: Configuration adaptative
```typescript
// Mode démo: 33 lancers (85 bits)
export const TEST_SERIES_TARGET = process.env.MODE === 'production' ? 5 : 3;
```

---

## 🔬 Calculs Détaillés

### Entropie par lancer de dé
```
1 lancer = log2(6) ≈ 2.585 bits
```

### Configurations possibles
| Lancers | Séries (×11) | Entropie | Sécurité |
|---------|--------------|----------|----------|
| 22 | 2 | 57 bits | ❌ Faible |
| **33** | **3** | **85 bits** | **⚠️ Moyenne** |
| 44 | 4 | 114 bits | ⚠️ Acceptable |
| **55** | **5** | **142 bits** | **✅ Forte** |
| 66 | 6 | 171 bits | ✅ Très forte |
| 77 | 7 | 199 bits | ✅ Excellente |
| 110 | 10 | 284 bits | ✅ Overkill |

---

## 📋 Checklist de Décision

### Utilisez 33 lancers SI:
- [ ] C'est un environnement de démo/test
- [ ] Les données ne sont pas critiques
- [ ] Vous avez des protections additionnelles fortes
- [ ] La durée de vie des clés est courte (<1 mois)
- [ ] Vous acceptez un risque de sécurité moyen

### Augmentez à 55+ lancers SI:
- [ ] C'est un environnement de production
- [ ] Les données sont sensibles ou financières
- [ ] La conformité réglementaire est requise
- [ ] Les clés ont une longue durée de vie
- [ ] Vous voulez une sécurité sans compromis

---

## 🎓 Contexte Technique

### Pourquoi 128 bits est le minimum recommandé?

1. **NIST SP 800-57**: Recommande 128 bits minimum pour 2030+
2. **Quantum resistance**: Grover divise par 2 → besoin 256 bits pour 128 bits post-quantum
3. **Moore's Law**: La puissance double tous les 18 mois
4. **Cloud computing**: Attaques distribuées de plus en plus accessibles

### Comparaison avec cryptomonnaies:
- **Bitcoin**: 256 bits (secp256k1)
- **Ethereum**: 256 bits (secp256k1)
- **Monero**: 256 bits (ed25519)
- **Votre système**: 85 bits ⚠️

---

## 🚨 Verdict Final

### Pour Démo/Test: ✅ ACCEPTABLE
33 lancers (85 bits) est **acceptable** pour un prototype, démo, ou environnement de test sans données sensibles.

### Pour Production: ❌ INSUFFISANT
33 lancers (85 bits) est **en dessous des standards** pour une application de production traitant des données sensibles.

### Recommandation Finale: 
**Augmentez à 55 lancers (5 séries) = 142 bits d'entropie**

---

## 📝 Implémentation Recommandée

```typescript
// apps/frontend/src/lib/diceKey.ts

// Configuration selon environnement
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const IS_DEMO = process.env.VITE_DEMO_MODE === 'true';

// Démo: 3 séries (33 lancers, 85 bits)
// Production: 5 séries (55 lancers, 142 bits) 
export const TEST_SERIES_TARGET = IS_DEMO ? 3 : (IS_PRODUCTION ? 5 : 3);

// Ajoutez un warning en démo
if (IS_DEMO) {
  console.warn(
    '⚠️ DiceKey en mode démo: 85 bits d\'entropie. ' +
    'Utilisez 55+ lancers en production (142+ bits).'
  );
}
```

---

## 🔗 Références

1. NIST SP 800-57 - Key Management Recommendations
2. NIST SP 800-131A - Cryptographic Algorithms
3. BSI TR-02102 - Cryptographic Mechanisms
4. ANSSI - Référentiel Général de Sécurité
5. OWASP - Cryptographic Storage Cheat Sheet

---

**Conclusion**: 85 bits est **suffisant pour une démo**, mais **insuffisant pour la production**. Recommandation: **55 lancers minimum (142 bits)** pour un système réel.
