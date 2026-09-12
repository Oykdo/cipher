#!/usr/bin/env bash
# Verification confinee de cipher-runtime, en trois courses :
#   A. lock server injoignable      -> attendu EXIT=2, REFUSED, 0 .psnx
#   B. faux lock server present     -> attendu EXIT=0, entropie 768, .psnx ecrit, verrou arme
#   C. seconde ceremonie, meme data -> attendu EXIT=2, aucun .psnx supplementaire
# Rien ne touche la production : EIDOLON_SERVER_URL pointe sur 127.0.0.1 et le
# secret est une valeur de test. Usage :
#   verify-runtime.sh <binaire> <python-pour-le-faux-serveur> <racine-sandbox> <fake_lock_server.py> [windows]
set -uo pipefail
BIN="$1"; PY="$2"; R="$3"; FAKE="$4"; MODE="${5:-posix}"
PORT=18080
rm -rf "$R"; mkdir -p "$R"/{data,home,tmp,cache}
LOG="$R/fake-lock.log"; : > "$LOG"

base_env=(
  HOME="$R/home" USERPROFILE="$R/home" TMPDIR="$R/tmp" TMP="$R/tmp" TEMP="$R/tmp"
  LOCALAPPDATA="$R/home/AppData/Local" APPDATA="$R/home/AppData/Roaming"
  XDG_DATA_HOME="$R/home/.local/share" XDG_CACHE_HOME="$R/cache"
  LANG=C.UTF-8 LC_ALL=C.UTF-8 PYTHONIOENCODING=utf-8 PYTHONUNBUFFERED=1
  EIDOLON_DATA_DIR="$R/data" EIDOLON_API_SECRET=test-secret
)
if [ "$MODE" = "windows" ]; then
  base_env+=(SYSTEMROOT="${SYSTEMROOT:-C:\\Windows}" PATH="${SYSTEMROOT:-C:\\Windows}\\System32")
else
  base_env+=(PATH=/usr/bin:/bin)
fi
mkdir -p "$R/home/AppData/Local" "$R/home/AppData/Roaming" "$R/home/.local/share"

run_ceremony() { # <label> <server_url>
  local label="$1" url="$2" out="$R/$1.out" err="$R/$1.err"
  env -i "${base_env[@]}" EIDOLON_SERVER_URL="$url" "$BIN" ceremony --name "$label" --json > "$out" 2> "$err"
  local code=$?
  local psnx; psnx=$(find "$R" -name '*.psnx' 2>/dev/null | wc -l | tr -d ' ')
  local phases_err; phases_err=$(grep -c '"status": *"error"\|"REFUSED"' "$out" 2>/dev/null || true)
  local entropy; entropy=$(grep -o '"min_entropy_bits": *[0-9]*' "$out" | tail -1 | grep -o '[0-9]*$')
  local lock; lock=$(find "$R" -name '.machine_lock.enc' 2>/dev/null | wc -l | tr -d ' ')
  local reg; reg=$(find "$R" -name 'vault_registry.json' 2>/dev/null | wc -l | tr -d ' ')
  local last; last=$(tail -1 "$out" 2>/dev/null | cut -c1-200)
  echo "[$label] EXIT=$code psnx_total=$psnx entropy=${entropy:-none} machine_lock=$lock registry=$reg stderr=$(wc -c < "$err")o"
  echo "[$label] last: $last"
}

echo "== binaire : $BIN"
echo "== version : $(env -i "${base_env[@]}" "$BIN" --version 2>&1)"

echo "== A. serveur injoignable =="
run_ceremony A http://127.0.0.1:9

echo "== B. faux lock server =="
FAKE_LOCK_SECRET=test-secret FAKE_LOCK_LOG="$LOG" "$PY" "$FAKE" $PORT &
FAKEPID=$!
sleep 2
run_ceremony B "http://127.0.0.1:$PORT"

echo "== C. seconde ceremonie, meme machine =="
run_ceremony C "http://127.0.0.1:$PORT"

kill $FAKEPID 2>/dev/null; wait $FAKEPID 2>/dev/null
echo "== journal du faux serveur =="
cat "$LOG"
echo "== fichiers ecrits =="
find "$R/data" "$R/home" -type f 2>/dev/null | grep -v '\.out$\|\.err$' | sed "s#^$R/##"
