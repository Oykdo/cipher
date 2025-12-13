# PQC Hybride (Kyber + Dilithium) — Plan d’intégration (avant implémentation)

## Objectif

Ajouter une couche **post‑quantum** sans casser l’existant en déployant un mode **hybride** :

1. **Échange de clés hybride** : X25519 (classique) + **Kyber / ML‑KEM** (PQC)
2. **Signatures hybrides** : Ed25519 (classique) + **Dilithium / ML‑DSA** (PQC)

L’objectif sécurité principal est de se protéger contre le scénario **“store now, decrypt later”** (un adversaire enregistre aujourd’hui pour déchiffrer plus tard avec un ordinateur quantique).

## Contraintes et propriétés visées

### Propriétés à conserver

- **Confidentialité E2EE** : le serveur ne voit pas le clair.
- **PFS / Forward Secrecy** : compromission des clés long‑terme ne permet pas de déchiffrer l’historique.
- **Post‑Compromise Security** (si Double Ratchet est en place) : on revient à un état sain après un certain nombre de messages.
- **Décentralisation / pas de PKI centrale** : garder un modèle TOFU + vérification out‑of‑band (safety numbers / fingerprints), pas de CA.

### Menaces explicites

- L’intégration PQC **ne** protège **pas** contre un OS compromis (keylogger/malware) : hors du scope crypto.
- L’objectif est la résistance à une attaque quantique future sur les primitives **asymétriques**.

## Choix d’algorithmes (priorité : sécurité)

> Nomenclature NIST récente : Kyber → **ML‑KEM**, Dilithium → **ML‑DSA**.

### KEM (Key Encapsulation)

- **Kyber / ML‑KEM‑768** (équilibre recommandé) ou **ML‑KEM‑1024** (priorité sécurité, plus lourd).
- Recommandation “priorité sécurité” : **ML‑KEM‑1024** si l’UX/latence le permet.

### Signatures

- **Dilithium / ML‑DSA‑87** (niveau le plus élevé) si l’empreinte et les tailles sont acceptables.
- Sinon : **ML‑DSA‑65** comme compromis.

### Symétrique / KDF

- Conserver **AES‑256‑GCM** ou **XChaCha20‑Poly1305** + **HKDF‑SHA‑512** (OK face à Grover, sécurité effective ≈ 128 bits min pour AES‑256).

## Design protocolaire (hybride) : PQXDH‑style

L’approche la plus robuste consiste à s’inspirer du “PQXDH” :

1. Le destinataire publie un bundle de clés contenant **classique + PQC**
2. L’initiateur crée une clé partagée en combinant **les secrets classiques** + **un secret Kyber**
3. On passe ensuite dans le **Double Ratchet** inchangé (seeds/racines différentes)

### 1) Bundles de clés (publication)

Chaque utilisateur publie :

- **Identity keys**
  - `IK_classic`: Ed25519 public
  - `IK_pq`: Dilithium public

- **Signed PreKeys** (rotation périodique)
  - `SPK_classic`: X25519 public
  - `SPK_pq`: Kyber public
  - Signatures :
    - `sig_classic`: signature Ed25519 sur (`SPK_classic || SPK_pq || metadata`)
    - `sig_pq`: signature Dilithium sur (`SPK_classic || SPK_pq || metadata`)

- **One‑Time PreKeys** (pool côté serveur)
  - `OTK_classic[]`: X25519 publics (déjà existant si Signal‑like)
  - `OTK_pq[]`: Kyber publics (nouveau)

> Pourquoi des OTK Kyber ? Pour conserver une **PFS post‑quantum** réelle : si Kyber est seulement “statique”, la composante PQ n’apporte pas la même FS que l’OTK.

### 2) Handshake d’initialisation (initiateur → destinataire)

L’initiateur récupère le bundle du destinataire, puis :

1. Exécute les DH classiques (X3DH) : `DH1..DHn`
2. Encapsule vers **un OTK Kyber** du destinataire :
   - `(ct_pq, ss_pq) = ML‑KEM.Encap(OTK_pq_public)`
3. Combine tous les secrets via un KDF unique :

```text
IKM = concat(DH1, DH2, DH3, DH4?, ss_pq)
SK  = HKDF-Extract(salt, IKM)
rootKey/chainKey = HKDF-Expand(SK, "DeadDrop-PQ-v1", ...)
```

4. L’initiateur envoie au destinataire un “prekey message” incluant :
   - les éléments X3DH classiques (pub keys eph, id, références)
   - `ct_pq`
   - identifiants des OTK consommées (classique et PQ)

Le destinataire :

1. Reconstruit les DH classiques
2. Décapsule : `ss_pq = ML‑KEM.Decap(OTK_pq_private, ct_pq)`
3. Dérive la même rootKey
4. Supprime l’OTK Kyber privée consommée

### 3) Authentification et “décentralisation”

- Pas de PKI : on reste en **TOFU** + affichage d’un **fingerprint**.
- On expose un **Safety Number hybride** (hash stable) dérivé de :

```text
fingerprint = HASH(IK_classic_pub || IK_pq_pub)
```

- La vérification out‑of‑band (QR, comparaison de codes) devient encore plus importante.

## Compatibilité / négociation

### Versioning

Ajouter une version protocole : `e2eeVersion = "v3-pq"`.

### Capability negotiation

- Lors de la récupération des bundles, inclure un champ `capabilities: ["v2", "v3-pq"]`.
- Règle : utiliser **v3-pq** uniquement si **les deux côtés** le supportent.
- Sinon fallback automatique vers v2.

### Migration progressive

1. Déployer d’abord serveur + stockage nouveaux champs (sans rendre obligatoire)
2. Déployer clients capables v3-pq
3. Ajouter un indicateur UI “PQC activé”
4. Plus tard : option “forcer PQC” pour les conversations entre clients compatibles

## Choix d’implémentation (bibliothèques)

Objectif : implémentations PQC **auditées / standard‑compliant**.

Options à évaluer (selon compatibilité Electron/Vite + taille WASM) :

1. **liboqs** compilé en WASM (robuste, large support)
2. **PQClean** (référence, plus “bas niveau”)
3. Un package JS/WASM maintenu activement pour ML‑KEM / ML‑DSA

Critères : tests KAT, performances, taille bundle, licences, maintenance.

## Modifications attendues dans le codebase

### Frontend (crypto + stockage)

- Nouveau module : `src/lib/pqc/*`
  - `mlkem.ts` (encap/decap)
  - `mldsa.ts` (sign/verify)
  - wrappers base64/Uint8Array

- Extension des structures de clés :
  - `PublicKeyBundle` inclut `ik_pq`, `spk_pq`, `otk_pq[]`, `sig_pq`.

- Handshake X3DH :
  - nouveau chemin `pqHandshake` qui ajoute `ct_pq` et `ss_pq` au KDF.

- UI :
  - afficher “PQC: on/off”
  - safety numbers hybrides (QR)

### Backend (stockage + endpoints)

- DB : nouvelles colonnes / tables pour les clés PQC (bundles + OTK Kyber)
- Endpoints :
  - upload/rotate `spk_pq`
  - upload pool `otk_pq`
  - fetch bundle complet (classique + PQ)
  - consommation atomique d’un OTK_pq (comme OTK classique)

## Tests / validation

- Tests KAT (Known Answer Tests) si la lib le permet.
- Tests d’intégration :
  - v3-pq ↔ v3-pq : handshake ok, message decrypt ok
  - v3-pq ↔ v2 : fallback ok
  - OTK_pq consommée une fois (pas de réutilisation)
- Tests perf : taille message initial + latence handshake.

## Rollout & sécurité opérationnelle

- Feature flag `ENABLE_PQC=1` (par défaut off au début)
- Télémétrie locale (sans PII) sur échec handshake (format/version)
- Mécanisme de rollback : si PQ échoue, fallback v2 (avec alerte UI)

## Décisions à valider avant implémentation

1. Paramètres exacts : **ML‑KEM‑1024** vs **ML‑KEM‑768**, **ML‑DSA‑87** vs **ML‑DSA‑65**
2. Bibliothèque PQC (WASM) retenue + licence
3. Format exact des bundles (JSON/binary) et encodage (base64)
4. Politique OTK_pq : taille du pool, rotation, stockage côté serveur

---

## Prochaine étape

Si tu valides ce plan, je passe à l’implémentation en commençant par :

1) définir les structures `PublicKeyBundleV3PQ` et la négociation de capability,
2) ajouter stockage backend des champs PQC (sans casser v2),
3) implémenter le handshake hybride + tests.
