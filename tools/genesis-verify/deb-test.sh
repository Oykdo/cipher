#!/usr/bin/env bash
# Meme bac a sable que appimage-test.sh, pour l'application installee par le
# paquet .deb (/opt/Cipher/cipher). Le faux lock server ecoute sur 127.0.0.1,
# le secret est une valeur de test, HOME et XDG_DATA_HOME sont detournes.
# Usage : deb-test.sh <scratch-dir-wsl> [port-cdp] [binaire, defaut /opt/Cipher/cipher]
set -uo pipefail
S="$1"; CDP="${2:-9223}"; BIN="${3:-/opt/Cipher/cipher}"
R=/tmp/cipher-appimage-test
rm -rf "$R"; mkdir -p "$R"/{home,data,tmp}
[ -x "$BIN" ] || { echo "binaire absent ou non executable : $BIN"; exit 1; }

FAKE_LOCK_SECRET=test-secret FAKE_LOCK_LOG="$R/fake-lock.log" setsid nohup python3 "$S/fake_lock_server.py" 18080 > "$R/fake.out" 2>&1 &
echo $! > "$R/fake.pid"
sleep 1

setsid nohup env -i \
  PATH=/usr/bin:/bin HOME="$R/home" TMPDIR="$R/tmp" \
  XDG_DATA_HOME="$R/home/.local/share" XDG_CONFIG_HOME="$R/home/.config" XDG_CACHE_HOME="$R/home/.cache" \
  XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/0}" DISPLAY="${DISPLAY:-:0}" WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-}" \
  LANG=C.UTF-8 \
  EIDOLON_SERVER_URL=http://127.0.0.1:18080 EIDOLON_API_SECRET=test-secret \
  "$BIN" --no-sandbox --disable-gpu --remote-debugging-port="$CDP" > "$R/app.out" 2> "$R/app.err" &
echo $! > "$R/app.pid"

for i in $(seq 1 60); do
  if curl -s "http://127.0.0.1:$CDP/json/version" > /dev/null 2>&1; then echo "CDP pret apres ${i}s"; exit 0; fi
  sleep 1
done
echo "CDP indisponible apres 60s"; tail -20 "$R/app.err"; exit 1
