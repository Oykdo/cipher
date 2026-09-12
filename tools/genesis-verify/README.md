# Vérification confinée de la cérémonie Genesis

Deux niveaux, aucun ne touche la production : le lock server est un faux
serveur local sur `127.0.0.1:18080`, le secret est une valeur de test, et les
répertoires de données sont des bacs à sable jetables.

## 1. Le runtime seul — `verify-runtime.sh`

Trois courses contre un binaire `cipher-runtime`, avec le résultat attendu
depuis les correctifs du verrou machine (cœur privé `9f34544`) :

| Course | Attendu |
|---|---|
| A. serveur injoignable | `EXIT=2`, `REFUSED`, aucun `.psnx`, aucun verrou |
| B. faux serveur présent | `EXIT=0`, `min_entropy_bits` 768, un `.psnx`, `.machine_lock.enc` armé, deux requêtes signées (`status`, `register`) |
| C. seconde cérémonie, même machine | `EXIT=2`, `REFUSED` (machine_lock), aucun `.psnx` supplémentaire |

```bash
# Linux, depuis WSL Ubuntu 22.04 (le binaire doit être copié hors de /mnt/c pour le bit exécutable)
bash verify-runtime.sh /tmp/cipher-runtime python3 /tmp/eid-verify fake_lock_server.py posix

# Windows, depuis Git Bash, le faux serveur tournant sur le venv Eidolon
bash verify-runtime.sh /c/Logos/Eidolon/dist-cipher-runtime/cipher-runtime.exe \
     /c/Logos/Eidolon/.venv/Scripts/python.exe "$TEMP/eid-verify" fake_lock_server.py windows
```

`min_entropy_bits: 768` est la valeur qui compte : 512 signifierait un
post-quantique silencieusement dégradé.

## 2. Depuis l'application empaquetée — AppImage sous WSLg

Le niveau 1 contourne `main.js`. Celui-ci lance la vraie AppImage, et déclenche
la cérémonie par `window.electron.genesis.start(name)`, l'appel exact de
`GenesisAnimation.tsx`, via le port DevTools de Chromium. Il prouve la
résolution du runtime dans `resources/Eidolon/`, le `EIDOLON_DATA_DIR` sous
`XDG_DATA_HOME`, et la propagation de l'environnement au processus enfant.

Prérequis dans la distribution WSL : les bibliothèques du `.deb`
(`libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 libatspi2.0-0 libsecret-1-0`)
plus `libasound2 libgbm1 libdrm2`, et `python3` pour le faux serveur.

```bash
# 1. Session WSL qui RESTE OUVERTE (WSL2 arrête la distribution et tue tout, /tmp compris,
#    quelques secondes après la fin de la dernière session wsl.exe) — en tâche de fond côté Windows :
MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu-22.04 -u root -- bash /mnt/c/.../appimage-hold.sh \
    /mnt/c/.../Cipher-1.4.2-x86_64.AppImage /mnt/c/.../tools/genesis-verify 9222 900

# 2. Depuis Windows (Node 22, WebSocket natif), une fois http://127.0.0.1:9222/json/version joignable :
node appimage-genesis-driver.mjs 9222 AppImageVerify 480
#    -> phases 1..11, puis `done {"code":0}`. Si le WebSocket coupe : appimage-genesis-poll.mjs reprend.

# 3. Bilan et arrêt (fichiers écrits, journal du faux serveur, dépose /tmp/cipher-appimage-test/stop) :
MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu-22.04 -u root -- bash /mnt/c/.../appimage-report.sh
```

Résultat de référence, v1.4.2 sur Ubuntu 22.04 (glibc 2.35), le 2026-09-12 :
`done {"code":0}`, 768 bits, post-quantique actif, 164 s, un `.psnx` et un
`.machine_lock.enc` sous `~/.local/share/Eidolon/data/vaults/`, deux requêtes
`status` et une `register` signées reçues par le faux serveur.

## Pièges

- `MSYS_NO_PATHCONV=1` devant tout `wsl.exe` appelé depuis Git Bash, sinon les
  chemins `/mnt/c/...` sont réécrits.
- Git Bash résout `cipher-runtime` en `cipher-runtime.exe` quand le premier
  n'existe pas : ne jamais mettre les deux binaires dans le même répertoire.
