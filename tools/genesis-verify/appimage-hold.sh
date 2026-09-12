#!/usr/bin/env bash
# WSL2 arrete la distribution quelques secondes apres la fin de la derniere
# session wsl.exe, processus setsid compris : la premiere tentative a vu l'app
# mourir en phase 3. Cette session reste donc ouverte tant que l'app tourne ou
# jusqu'a ce que appimage-report.sh depose /tmp/cipher-appimage-test/stop.
# Usage : appimage-hold.sh <AppImage> <scratch-dir-wsl> [port-cdp] [max-s]
set -uo pipefail
S="$2"; MAX="${4:-900}"
R=/tmp/cipher-appimage-test
bash "$S/appimage-test.sh" "$1" "$S" "${3:-9222}" || exit 1
APP=$(cat "$R/app.pid")
for i in $(seq 1 "$MAX"); do
  [ -f "$R/stop" ] && { echo "stop demande apres ${i}s"; exit 0; }
  kill -0 "$APP" 2>/dev/null || { echo "app terminee apres ${i}s"; exit 0; }
  sleep 1
done
echo "delai maximal atteint"; exit 0
