# 📄 Explication de la Licence - Dead Drop

## ❓ Pourquoi deux licences étaient mentionnées ?

### 🔍 Le Problème

Vous aviez remarqué que deux licences différentes étaient mentionnées :
- **ISC** dans `package.json` et les README
- **MIT** dans le fichier `LICENSE`

### 🤔 Pourquoi cette confusion ?

**ISC était la licence par défaut** lors de l'initialisation du projet avec `npm init`. C'est une licence très similaire à MIT, mais nous avons décidé d'utiliser MIT pour plusieurs raisons.

---

## 🆚 ISC vs MIT : Quelle différence ?

### Licences Très Similaires

Les deux sont des **licences permissives** (open source libre) :

| Aspect | ISC | MIT |
|--------|-----|-----|
| **Usage commercial** | ✅ Oui | ✅ Oui |
| **Modifications** | ✅ Autorisées | ✅ Autorisées |
| **Distribution** | ✅ Autorisée | ✅ Autorisée |
| **Attribution** | ✅ Requise | ✅ Requise |
| **Garanties** | ❌ Aucune | ❌ Aucune |
| **Brevets** | 🔶 Implicite | 🔶 Implicite |

### Différences

1. **Texte légal** :
   - **ISC** : Plus court (~120 mots)
   - **MIT** : Un peu plus long (~170 mots)

2. **Popularité** :
   - **ISC** : ~5% des projets npm
   - **MIT** : ~50% des projets open source (la plus populaire)

3. **Reconnaissance** :
   - **ISC** : Moins connue du grand public
   - **MIT** : Universellement reconnue

### Pourquoi nous avons choisi MIT

✅ **Plus reconnue** : Tout le monde connaît la MIT License  
✅ **Plus claire** : Texte légal plus explicite  
✅ **Meilleure compatibilité** : Référence dans l'open source  
✅ **Confiance** : Utilisée par React, Vue.js, Rails, etc.  

---

## ✅ Correction Appliquée

### Commit : `a46715a`

```
fix: harmonize license to MIT across all files

Updated package.json and README files to consistently use MIT license
instead of mixed ISC/MIT references.
```

### Fichiers Modifiés

1. **package.json** (racine)
   ```json
   - "license": "ISC"
   + "license": "MIT"
   ```

2. **README.md**
   ```markdown
   - ![License](https://img.shields.io/badge/license-ISC-green.svg)
   + ![License](https://img.shields.io/badge/license-MIT-blue.svg)
   
   - This project is licensed under the **ISC License**
   + This project is licensed under the **MIT License**
   ```

3. **README.fr.md**
   ```markdown
   - ![License](https://img.shields.io/badge/license-ISC-green.svg)
   + ![License](https://img.shields.io/badge/license-MIT-blue.svg)
   
   - Ce projet est sous licence **ISC**
   + Ce projet est sous licence **MIT**
   ```

### Fichiers Déjà Corrects

- ✅ **LICENSE** - Déjà MIT
- ✅ **OPEN_SOURCE_GUIDE.md** - Recommande MIT
- ✅ Tous les autres fichiers

---

## 📊 Statut Actuel

### ✅ Licence Unifiée : MIT

| Fichier | Licence | Statut |
|---------|---------|--------|
| **LICENSE** | MIT | ✅ |
| **package.json** | MIT | ✅ |
| **README.md** | MIT | ✅ |
| **README.fr.md** | MIT | ✅ |
| **OPEN_SOURCE_GUIDE.md** | MIT | ✅ |

**Résultat** : 🎉 **100% cohérent !**

---

## 🎓 En Savoir Plus

### Comparaison Détaillée

#### ISC License
```
Copyright (c) 2025, Project Logos

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE...
```

**Caractéristiques** :
- 📏 **Courte** (120 mots)
- 🔓 **Permissive**
- 📜 **Simplifiée**

#### MIT License
```
Copyright (c) 2025 Dead Drop Project Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software...

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED...
```

**Caractéristiques** :
- 📏 **Standard** (170 mots)
- 🔓 **Permissive**
- ⭐ **La plus populaire**
- 📖 **Très explicite**

### Licences Similaires

Famille des **licences permissives** :

1. **MIT** ⭐ (Notre choix)
   - La plus populaire
   - Très claire

2. **ISC** 
   - Équivalente à MIT
   - Plus courte

3. **BSD (2-Clause)**
   - Similaire
   - Clause supplémentaire sur l'usage du nom

4. **Apache 2.0**
   - Permissive
   - Protection explicite des brevets

5. **Unlicense**
   - Domaine public
   - Aucune restriction

---

## 🔍 Vérification

### Comment vérifier la licence de votre projet

```bash
# Sur GitHub
# Allez sur https://github.com/Oykdo/cipher
# Vous devriez voir : "MIT License" à droite

# En local
cat LICENSE | head -3
# Doit afficher: MIT License

grep license package.json
# Doit afficher: "license": "MIT"

grep -i "license" README.md
# Doit afficher: MIT (pas ISC)
```

---

## ❓ FAQ

### Puis-je utiliser MIT pour mon projet commercial ?
✅ **Oui !** MIT autorise l'usage commercial sans restriction.

### Dois-je publier mes modifications ?
❌ **Non**, vous pouvez modifier et garder privé (contrairement à GPL).

### Puis-je changer la licence plus tard ?
⚠️ **Partiellement** : 
- Nouvelles versions : Oui
- Anciennes versions : Non (restent sous ancienne licence)

### Que se passe-t-il si quelqu'un ne respecte pas la licence ?
⚖️ Vous pouvez :
1. Demander le retrait du contenu
2. Exiger l'attribution
3. Poursuivre en justice (derniers recours)

### ISC et MIT sont-elles compatibles ?
✅ **Oui !** Vous pouvez combiner du code ISC et MIT sans problème.

---

## 📚 Ressources

### Sites Officiels
- [MIT License - OSI](https://opensource.org/licenses/MIT)
- [ISC License - OSI](https://opensource.org/licenses/ISC)
- [Choose a License](https://choosealicense.com/)

### Comparateurs
- [TLDRLegal](https://tldrlegal.com/) - Licences expliquées simplement
- [SPDX License List](https://spdx.org/licenses/) - Liste officielle

### Pour Dead Drop
- [LICENSE](./LICENSE) - Texte complet de notre licence MIT
- [OPEN_SOURCE_GUIDE.md](./OPEN_SOURCE_GUIDE.md) - Guide open source complet

---

## ✅ Conclusion

### Avant
```
❌ Incohérence :
   - LICENSE : MIT
   - package.json : ISC
   - README : ISC
```

### Après
```
✅ Cohérence totale :
   - LICENSE : MIT
   - package.json : MIT
   - README : MIT
   - Tous les badges : MIT
```

### Impact

🎯 **Pour vous** :
- Clarté juridique
- Professionnalisme
- Pas de confusion

🎯 **Pour les contributeurs** :
- Savent exactement quels sont leurs droits
- Licence universellement reconnue
- Confiance accrue

🎯 **Pour les utilisateurs** :
- Peuvent utiliser commercialement
- Peuvent modifier librement
- Savent que c'est vraiment open source

---

**Résumé** : Nous avons harmonisé toutes les références de licence vers **MIT** pour éviter toute confusion. MIT est plus reconnue, plus claire, et c'est désormais la seule licence mentionnée dans votre projet.

**Date de correction** : 12 Décembre 2025  
**Commit** : `a46715a`  
**Statut** : ✅ Résolu
