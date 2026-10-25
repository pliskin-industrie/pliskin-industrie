"""Pliskin Industrie – Crafting, Lager und Logistik fuer Star Citizen.

Zwei Ausgaben aus demselben Code (Datei edition.json neben dem Programm bzw. in der .exe):
- "privat":  Lony Pliskins Programm – oeffnet den Pliskin-Server auf dem Pi (Daten zentral im Heimnetz).
- "release": fertiges Programm fuer alle – startet einen eigenen kleinen Server im Hintergrund und zeigt die
             Oberflaeche in einem eigenen Fenster (WebView2 unter Windows, GTK/Qt unter Linux). Mit dem
             „Server-Modus“ (Einstellungen) koennen auch Handy/Laptop im Heimnetz darauf zugreifen.
Updates: GitHub-Releases (Version waehlbar, Hinweis abschaltbar).
"""
import glob
import json
import os
import platform
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.request

# pywebview wird nur fuer das Programmfenster gebraucht (nicht auf dem Pi-Server)
try:
    import webview
except ImportError:  # pragma: no cover
    webview = None

APP_NAME = "Pliskin Industrie"
VERSION = "0.8.0"
UEX_BASE = "https://api.uexcorp.uk/2.0"
UEX_AGENT = "pliskin-industrie/%s (Star-Citizen-Tool)" % VERSION
UEX_MAX_AGE = 6 * 3600          # Preise hoechstens alle 6 Stunden neu laden
BP_PATTERN = re.compile(r'^<([^>]+)>.*SHUDEvent_OnNotification> Added notification "Received Blueprint: (.+?)\s*: "')


def base_dir():
    # In der .exe liegen die Dateien im Entpack-Ordner von PyInstaller
    return getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))


def _edition():
    try:
        with open(os.path.join(base_dir(), "edition.json"), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"edition": "privat", "github": ""}


ED = _edition()
EDITION = os.environ.get("PLISKIN_EDITION") or ED.get("edition", "privat")
GITHUB_REPO = os.environ.get("PLISKIN_GITHUB") or ED.get("github", "")   # z. B. "lonypliskin/pliskin-industrie" (leer = keine Updates)


def data_dir():
    # Server auf dem Pi setzt HYSEC_DATA; das Programm nutzt den Benutzer-Datenordner des Systems
    d = os.environ.get("HYSEC_DATA")
    if not d:
        name = "HysecIndustrie" if EDITION == "privat" else "PliskinIndustrie"   # Lony Pliskins Programm behaelt seinen alten Ordner
        if os.name == "nt":
            root = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
        else:
            root = os.environ.get("XDG_DATA_HOME") or os.path.join(os.path.expanduser("~"), ".local", "share")
        d = os.path.join(root, name)
    os.makedirs(os.path.join(d, "cache"), exist_ok=True)
    os.makedirs(os.path.join(d, "sicherungen"), exist_ok=True)
    return d


DATA = data_dir()
STORE = os.path.join(DATA, "daten.json")
LOGINDEX = os.path.join(DATA, "cache", "logindex.json")


def read_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def write_json(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


class Api:
    def __init__(self):
        self._window = None
        self._lock = threading.Lock()

    # ---------- Daten ----------
    def load(self):
        recipes = read_json(os.path.join(base_dir(), "app", "data", "rezepte.json"), {})
        return {"store": read_json(STORE, None), "recipes": recipes, "version": VERSION, "dataDir": DATA}

    def save(self, store):
        with self._lock:
            # Mehrere Geraete: nur speichern, wenn niemand inzwischen neuer gespeichert hat
            cur = read_json(STORE, None)
            cur_rev = (cur or {}).get("_rev", 0)
            if cur and store.get("_rev", 0) < cur_rev:
                return {"conflict": True, "store": cur}
            store["_rev"] = cur_rev + 1
            # Vor dem Ueberschreiben: eine Tagessicherung behalten (je ~15 KB). Die letzten 60 Tage alle,
            # aeltere: je Monat die erste dauerhaft (Rest wandert in sicherungen/alt/, wird nicht geloescht)
            if os.path.exists(STORE):
                day = time.strftime("%Y-%m-%d")
                bak = os.path.join(DATA, "sicherungen", "daten-%s.json" % day)
                if not os.path.exists(bak):
                    shutil.copy2(STORE, bak)
                    olds = sorted(glob.glob(os.path.join(DATA, "sicherungen", "daten-*.json")))
                    seen = set()
                    for o in olds[:-60]:
                        month = os.path.basename(o)[6:13]
                        if month in seen:
                            os.makedirs(os.path.join(DATA, "sicherungen", "alt"), exist_ok=True)
                            shutil.move(o, os.path.join(DATA, "sicherungen", "alt", os.path.basename(o)))
                        seen.add(month)
            write_json(STORE, store)
        return {"ok": True, "rev": store["_rev"]}

    def rev(self):
        return (read_json(STORE, None) or {}).get("_rev", 0)

    def export_backup(self, store):
        res = self._window.create_file_dialog(webview.SAVE_DIALOG, save_filename="hysec-sicherung-%s.json" % time.strftime("%Y-%m-%d"),
                                             file_types=("Sicherung (*.json)",))
        if not res:
            return None
        path = res if isinstance(res, str) else res[0]
        write_json(path, store)
        return path

    def import_backup(self):
        res = self._window.create_file_dialog(webview.OPEN_DIALOG, file_types=("Sicherung (*.json)",))
        if not res:
            return None
        return read_json(res[0], None)

    # ---------- Log-Sync ----------
    def pick_folder(self):
        res = self._window.create_file_dialog(webview.FOLDER_DIALOG)
        return res[0] if res else None

    def sync_logs(self, live_dir):
        """Liest Game.log + logbackups und liefert alle 'Received Blueprint'-Meldungen."""
        if not live_dir or not os.path.isdir(live_dir):
            return {"ok": False, "error": "Ordner nicht gefunden: %s" % live_dir}
        files = glob.glob(os.path.join(live_dir, "logbackups", "*.log"))
        game = os.path.join(live_dir, "Game.log")
        if os.path.exists(game):
            files.append(game)
        index = read_json(LOGINDEX, {})
        found, read_count = [], 0
        for f in files:
            try:
                st = os.stat(f)
            except OSError:
                continue
            key = os.path.basename(f) + "|" + os.path.basename(os.path.dirname(f))
            sig = "%d:%d" % (st.st_size, int(st.st_mtime))
            cached = index.get(key)
            if cached and cached.get("sig") == sig:
                found.extend(cached["hits"])
                continue
            hits = []
            try:
                with open(f, encoding="utf-8", errors="replace") as fh:
                    for line in fh:
                        if "Received Blueprint" in line:
                            m = BP_PATTERN.search(line)
                            if m:
                                hits.append({"name": m.group(2).strip(), "ts": m.group(1)})
            except OSError:
                continue
            read_count += 1
            # Game.log waechst noch – nicht dauerhaft merken
            if not f.endswith("Game.log"):
                index[key] = {"sig": sig, "hits": hits}
            found.extend(hits)
        write_json(LOGINDEX, index)
        return {"ok": True, "files": len(files), "read": read_count, "hits": found}

    def default_live_dir(self):
        for c in [r"G:\Star Citizen\StarCitizen\LIVE", r"C:\Program Files\Roberts Space Industries\StarCitizen\LIVE"]:
            if os.path.isdir(c):
                return c
        return ""

    # ---------- UEX ----------
    def uex(self, force=False, nur_cache=False):
        """Holt Waren, Preise und Terminals von UEX Corp (mit Zwischenspeicher).
        nur_cache = nichts aus dem Internet holen, nur den letzten Stand liefern (Abruf nur auf Knopfdruck)."""
        cache = os.path.join(DATA, "cache", "uex.json")
        old = read_json(cache, None)
        if nur_cache:
            return old or {"ts": 0, "commodities": [], "prices": [], "terminals": []}
        if old and not force and time.time() - old.get("ts", 0) < UEX_MAX_AGE and "places" in old:
            return old
        try:
            def get(p):
                req = urllib.request.Request(UEX_BASE + p, headers={"User-Agent": UEX_AGENT})
                with urllib.request.urlopen(req, timeout=60) as r:
                    return json.load(r).get("data") or []
            comm = get("/commodities")
            prices = get("/commodities_prices_all")
            terms = get("/terminals?type=commodity")
            places = []   # Ausstattung der Orte kommt seit 22.10.2026 aus den Spieldaten (orte.json) – bei UEX nur noch 3 Abfragen je Knopfdruck
            out = {"ts": time.time(),
                   "commodities": [{"id": c["id"], "name": c["name"], "kind": c.get("kind"),
                                    "illegal": c.get("is_illegal")} for c in comm],
                   "prices": [{"c": p["id_commodity"], "t": p["id_terminal"], "sell": p.get("price_sell"),
                               "buy": p.get("price_buy"), "boxes": p.get("container_sizes"),
                               "age": p.get("date_modified")} for p in prices],
                   "terminals": [{"id": t["id"], "name": t.get("displayname") or t.get("name"),
                                  "system": t.get("star_system_name"), "planet": t.get("planet_name"),
                                  "moon": t.get("moon_name"), "station": t.get("space_station_name"),
                                  "city": t.get("city_name"), "outpost": t.get("outpost_name")} for t in terms],
                   "places": places}
            write_json(cache, out)
            return out
        except Exception as e:  # Netz weg -> alte Daten weiterverwenden
            if old:
                old["stale"] = True
                old["error"] = str(e)
                return old
            return {"ts": 0, "error": str(e), "commodities": [], "prices": [], "terminals": []}

    # ---------- StarStrings (MrKraken): Blueprint-Häkchen in die global.ini ----------
    def starstrings_schreiben(self, status, live_dir=None, farbe=None, sprache=None):
        try:
            import starstrings
        except ImportError:
            return {"ok": False, "error": "starstrings.py fehlt"}
        live = live_dir or (read_json(PROG, {}) or {}).get("logDir") or self.default_live_dir()
        try:
            return starstrings.schreiben(live, status or {}, farbe or "EM2", sprache or "de")
        except Exception as e:
            return {"ok": False, "error": str(e)}

    # ---------- Erfassungs-Taste (nur im Programm) ----------
    def hotkey_get(self, log_dir=None):
        cfg = read_json(PROG, {}) or {}
        if log_dir and cfg.get("logDir") != log_dir:   # Log-Ordner aus den Einstellungen merken (für den Ort)
            cfg["logDir"] = log_dir
            write_json(PROG, cfg)
        hk = HOTKEY["obj"]
        return {"hotkey": (hk.aktiv if hk else None) or cfg.get("hotkey") or HOTKEY_STD, "aktiv": bool(hk and hk.aktiv),
                "fehler": hk.fehler if hk else "nur unter Windows", "ort": ort_aus_log(),
                "ton": cfg.get("ton", "wc4_lock"), "tonVol": cfg.get("tonVol", 50), "daten": DATA,
                "eigenerTon": os.path.exists(os.path.join(DATA, "ton-ok.wav")),
                "admin": HOTKEY_INFO.get("admin"), "spielAdmin": HOTKEY_INFO.get("spielAdmin")}

    def als_admin_neustarten(self):
        """Pliskin mit Administrator-Rechten neu starten (Windows fragt nach). Nötig, wenn das Spiel als Administrator läuft."""
        if os.name != "nt":
            return {"ok": False, "error": "nur unter Windows"}
        import ctypes
        exe = sys.executable
        args = " ".join('"%s"' % a for a in (sys.argv[1:] if getattr(sys, "frozen", False) else sys.argv))
        m = globals().get("_MUTEX")
        if m:   # Einzelfenster-Sperre freigeben, sonst beendet sich das neue Fenster gleich wieder
            ctypes.windll.kernel32.CloseHandle(m); globals()["_MUTEX"] = None
        r = ctypes.windll.shell32.ShellExecuteW(None, "runas", exe, args, None, 1)
        if r <= 32:
            single_instance()
            return {"ok": False, "error": "abgebrochen"}
        threading.Timer(0.5, lambda: os._exit(0)).start()
        return {"ok": True}

    def ton_set(self, name, vol):
        cfg = read_json(PROG, {}) or {}
        cfg["ton"] = name if name in ("wc4_lock", "wc4_vdu", "wc4_nav", "zielerfassung", "funk", "bordcomputer", "scanner", "kamera", "glas", "chip", "adlib", "terminal", "aus") else "wc4_lock"
        cfg["tonVol"] = max(0, min(100, int(vol)))
        write_json(PROG, cfg)
        try:
            import erfassung
            erfassung.TON.update(name=cfg["ton"], vol=cfg["tonVol"], dir=DATA)
        except Exception:
            pass
        return {"ok": True}

    def ton_test(self, ok=True):
        try:
            import erfassung
            threading.Thread(target=erfassung.ton, args=(bool(ok),), daemon=True).start()
        except Exception as e:
            return {"ok": False, "error": str(e)}
        return {"ok": True}

    def hotkey_set(self, combo):
        hk = HOTKEY["obj"]
        if not hk:
            return {"ok": False, "error": "Tastenkürzel gibt es nur im Programm unter Windows"}
        ok, err = hk.setzen(combo)
        if ok:
            cfg = read_json(PROG, {}) or {}
            cfg["hotkey"] = combo
            write_json(PROG, cfg)
        return {"ok": ok, "error": err, "hotkey": hk.aktiv}

    def open_data_dir(self):
        if os.name == "nt":
            os.startfile(DATA)
        else:
            subprocess.Popen(["xdg-open", DATA])
        return True

    def retry(self):
        """Offline-Seite: nochmal nach dem Pi suchen und ihn oeffnen."""
        url = find_pi()
        if url and self._window:
            self._window.load_url(url)
            return True
        return False


# ---------------------------------------------------------------------------
# Programm-Einstellungen (nur dieser Rechner, nicht in den Spieldaten): Server-Modus, Port
# ---------------------------------------------------------------------------
PROG = os.path.join(DATA, "programm.json")
PROG_DEFAULT = {"server": False, "port": 8770}
SERVER = {"srv": None, "port": None, "host": None, "restart": None}   # vom Programmstart gesetzt


def prog_get():
    cfg = dict(PROG_DEFAULT, **(read_json(PROG, {}) or {}))
    return dict(cfg, edition=EDITION, desktop=SERVER["srv"] is not None, running=dict(host=SERVER["host"], port=SERVER["port"]),
                addrs=lan_addrs() if SERVER["host"] == "0.0.0.0" else [])


def prog_set(cfg):
    cur = dict(PROG_DEFAULT, **(read_json(PROG, {}) or {}))
    for k in ("server", "port"):
        if k in cfg:
            cur[k] = cfg[k]
    try:
        cur["port"] = max(1024, min(65535, int(cur["port"])))
    except (TypeError, ValueError):
        cur["port"] = 8770
    write_json(PROG, cur)
    res = {"ok": True}
    if SERVER["restart"]:
        res.update(SERVER["restart"]())
    return res


def lan_addrs():
    """IP-Adressen dieses Rechners im Heimnetz (fuer „vom Handy aus erreichbar unter …“)"""
    out = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        out.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for a in socket.gethostbyname_ex(socket.gethostname())[2]:
            if not a.startswith("127."):
                out.add(a)
    except OSError:
        pass
    return sorted(out)


def app_info(desktop=True):
    return {"version": VERSION, "edition": EDITION, "os": platform.system(), "desktop": desktop,
            "github": GITHUB_REPO, "frozen": bool(getattr(sys, "frozen", False)), "dataDir": DATA}


# ---------------------------------------------------------------------------
# Updates ueber GitHub-Releases
# ---------------------------------------------------------------------------
def _vkey(tag):
    return tuple(int(x) for x in re.findall(r"\d+", tag or "")[:4]) or (0,)


def _asset_for_os(assets):
    """Passende Datei eines Releases fuer dieses Betriebssystem (.exe fuer Windows, sonst Linux-Datei)"""
    win = os.name == "nt"
    for a in assets or []:
        n = (a.get("name") or "").lower()
        if win and n.endswith(".exe"):
            return a
        if not win and ("linux" in n) and not n.endswith((".exe", ".sha256", ".tar.gz", ".zip", ".tgz")):   # Linux: das fertige Programm (Datei ohne Endung)
            return a
    return None


def updates(force=False):
    """Liste der Versionen auf GitHub (neueste zuerst) + ob es eine neuere gibt. Zwischenspeicher 6 Stunden."""
    if not GITHUB_REPO:
        return {"ok": False, "current": VERSION, "error": "Update-Quelle ist noch nicht eingerichtet.", "releases": []}
    cache = os.path.join(DATA, "cache", "updates.json")
    old = read_json(cache, None)
    if old and not force and time.time() - old.get("ts", 0) < 6 * 3600 and old.get("repo") == GITHUB_REPO:
        rel = old["releases"]
    else:
        try:
            req = urllib.request.Request("https://api.github.com/repos/%s/releases?per_page=30" % GITHUB_REPO,
                                         headers={"User-Agent": UEX_AGENT, "Accept": "application/vnd.github+json"})
            with urllib.request.urlopen(req, timeout=20) as r:
                data = json.load(r)
            rel = []
            for x in data:
                if x.get("draft"):
                    continue
                a = _asset_for_os(x.get("assets"))
                rel.append({"tag": x.get("tag_name"), "name": x.get("name") or x.get("tag_name"), "date": (x.get("published_at") or "")[:10],
                            "notes": (x.get("body") or "")[:4000], "pre": bool(x.get("prerelease")),
                            "asset": a and a.get("browser_download_url"), "file": a and a.get("name"), "size": a and a.get("size")})
            write_json(cache, {"ts": time.time(), "repo": GITHUB_REPO, "releases": rel})
        except Exception as e:  # offline / Limit erreicht
            if not old:
                return {"ok": False, "current": VERSION, "error": str(e), "releases": []}
            rel = old["releases"]
    rel = sorted(rel, key=lambda x: _vkey(x["tag"]), reverse=True)
    newest = next((x for x in rel if not x["pre"]), None)
    return {"ok": True, "current": VERSION, "releases": rel,
            "newer": newest["tag"] if newest and _vkey(newest["tag"]) > _vkey(VERSION) else None}


def update_install(tag):
    """Gewaehlte Version herunterladen, das laufende Programm ersetzen (alte Datei bleibt als Sicherung liegen)
    und neu starten. Geht nur in der fertigen .exe / Linux-Datei, nicht beim Start aus dem Quelltext."""
    if not getattr(sys, "frozen", False):
        return {"ok": False, "error": "Update geht nur im fertigen Programm (nicht beim Start aus dem Quelltext)."}
    u = updates(False)
    r = next((x for x in u.get("releases", []) if x["tag"] == tag), None)
    if not r or not r.get("asset"):
        return {"ok": False, "error": "Für dieses Betriebssystem gibt es in Version %s keine Datei." % tag}
    exe = sys.executable
    new = exe + ".neu"
    try:
        req = urllib.request.Request(r["asset"], headers={"User-Agent": UEX_AGENT})
        with urllib.request.urlopen(req, timeout=300) as resp, open(new, "wb") as f:
            shutil.copyfileobj(resp, f)
        bak = "%s.v%s.alt" % (exe, VERSION)          # alte Version aufheben (nicht loeschen)
        if os.path.exists(bak):
            bak = "%s.%d" % (bak, int(time.time()))
        os.replace(exe, bak) if os.name == "nt" else shutil.copy2(exe, bak)   # Windows: laufende .exe darf umbenannt werden
        os.replace(new, exe)
        if os.name != "nt":
            os.chmod(exe, 0o755)
    except Exception as e:
        return {"ok": False, "error": "Download/Ersetzen fehlgeschlagen: %s" % e}

    def neustart():
        time.sleep(1.0)
        if os.name == "nt":
            subprocess.Popen('cmd /c timeout /t 2 /nobreak >nul & start "" "%s"' % exe, shell=True,
                             creationflags=0x08000000)   # CREATE_NO_WINDOW
        else:
            subprocess.Popen(["sh", "-c", 'sleep 2; exec "$0"', exe], start_new_session=True)
        os._exit(0)
    threading.Thread(target=neustart, daemon=True).start()
    return {"ok": True, "restart": True}


# Der Pliskin-Server auf dem Pi (nur Ausgabe „privat“; eigene Adresse optional in <Datenordner>\pi.txt)
PI_URLS = []   # nur Ausgabe „privat“


def find_pi():
    urls = list(PI_URLS)
    custom = os.path.join(DATA, "pi.txt")
    if os.path.exists(custom):
        with open(custom, encoding="utf-8") as f:
            u = f.read().strip()
        if u:
            urls.insert(0, u.rstrip("/") + "/")
    for u in urls:
        try:
            req = urllib.request.Request(u + "api/rev", data=b"[]", method="POST")
            with urllib.request.urlopen(req, timeout=3) as r:
                if r.status == 200:
                    globals()["PI_BASE"] = u
                    return u + "?app=1"   # Seite weiss: laeuft in der Hysec-App (darf lokal lesen)
        except Exception:
            continue
    return None


PI_BASE = None


HOTKEY = {"obj": None}
HOTKEY_INFO = {"admin": False, "spielAdmin": False}
HOTKEY_STD = "Pause"   # im Spiel nicht belegt; Kombis mit Buchstaben lösen im Spiel die Taste mit aus (z. B. S = rückwärts laufen)


def ort_aus_log():
    """Letzter Ort aus dem Game.log: beim Öffnen von Inventar/Freight Manager schreibt das Spiel
    „RequestLocationInventory … requested inventory for Location[Stanton4_NewBabbage]“."""
    cfg = read_json(PROG, {}) or {}
    live = cfg.get("logDir") or Api().default_live_dir()
    path = os.path.join(live or "", "Game.log")
    try:
        with open(path, "rb") as f:
            f.seek(0, 2)
            f.seek(max(0, f.tell() - 4 * 1024 * 1024))
            text = f.read().decode("utf-8", "replace")
    except OSError:
        return None
    hits = re.findall(r"requested inventory for Location\[([^\]]+)\]", text)
    hits = [h for h in hits if h != "INVALID_LOCATION_ID"]
    return hits[-1] if hits else None


def erfassung_senden(name, data, loc=None):
    """Kisten-Ausschnitt in die Erfassungsliste: „privat“ zum Pi, sonst in den eigenen Server."""
    import base64
    b64 = base64.b64encode(data).decode("ascii")
    if not PI_BASE:
        try:
            import hysec_server
            res = hysec_server.erfassung_neu(name, b64, loc)
            return bool(res.get("ok")), "in der Liste (%s offen)" % res.get("offen", "?")
        except Exception as e:
            return False, "nicht gespeichert (%s)" % e
    try:
        body = json.dumps([name, b64, loc]).encode("utf-8")
        req = urllib.request.Request(PI_BASE + "api/erfassung_neu", data=body, method="POST",
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=60) as r:
            res = json.loads(r.read() or b"{}")
        return bool(res.get("ok")), ("in der Liste (%s offen)" % res.get("offen") if res.get("ok") else "Pi: %s" % res.get("error"))
    except Exception as e:
        return False, "Pi nicht erreichbar (%s)" % e


def erfassung_starten(win):
    """Tastenkürzel (Standard Pause, in den Einstellungen änderbar): Kisten-Tooltip erfassen. Nur Windows."""
    if os.name != "nt":
        return
    import erfassung

    def melden(text, ok):
        try:
            win.evaluate_js("typeof toast==='function' && toast(%s)" % json.dumps(("📷 " if ok else "⚠ ") + text))
        except Exception:
            pass

    ws = erfassung.Warteschlange(os.path.join(DATA, "erfassung"), erfassung_senden, melden, ort_aus_log)
    los = ws.foto
    cfg0 = read_json(PROG, {}) or {}
    erfassung.TON.update(name=cfg0.get("ton", "wc4_lock"), vol=cfg0.get("tonVol", 50), dir=DATA)
    hk = erfassung.Hotkey(los)
    HOTKEY["obj"] = hk
    combo = (read_json(PROG, {}) or {}).get("hotkey") or HOTKEY_STD
    if not hk.start(combo):
        melden("Erfassungs-Taste: " + (hk.fehler or "nicht aktiv"), False)

    # Fern-Auslöser: „📷 Am PC erfassen“ auf dem Handy → hier nachfragen (ca. 3× pro Sekunde, sehr kleine Anfrage)
    def fern():
        while True:
            time.sleep(0.35)
            try:
                if PI_BASE:
                    req = urllib.request.Request(PI_BASE + "api/erfassung_auftrag", data=b"[]", method="POST")
                    with urllib.request.urlopen(req, timeout=4) as r:
                        res = json.loads(r.read() or b"{}")
                else:
                    import hysec_server
                    res = hysec_server.erfassung_auftrag()
                if res.get("los"):
                    hk.ausloesen()
            except Exception:
                time.sleep(4)
    threading.Thread(target=fern, daemon=True, name="pliskin-fern").start()

    # Spiel läuft „als Administrator“, Pliskin nicht → Windows gibt die Taste nicht weiter. Einmal Bescheid sagen.
    def waechter():
        gemeldet = False
        while True:
            time.sleep(2)
            if HOTKEY_INFO.get("admin"):
                return
            e = erfassung.vordergrund_erhoeht()
            HOTKEY_INFO["spielAdmin"] = bool(e)
            if e and not gemeldet:
                gemeldet = True
                melden("Das Spiel läuft mit höheren Rechten als Pliskin – dann kommt die Taste dort evtl. nicht an. Einstellungen → Programm → „Als Administrator neu starten“ (oder vom Handy auslösen).", False)
    HOTKEY_INFO["admin"] = erfassung.ist_admin()
    threading.Thread(target=waechter, daemon=True, name="pliskin-waechter").start()


def single_instance():
    """Nur ein Hysec-Fenster: zwei Fenster teilen sich den Browser-Speicher und blockieren sich.
    Laeuft schon eins, wird es nach vorne geholt und dieser Start beendet."""
    if os.name != "nt":
        return True
    import ctypes
    k32, u32 = ctypes.windll.kernel32, ctypes.windll.user32
    handle = k32.CreateMutexW(None, False, "HysecIndustrie_EinFenster")
    if k32.GetLastError() == 183:  # ERROR_ALREADY_EXISTS
        hwnd = u32.FindWindowW(None, APP_NAME)
        if hwnd:
            u32.ShowWindow(hwnd, 9)          # SW_RESTORE
            u32.SetForegroundWindow(hwnd)
        return False
    globals()["_MUTEX"] = handle           # offen halten, solange das Programm laeuft
    return True


def start_local():
    """Release-Ausgabe: eigenen Server im Hintergrund starten (nur dieses Fenster oder – Server-Modus – ganzes Heimnetz)."""
    import hysec_server
    api = Api()

    def run():
        cfg = dict(PROG_DEFAULT, **(read_json(PROG, {}) or {}))
        host = "0.0.0.0" if cfg.get("server") else "127.0.0.1"
        want = int(cfg.get("port") or 8770) if cfg.get("server") else (SERVER["port"] or 0)
        for port in (want, 0):   # Port belegt -> freien nehmen
            try:
                srv, p = hysec_server.start(api, host, port, os.path.join(base_dir(), "app"), desktop=True, info=lambda: app_info(True))
                SERVER.update(srv=srv, port=p, host=host)
                return p
            except OSError:
                continue
        raise OSError("Kein freier Port")

    def restart():
        old_port = SERVER["port"]
        if SERVER["srv"]:
            SERVER["srv"].shutdown()
            SERVER["srv"].server_close()
        p = run()
        return {"port": p, "reload": "http://127.0.0.1:%d/index.html?app=1" % p} if p != old_port else {"port": p}
    SERVER["restart"] = restart
    run()
    return api, "http://127.0.0.1:%d/index.html?app=1" % SERVER["port"]


def main():
    if not single_instance():
        return
    if os.name == "nt":
        import erfassung
        erfassung.dpi_aware()   # Bildschirmfotos in echter Auflösung
    if EDITION == "privat" and "--lokal" not in sys.argv:
        api = Api()
        start = find_pi() or os.path.join(base_dir(), "app", "offline.html")
    else:
        api, start = start_local()
    def im_browser():   # ohne Fenster-Bausteine (z. B. Linux ohne Qt/GTK): im Standard-Browser oeffnen, Server laeuft weiter
        import webbrowser
        webbrowser.open(start)
        print("Pliskin Industrie laeuft im Browser:", start, "(beenden mit Strg+C)", flush=True)
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            return
    if webview is None or "--browser" in sys.argv:
        return im_browser()
    try:
        win = webview.create_window(APP_NAME, start, js_api=api, width=1500, height=950,
                                    min_size=(1100, 700), background_color="#0b0c0e")
        api._window = win
        erfassung_starten(win)
        webview.start(debug="--debug" in sys.argv, private_mode=False,
                      storage_path=os.path.join(DATA, "webview"))
    except Exception as e:  # Fenster geht nicht -> Browser
        print("Programmfenster nicht moeglich (%s) – oeffne im Browser." % e, flush=True)
        if start.startswith("http"):
            im_browser()


if __name__ == "__main__":
    # Der eingebaute Server importiert „hysec_industrie“ – dieselbe Modul-Instanz verwenden (sonst zwei getrennte Zustände)
    sys.modules.setdefault("hysec_industrie", sys.modules["__main__"])
    main()
