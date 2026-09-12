#!/usr/bin/env bash
# Bilan apres la ceremonie pilotee : fichiers ecrits dans le bac a sable,
# journal du faux lock server, extrait des logs de l'app, puis arret propre.
R=/tmp/cipher-appimage-test
echo "== runtime resolu par l'app (stderr/stdout de l'app) =="
grep -i "cipher-runtime\|eidolon\|genesis" "$R/app.out" "$R/app.err" 2>/dev/null | grep -v "GPU\|dbus\|libva" | head -12
echo "== journal du faux serveur =="
cat "$R/fake-lock.log" 2>/dev/null
echo "== fichiers ecrits sous XDG_DATA_HOME/Eidolon =="
find "$R/home/.local/share/Eidolon" -type f 2>/dev/null | sed "s#^$R/##"
echo "== .psnx : $(find "$R/home" -name '*.psnx' 2>/dev/null | wc -l)  machine_lock : $(find "$R/home" -name '.machine_lock.enc' 2>/dev/null | wc -l)"
echo "== arret =="
kill "$(cat "$R/app.pid")" 2>/dev/null; kill "$(cat "$R/fake.pid")" 2>/dev/null; pkill -f "$R/Cipher.AppImage" 2>/dev/null; sleep 1
echo "ok"
