"""Pliskin Industrie (frueher Hysec Industrie) – eingebauter Webserver.

Zwei Einsaetze, derselbe Code:
- Server-Betrieb auf dem Pi:  python3 hysec_server.py   (Port 8770, Daten in serverdaten/)
- Im Programm (Release-Ausgabe, hysec_industrie.py): laeuft im Hintergrund nur fuer das eigene Fenster
  (127.0.0.1) oder – mit „Server-Modus“ in den Einstellungen – fuer das ganze Heimnetz (0.0.0.0).

Game-Logs: Im Programm liest es der Server direkt; auf dem Pi schickt die Pliskin-App vom Spiele-PC die Blueprints.
"""
import gzip
import http.server
import json
import os
import re
import socketserver
import sys
import threading
import time
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
if __name__ == "__main__":
    os.environ.setdefault("HYSEC_DATA", os.path.join(HERE, "serverdaten"))
sys.path.insert(0, HERE)
import hysec_industrie as core  # noqa: E402

PORT = int(os.environ.get("HYSEC_PORT", "8770"))
# Aufrufe, die nur vom eigenen Rechner kommen duerfen (Server-Modus, Updates) – nicht von Geraeten im Heimnetz
NUR_LOKAL = {"prog_set", "update_install", "open_data_dir"}


def debug():
    """Fehlersuche an: Datei serverdaten/debug.flag anlegen (oder HYSEC_DEBUG setzen)."""
    return bool(os.environ.get("HYSEC_DEBUG") or os.path.exists(os.path.join(core.DATA, "debug.flag")))


def make_calls(api, desktop=False, info=None):
    """Was die Oberflaeche aufrufen darf. desktop = Server laeuft im Programm auf dem Spiele-PC selbst."""
    def do_load():
        d = api.load()
        d["mode"] = "server"
        d["dataDir"] = core.DATA if desktop else "Pi: " + core.DATA
        return d
    calls = {
        "load": do_load,
        "save": lambda store: api.save(store),
        "rev": lambda: api.rev(),
        "uex": lambda force=False, nur_cache=False: api.uex(force, nur_cache),
        "scmdb": lambda: scmdb_lesen(),
        "scmdb_sync": lambda: scmdb_holen(),
        "default_live_dir": (lambda: api.default_live_dir()) if desktop else (lambda: ""),
        "sync_logs": (lambda live_dir: api.sync_logs(live_dir)) if desktop
        else (lambda *_: {"ok": False, "error": "Log-Sync bitte in der Pliskin-App auf dem Spiele-PC drücken."}),
        "clientlog": lambda *a: (debug() and print("CLIENT:", *a, flush=True), {"ok": True})[1],
        "app_info": lambda: (info() if info else core.app_info(desktop=False)),
        "prog_get": lambda: core.prog_get(),
        "prog_set": lambda cfg: core.prog_set(cfg) if desktop else {"ok": False, "error": "Nur im Programm"},
        "updates": lambda force=False: core.updates(force),
        "update_install": lambda tag: core.update_install(tag) if desktop else {"ok": False, "error": "Updates installiert das Programm (.exe) selbst."},
        "open_data_dir": lambda: api.open_data_dir() if desktop else False,
        "erfassung_neu": lambda name, b64, loc=None: erfassung_neu(name, b64, loc),
        "erfassung_ablegen": lambda name, b64: erfassung_neu(name, b64, None),
        "erfassung_stand": lambda: erfassung_stand(),
        "erfassung_liste": lambda: erfassung_liste(),
        "erfassung_setzen": lambda eid, res: erfassung_setzen(eid, res),
        "erfassung_fertig": lambda ids, lernen=None, verwerfen=False: erfassung_fertig(ids, lernen, verwerfen),
        "erfassung_lernen": lambda: erfassung_lernen(),
        "erfassung_ausloesen": lambda: erfassung_ausloesen(),
        "erfassung_auftrag": lambda: erfassung_auftrag(),
    }
    return calls


# ---------- Erfassung (Tastenkürzel im Programm → Kisten-Tooltip → Liste → „Passt – einlagern“) ----------
ERF_LOCK = threading.Lock()


def erfassung_dir(*teil):
    return os.path.join(core.DATA, "erfassung", *teil)


def _erf_lesen():
    try:
        with open(erfassung_dir("liste.json"), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"stand": 0, "items": []}


def _erf_schreiben(d):
    d["stand"] = int(d.get("stand", 0)) + 1
    os.makedirs(erfassung_dir(), exist_ok=True)
    core.write_json(erfassung_dir("liste.json"), d)


def erfassung_neu(name, b64, loc=None):
    """Neue Kiste vom Programm: Tooltip-Ausschnitt (PNG) + Ort aus dem Game.log."""
    import base64
    if not re.match(r"^[\w.-]{1,80}\.png$", name or ""):
        return {"ok": False, "error": "ungültiger Name"}
    data = base64.b64decode(b64)
    if len(data) > 20 * 1024 * 1024 or not data.startswith(b"\x89PNG"):
        return {"ok": False, "error": "kein PNG oder zu groß"}
    with ERF_LOCK:
        os.makedirs(erfassung_dir("neu"), exist_ok=True)
        with open(erfassung_dir("neu", name), "wb") as f:
            f.write(data)
        d = _erf_lesen()
        eid = name[:-4]
        d["items"] = [x for x in d["items"] if x["id"] != eid] + [{"id": eid, "name": name, "ts": int(time.time()), "loc": loc, "res": None}]
        _erf_schreiben(d)
    return {"ok": True, "id": eid, "offen": len(d["items"])}


def erfassung_stand():
    d = _erf_lesen()
    return {"stand": d.get("stand", 0), "offen": len(d["items"]), "pc": time.time() - ERF_AUFTRAG["pc"] < 4}


# Fern-Auslöser: Handy/anderes Gerät drückt „📷 Am PC erfassen“ → das Programm auf dem Spiele-PC fragt jede Sekunde nach
ERF_AUFTRAG = {"n": 0, "done": 0, "pc": 0.0}


def erfassung_ausloesen():
    with ERF_LOCK:
        ERF_AUFTRAG["n"] += 1
    return {"ok": True, "auftrag": ERF_AUFTRAG["n"], "pc": time.time() - ERF_AUFTRAG["pc"] < 4}


def erfassung_auftrag():
    """Vom Programm auf dem Spiele-PC (ca. jede Sekunde): gibt es einen Auftrag?"""
    with ERF_LOCK:
        ERF_AUFTRAG["pc"] = time.time()
        if ERF_AUFTRAG["n"] > ERF_AUFTRAG["done"]:
            ERF_AUFTRAG["done"] = ERF_AUFTRAG["n"]
            return {"los": True}
    return {"los": False}


def erfassung_liste():
    import base64
    d = _erf_lesen()
    for x in d["items"]:
        try:
            with open(erfassung_dir("neu", x["name"]), "rb") as f:
                x["img"] = "data:image/png;base64," + base64.b64encode(f.read()).decode("ascii")
        except OSError:
            x["img"] = None
    return d


def erfassung_setzen(eid, res):
    with ERF_LOCK:
        d = _erf_lesen()
        for x in d["items"]:
            if x["id"] == eid:
                x["res"] = res
        _erf_schreiben(d)
    return {"ok": True}


def erfassung_fertig(ids, lernen=None, verwerfen=False):
    """Eingelagert (oder verworfen): Bilder nach erledigt/ bzw. verworfen/ (nichts wird gelöscht).
    lernen = [{id, q, a}] bestätigte Werte → Lernmuster für die Ziffern-Erkennung."""
    import shutil
    ziel = "verworfen" if verwerfen else "erledigt"
    with ERF_LOCK:
        d = _erf_lesen()
        weg = [x for x in d["items"] if x["id"] in set(ids)]
        os.makedirs(erfassung_dir(ziel), exist_ok=True)
        lern = {str(x.get("id")): x for x in (lernen or [])}
        if lern:
            os.makedirs(erfassung_dir("lernen"), exist_ok=True)
            try:
                with open(erfassung_dir("lernen.json"), encoding="utf-8") as f:
                    L = json.load(f)
            except (OSError, ValueError):
                L = []
        for x in weg:
            src = erfassung_dir("neu", x["name"])
            if x["id"] in lern and os.path.exists(src):
                shutil.copy2(src, erfassung_dir("lernen", x["name"]))
                L.append({"name": x["name"], "q": str(lern[x["id"]].get("q", "")), "a": str(lern[x["id"]].get("a", ""))})
            if os.path.exists(src):
                shutil.move(src, erfassung_dir(ziel, x["name"]))
        if lern:
            core.write_json(erfassung_dir("lernen.json"), L)
        d["items"] = [x for x in d["items"] if x["id"] not in set(ids)]
        _erf_schreiben(d)
    return {"ok": True, "offen": len(d["items"])}


def erfassung_lernen():
    """Bestätigte Beispiele (neueste 300) für die Muster der Ziffern-Erkennung."""
    import base64
    try:
        with open(erfassung_dir("lernen.json"), encoding="utf-8") as f:
            L = json.load(f)[-300:]
    except (OSError, ValueError):
        return []
    out = []
    for x in L:
        try:
            with open(erfassung_dir("lernen", x["name"]), "rb") as f:
                out.append({"src": "data:image/png;base64," + base64.b64encode(f.read()).decode("ascii"), "q": x["q"], "a": x["a"]})
        except OSError:
            pass
    return out


def scmdb_datei():
    return os.path.join(core.DATA, "cache", "scmdb.json")


def scmdb_lesen():
    """Zuletzt geholte SCMDB-Ergänzung (nur Raffinerie-Boni werden genutzt) – None, wenn nie geholt"""
    try:
        with open(scmdb_datei(), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def scmdb_holen():
    """Nur auf Knopfdruck (Einstellungen → Datenquellen): SCMDB-Daten holen"""
    import scmdb_abgleich
    msg = []
    ok = scmdb_abgleich.run(force=True, log=msg.append, target=scmdb_datei())
    d = scmdb_lesen()
    return {"ok": bool(d) and ok is not False, "version": (d or {}).get("version"), "info": " ".join(msg)}


def make_handler(calls, app_dir):
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=app_dir, **kw)

        def log_message(self, fmt, *args):  # ruhig bleiben
            pass

        def end_headers(self):
            if not self.path.startswith("/api/"):
                self.send_header("Cache-Control", "no-cache")
            super().end_headers()

        def _json(self, obj, code=200):
            body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
            # Große Antworten (load = Rezepte ~2 MB) gepackt schicken: übers Handy/Tailscale viel schneller
            gz = len(body) > 2048 and "gzip" in (self.headers.get("Accept-Encoding") or "")
            if gz:
                body = gzip.compress(body, 6)
            try:
                self.send_response(code)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                if gz:
                    self.send_header("Content-Encoding", "gzip")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass  # Browser hat die Verbindung schon geschlossen (Seite gewechselt) – harmlos

        def do_POST(self):
            m = re.match(r"^/api/(\w+)$", self.path)
            if not m or m.group(1) not in calls:
                return self._json({"error": "unbekannt"}, 404)
            if m.group(1) in NUR_LOKAL and self.client_address[0] not in ("127.0.0.1", "::1"):
                return self._json({"ok": False, "error": "Nur am Rechner, auf dem Pliskin läuft."}, 403)
            if debug():
                print("%s POST %s von %s (%s)" % (time.strftime("%H:%M:%S"), self.path, self.client_address[0],
                                                  (self.headers.get("User-Agent") or "")[:60]), flush=True)
            try:
                n = int(self.headers.get("Content-Length") or 0)
                args = json.loads(self.rfile.read(n) or b"[]") if n else []
                self._json(calls[m.group(1)](*args))
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception as e:
                traceback.print_exc()
                self._json({"error": str(e)}, 500)
    return Handler


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def start(api, host, port, app_dir, desktop=False, info=None):
    """Server im Hintergrund starten -> (server, port). Port 0 = freien Port waehlen."""
    srv = Server((host, port), make_handler(make_calls(api, desktop, info), app_dir))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]


def main():
    print("%s Pliskin-Server auf Port %d, Daten: %s" % (time.strftime("%Y-%m-%d %H:%M"), PORT, core.DATA), flush=True)
    # Fremde Daten (UEX, SCMDB) holt der Server nicht mehr von selbst – nur auf Knopfdruck in den Einstellungen.
    api = core.Api()
    Server(("0.0.0.0", PORT), make_handler(make_calls(api), os.path.join(HERE, "app"))).serve_forever()


if __name__ == "__main__":
    main()
