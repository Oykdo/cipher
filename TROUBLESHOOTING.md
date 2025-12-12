# 🔧 Dépannage - Dead Drop

## Problèmes Courants et Solutions

### ❌ Erreur : "Backend startup timeout"

**Symptômes** :
```
Failed to start application: Error: Backend startup timeout
```

**Cause** : Le backend (port 4000) ne démarre pas à temps ou le port est déjà utilisé.

**Solutions** :

#### 1. Vérifier si le port est déjà utilisé

```powershell
# Vérifier quel processus utilise le port 4000
netstat -ano | findstr :4000
```

Si une ligne apparaît, le port est occupé.

#### 2. Arrêter les processus Node.js orphelins

```powershell
# Lister tous les processus Node
Get-Process | Where-Object { $_.ProcessName -eq "node" }

# Arrêter TOUS les processus Node (ATTENTION: ferme tous les projets Node)
Get-Process | Where-Object { $_.ProcessName -eq "node" } | Stop-Process -Force

# OU arrêter seulement le processus sur le port 4000
# (Remplacer PID par l'ID du processus trouvé avec netstat)
Stop-Process -Id PID -Force
```

#### 3. Nettoyer et redémarrer

```powershell
# 1. Arrêter tous les processus Node
Get-Process | Where-Object { $_.ProcessName -eq "node" } | Stop-Process -Force

# 2. Attendre 2 secondes
Start-Sleep -Seconds 2

# 3. Démarrer proprement
.\start-dev.ps1
```

---

### ❌ Erreur : "EADDRINUSE: address already in use 0.0.0.0:4000"

**Symptômes** :
```
Error: listen EADDRINUSE: address already in use 0.0.0.0:4000
```

**Cause** : Une instance du backend tourne déjà.

**Solution** :

```powershell
# Trouver le PID du processus utilisant le port 4000
netstat -ano | findstr :4000
# Exemple de sortie: TCP 0.0.0.0:4000 ... LISTENING 12345

# Arrêter ce processus spécifique
Stop-Process -Id 12345 -Force

# Vérifier que le port est libre
netstat -ano | findstr :4000
# (aucune sortie = port libre)

# Redémarrer
.\start-dev.ps1
```

---

### ❌ Trop de processus Node.js (fuite de processus)

**Symptômes** :
- Système lent
- Beaucoup de processus "node.exe" dans le Gestionnaire des tâches
- Erreurs de port déjà utilisé

**Cause** : Des dev servers n'ont pas été arrêtés correctement (Ctrl+C raté).

**Solution** :

```powershell
# 1. Compter les processus Node
$nodeCount = (Get-Process -Name "node" -ErrorAction SilentlyContinue).Count
Write-Host "Processus Node actifs: $nodeCount"

# 2. Si > 5, nettoyer
if ($nodeCount -gt 5) {
    Write-Host "⚠️ Trop de processus Node détectés, nettoyage..."
    Get-Process -Name "node" | Stop-Process -Force
    Write-Host "✅ Nettoyage terminé"
}

# 3. Redémarrer proprement
.\start-dev.ps1
```

---

### ❌ Frontend ne se connecte pas au backend

**Symptômes** :
- Page blanche ou erreurs de réseau
- Console : "Failed to fetch" ou "Network Error"

**Vérifications** :

```powershell
# 1. Vérifier que le backend tourne
curl http://localhost:4000/api/health

# Si erreur "connexion refusée" :
# Le backend n'est pas démarré

# Si réponse OK :
# {"status":"healthy"}
# Le backend fonctionne ✅

# 2. Vérifier que le frontend tourne
curl http://localhost:5178

# Si erreur :
# Le frontend n'est pas démarré
```

**Solution** :

```powershell
# Démarrer manuellement le backend
cd apps\bridge
npm run dev

# Dans un autre terminal, démarrer le frontend
cd apps\frontend
npm run dev
```

---

### ❌ Base de données corrompue ou verrouillée

**Symptômes** :
```
Error: database is locked
Error: database disk image is malformed
```

**Solution** :

```powershell
# ⚠️ ATTENTION: Ceci supprime toutes les données !

# 1. Arrêter tous les processus
Get-Process -Name "node" | Stop-Process -Force

# 2. Supprimer les fichiers de base de données
Remove-Item apps\bridge\data\*.db -Force
Remove-Item apps\bridge\data\*.db-shm -Force
Remove-Item apps\bridge\data\*.db-wal -Force

# 3. Redémarrer (la DB sera recréée)
.\start-dev.ps1
```

**Pour sauvegarder avant** :

```powershell
# Copier la DB avant suppression
Copy-Item apps\bridge\data\deaddrop.db apps\bridge\data\deaddrop.db.backup
```

---

### ❌ Erreur : "Cannot find module" ou "MODULE_NOT_FOUND"

**Symptômes** :
```
Error: Cannot find module '@pulse/frontend'
Error [ERR_MODULE_NOT_FOUND]
```

**Cause** : Dependencies npm non installées.

**Solution** :

```powershell
# 1. Installer les dépendances racine
npm install

# 2. Installer les dépendances frontend
cd apps\frontend
npm install

# 3. Installer les dépendances backend
cd ..\bridge
npm install

# 4. Retour à la racine
cd ..\..

# 5. Redémarrer
.\start-dev.ps1
```

---

### ❌ Erreur TypeScript ou Build

**Symptômes** :
```
TS2307: Cannot find module
TS2345: Argument of type ... is not assignable
```

**Solution** :

```powershell
# 1. Nettoyer les caches TypeScript
Remove-Item -Recurse -Force apps\frontend\node_modules\.vite -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force apps\bridge\dist -ErrorAction SilentlyContinue

# 2. Réinstaller
cd apps\frontend
npm install
cd ..\bridge
npm install
cd ..\..

# 3. Redémarrer
.\start-dev.ps1
```

---

### ❌ Electron ne démarre pas

**Symptômes** :
```
Error: Electron failed to install correctly
A JavaScript error occurred in the main process
```

**Solution** :

```powershell
# 1. Réinstaller Electron
npm install electron@latest --save-dev

# 2. Nettoyer le cache Electron
Remove-Item -Recurse -Force $env:LOCALAPPDATA\electron\Cache -ErrorAction SilentlyContinue

# 3. Redémarrer
.\start-dev.ps1
```

---

## 🛠️ Script de Nettoyage Complet

Créez un fichier `cleanup.ps1` :

```powershell
# cleanup.ps1 - Nettoyage complet du projet Dead Drop

Write-Host "🧹 Nettoyage de Dead Drop..." -ForegroundColor Cyan

# 1. Arrêter tous les processus Node
Write-Host "1. Arrêt des processus Node..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# 2. Nettoyer les caches de build
Write-Host "2. Nettoyage des caches..." -ForegroundColor Yellow
Remove-Item -Recurse -Force apps\frontend\dist -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force apps\frontend\node_modules\.vite -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force apps\bridge\dist -ErrorAction SilentlyContinue

# 3. Vérifier les ports
Write-Host "3. Vérification des ports..." -ForegroundColor Yellow
$port4000 = netstat -ano | findstr :4000
$port5178 = netstat -ano | findstr :5178

if ($port4000) {
    Write-Host "   ⚠️ Port 4000 encore occupé" -ForegroundColor Red
} else {
    Write-Host "   ✅ Port 4000 libre" -ForegroundColor Green
}

if ($port5178) {
    Write-Host "   ⚠️ Port 5178 encore occupé" -ForegroundColor Red
} else {
    Write-Host "   ✅ Port 5178 libre" -ForegroundColor Green
}

Write-Host ""
Write-Host "✅ Nettoyage terminé !" -ForegroundColor Green
Write-Host "Vous pouvez maintenant lancer: .\start-dev.ps1" -ForegroundColor Cyan
```

**Usage** :

```powershell
.\cleanup.ps1
```

---

## 📝 Logs de Débogage

### Activer les logs détaillés

```powershell
# Backend avec logs
cd apps\bridge
$env:DEBUG="*"
npm run dev

# Frontend avec logs réseau
cd apps\frontend
$env:VITE_LOG_LEVEL="debug"
npm run dev
```

### Vérifier les logs du backend

```bash
# Les logs sont dans la console où vous avez lancé npm run dev
# Recherchez des erreurs comme:
# - "Error:" (erreurs générales)
# - "EADDRINUSE" (port occupé)
# - "ECONNREFUSED" (connexion refusée)
# - "MODULE_NOT_FOUND" (module manquant)
```

---

## 🔍 Diagnostic Rapide

**Script de diagnostic** :

```powershell
# diagnostic.ps1

Write-Host "🔍 Diagnostic Dead Drop" -ForegroundColor Cyan
Write-Host ""

# Node.js
Write-Host "Node.js:" -ForegroundColor Yellow
node --version

# npm
Write-Host "npm:" -ForegroundColor Yellow
npm --version

# Processus Node actifs
$nodeCount = (Get-Process -Name "node" -ErrorAction SilentlyContinue).Count
Write-Host "Processus Node actifs: $nodeCount" -ForegroundColor Yellow

# Port 4000
Write-Host "Port 4000:" -ForegroundColor Yellow
$port4000 = netstat -ano | findstr :4000
if ($port4000) {
    Write-Host "  ❌ Occupé" -ForegroundColor Red
    Write-Host "  $port4000"
} else {
    Write-Host "  ✅ Libre" -ForegroundColor Green
}

# Port 5178
Write-Host "Port 5178:" -ForegroundColor Yellow
$port5178 = netstat -ano | findstr :5178
if ($port5178) {
    Write-Host "  ❌ Occupé" -ForegroundColor Red
} else {
    Write-Host "  ✅ Libre" -ForegroundColor Green
}

# Backend health
Write-Host "Backend (http://localhost:4000):" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:4000/api/health" -TimeoutSec 2
    Write-Host "  ✅ Répond" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Ne répond pas" -ForegroundColor Red
}

# Frontend
Write-Host "Frontend (http://localhost:5178):" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5178" -TimeoutSec 2
    Write-Host "  ✅ Répond" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Ne répond pas" -ForegroundColor Red
}

Write-Host ""
Write-Host "✅ Diagnostic terminé" -ForegroundColor Cyan
```

---

## 🚀 Démarrage Propre (Procédure Recommandée)

**Toujours suivre cet ordre** :

```powershell
# 1. NETTOYER
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force

# 2. ATTENDRE
Start-Sleep -Seconds 2

# 3. VÉRIFIER
netstat -ano | findstr :4000  # Doit être vide
netstat -ano | findstr :5178  # Doit être vide

# 4. DÉMARRER
.\start-dev.ps1
```

---

## 📞 Besoin d'Aide ?

Si les solutions ci-dessus ne fonctionnent pas :

1. **Vérifier les Issues GitHub** : https://github.com/Oykdo/cipher/issues
2. **Créer une Issue** avec :
   - L'erreur complète (copier-coller)
   - Résultat de `diagnostic.ps1`
   - Système d'exploitation (Windows 10/11)
   - Version de Node.js (`node --version`)

---

**Dernière mise à jour** : 12 Décembre 2025  
**Version** : 1.0.0
