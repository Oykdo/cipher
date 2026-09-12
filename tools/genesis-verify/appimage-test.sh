#!/usr/bin/env bash
# Lance l'AppImage Cipher sous WSLg dans un bac a sable, avec un faux lock
# server local, et expose le port DevTools pour que le pilote CDP declenche la
# ceremonie exactement comme le renderer le fait. Rien ne touche la production :
# EIDOLON_SERVER_URL pointe sur 127.0.0.1, le secret est une valeur de test,
# HOME et XDG_DATA_HOME sont detournes.
# Usage : appimage-test.sh <AppImage> <scratch-dir-wsl> [port-cdp]
set -uo pipefail
APPIMAGE="$1"; S="$2"; CDP="${3:-9222}"
R=/tmp/cipher-appimage-test
rm -rf "$R"; mkdir -p "$R"/{home,data,tmp}
cp "$APPIMAGE" "$R/Cipher.AppImage"; chmod +x "$R/Cipher.AppImage"

FAKE_LOCK_SECRET=test-secret FAKE_LOCK_LOG="$R/fake-lock.log" setsid nohup python3 "$S/fake_lock_server.py" 18080 > "$R/fake.out" 2>&1 &
echo $! > "$R/fake.pid"
sleep 1

# Environnement de l'app : c'est CE process.env que main.js propage au runtime.
# setsid : les deux processus doivent survivre a la fin de cette session wsl.exe.
setsid nohup env -i \
  PATH=/usr/bin:/bin HOME="$R/home" TMPDIR="$R/tmp" \
  XDG_DATA_HOME="$R/home/.local/share" XDG_CONFIG_HOME="$R/home/.config" XDG_CACHE_HOME="$R/home/.cache" \
  XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/0}" DISPLAY="${DISPLAY:-:0}" WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-}" \
  LANG=C.UTF-8 \
  EIDOLON_SERVER_URL=http://127.0.0.1:18080 EIDOLON_API_SECRET=test-secret \
  "$R/Cipher.AppImage" --appimage-extract-and-run --no-sandbox --disable-gpu \
  --remote-debugging-port="$CDP" > "$R/app.out" 2> "$R/app.err" &
echo $! > "$R/app.pid"

for i in $(seq 1 60); do
  if curl -s "http://127.0.0.1:$CDP/json/version" > /dev/null 2>&1; then echo "CDP pret apres ${i}s"; exit 0; fi
  sleep 1
done
echo "CDP indisponible apres 60s"; tail -20 "$R/app.err"; exit 1
