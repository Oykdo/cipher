#!/usr/bin/env bash
# Session wsl.exe qui reste ouverte pendant la ceremonie lancee par
# deb-test.sh (WSL2 tue tout, /tmp compris, quelques secondes apres la fin de
# la derniere session). Se termine sur /tmp/cipher-appimage-test/stop.
# Usage : deb-hold.sh <scratch-dir-wsl> [port-cdp] [max-s] [binaire]
set -uo pipefail
S="$1"; CDP="${2:-9223}"; MAX="${3:-900}"; BIN="${4:-/opt/Cipher/cipher}"
R=/tmp/cipher-appimage-test
bash "$S/deb-test.sh" "$S" "$CDP" "$BIN" || exit 1
APP=$(cat "$R/app.pid")
for i in $(seq 1 "$MAX"); do
  [ -f "$R/stop" ] && { echo "stop demande apres ${i}s"; exit 0; }
  kill -0 "$APP" 2>/dev/null || { echo "app terminee apres ${i}s"; exit 0; }
  sleep 1
done
echo "delai maximal atteint"; exit 0
