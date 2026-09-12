#!/usr/bin/env python3
"""Faux lock server pour la verification confinee de cipher-runtime.

Reproduit les deux points d'entree que la ceremonie consomme
(POST .../status et .../register), verifie la signature HMAC-SHA256 que le
client pose dans X-Signature (secret : FAKE_LOCK_SECRET), et n'accorde qu'un
seul vault par machine_hash. Chaque requete est journalisee en JSON-lines dans
FAKE_LOCK_LOG. Aucune production n'est contactee : il ecoute sur 127.0.0.1.
"""
import hashlib
import hmac
import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

SECRET = os.environ.get("FAKE_LOCK_SECRET", "test-secret")
LOG_PATH = os.environ.get("FAKE_LOCK_LOG", "fake-lock.log")
REGISTRY = {}  # machine_hash -> {vault_number, vault_id, at}


def log(obj):
    with open(LOG_PATH, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(obj) + "\n")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # silence the default stderr chatter
        pass

    def _send(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._send({"success": False, "message": "POST only", "error_code": "METHOD"}, 405)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw)
        except Exception:
            payload = {}
        signature = self.headers.get("X-Signature", "")
        expected = hmac.new(
            SECRET.encode(), json.dumps(payload, sort_keys=True).encode(), hashlib.sha256
        ).hexdigest()
        signed = bool(signature) and hmac.compare_digest(signature, expected)
        endpoint = self.path.rstrip("/").split("/")[-1]
        machine_hash = str(payload.get("machine_hash") or self.headers.get("X-Machine-Hash", ""))
        entry = {
            "t": round(time.time(), 3),
            "endpoint": endpoint,
            "signed": signed,
            "machine_hash": machine_hash[:12],
            "vault_number": payload.get("vault_number"),
        }
        if not signed:
            log({**entry, "result": "bad_signature"})
            return self._send({"success": False, "message": "bad signature", "error_code": "UNAUTHORIZED"}, 401)

        if endpoint == "status":
            rec = REGISTRY.get(machine_hash)
            data = {
                "vault_count": 1 if rec else 0,
                "vaults": [rec["vault_number"]] if rec else [],
                "is_locked": bool(rec),
                "registered_at": rec["at"] if rec else "",
                "last_seen": "",
            }
            log({**entry, "result": "ok", "is_locked": bool(rec)})
            return self._send({"success": True, "message": "ok", "data": data})

        if endpoint == "register":
            if machine_hash in REGISTRY:
                rec = REGISTRY[machine_hash]
                log({**entry, "result": "refused"})
                return self._send({
                    "success": False,
                    "message": f"This machine already has vault '{rec['vault_id'][:8]}' (#{rec['vault_number']}) registered",
                    "error_code": "MACHINE_LOCKED",
                })
            REGISTRY[machine_hash] = {
                "vault_number": payload.get("vault_number"),
                "vault_id": str(payload.get("vault_id")),
                "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
            log({**entry, "result": "registered"})
            return self._send({"success": True, "message": "registered", "data": {"vault_number": payload.get("vault_number")}})

        if endpoint == "verify":
            rec = REGISTRY.get(machine_hash)
            log({**entry, "result": "verify", "known": bool(rec)})
            return self._send({
                "success": bool(rec),
                "message": "ok" if rec else "unknown",
                "data": {},
                "error_code": None if rec else "NOT_FOUND",
            })

        log({**entry, "result": "unknown_endpoint"})
        return self._send({"success": False, "message": "unknown endpoint", "error_code": "NOT_FOUND"}, 404)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 18080
    HTTPServer(("127.0.0.1", port), Handler).serve_forever()
