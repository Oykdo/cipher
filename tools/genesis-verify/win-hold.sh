#!/usr/bin/env bash
# Lance l'application Windows empaquetee (release/win-unpacked/Cipher.exe ou une
# installation) dans un bac a sable, avec un faux lock server local, et tient
# la session jusqu'a un fichier stop. Depuis Git Bash. Ce poste porte le vrai
# vault dans %LOCALAPPDATA%\Eidolon : LOCALAPPDATA, APPDATA, USERPROFILE et
# EIDOLON_DATA_DIR sont detournes, EIDOLON_SERVER_URL pointe sur 127.0.0.1.
# Usage : win-hold.sh <Cipher.exe> <racine-sandbox> <fake_lock_server.py> <python.exe> [cdp=9222] [lock=18081] [max-s=900]
set -uo pipefail
EXE="$1"; R="$2"; FAKE="$3"; PY="$4"; CDP="${5:-9222}"; LOCK="${6:-18081}"; MAX="${7:-900}"
rm -rf "$R"; mkdir -p "$R"/home/AppData/Local "$R"/home/AppData/Roaming "$R"/data "$R"/tmp
W() { cygpath -w "$1"; }

FAKE_LOCK_SECRET=test-secret FAKE_LOCK_LOG="$R/fake-lock.log" "$PY" "$FAKE" "$LOCK" > "$R/fake.out" 2>&1 &
echo $! > "$R/fake.pid"
sleep 2

# L'environnement est herite (Electron sous Windows veut SYSTEMDRIVE, PATHEXT,
# USERNAME, PROGRAMFILES… : en environnement vide l'app mourait au bout de
# quelques dizaines de secondes sans un mot dans stderr). Seules les variables
# qui font le bac a sable sont remplacees.
env \
  USERPROFILE="$(W "$R/home")" HOME="$(W "$R/home")" TEMP="$(W "$R/tmp")" TMP="$(W "$R/tmp")" \
  LOCALAPPDATA="$(W "$R/home/AppData/Local")" APPDATA="$(W "$R/home/AppData/Roaming")" \
  EIDOLON_DATA_DIR="$(W "$R/data")" EIDOLON_SERVER_URL="http://127.0.0.1:$LOCK" EIDOLON_API_SECRET=test-secret \
  "$EXE" --disable-gpu --remote-debugging-port="$CDP" > "$R/app.out" 2> "$R/app.err" &
# --disable-gpu comme sous WSLg : sans lui, sur ce poste, le processus GPU de
# Chromium a plante (exit_code=34) puis tourne a 100 % avec le renderer, et
# la ceremonie, affamee, n'avance plus (phase 3 toujours en cours apres 10 min).
APP=$!
echo "$APP" > "$R/app.pid"
# PID Windows du processus principal, pour tuer l'arbre entier a la fin : on
# le retrouve par sa ligne de commande (le port DevTools est unique par run),
# la correspondance pid MSYS -> pid Windows de `ps -W` n'etant pas fiable ici.
sleep 5
powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \"Name='Cipher.exe'\" | Where-Object { \$_.CommandLine -match 'remote-debugging-port=$CDP' -and \$_.CommandLine -notmatch '--type=' } | Select-Object -First 1).ProcessId" 2>/dev/null | tr -d '\r ' > "$R/app.winpid"

for i in $(seq 1 90); do
  curl -s "http://127.0.0.1:$CDP/json/version" > /dev/null 2>&1 && { echo "CDP pret apres ${i}s"; break; }
  sleep 1
done
for i in $(seq 1 "$MAX"); do
  [ -f "$R/stop" ] && { echo "stop demande apres ${i}s"; break; }
  kill -0 "$APP" 2>/dev/null || { echo "app terminee apres ${i}s"; break; }
  sleep 1
done
WINPID=$(cat "$R/app.winpid" 2>/dev/null)
[ -n "$WINPID" ] && taskkill //F //T //PID "$WINPID" > /dev/null 2>&1
kill "$(cat "$R/fake.pid")" 2>/dev/null
echo "== fichiers ecrits sous EIDOLON_DATA_DIR et le profil detourne =="
find "$R/data" "$R/home/AppData/Local/Eidolon" -type f 2>/dev/null | sed "s#^$R/##"
echo "== .psnx : $(find "$R/data" -name '*.psnx' 2>/dev/null | wc -l)  machine_lock : $(find "$R/data" -name '.machine_lock.enc' 2>/dev/null | wc -l)"
echo "== journal du faux serveur =="; cat "$R/fake-lock.log" 2>/dev/null
echo "== runtime resolu =="; grep -i "frozen runtime\|eidolon" "$R/app.out" 2>/dev/null | head -3
