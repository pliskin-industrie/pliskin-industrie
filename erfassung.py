"""Pliskin Industrie – Bildschirm-Erfassung per Tastenkürzel (nur Windows, nur Python-Bordmittel).

Taste (Standard Strg+Alt+P) drücken, während das Spiel läuft → Bildschirmfoto des Hauptbildschirms als PNG
→ wird in <Daten>/erfassung/ abgelegt und (Ausgabe „privat“) zum Pi geschickt. Kurzer Ton als Rückmeldung:
hoch = gespeichert, tief = Fehler. Später wertet die Bilderkennung diese Bilder aus (Einlagern-Vorschau).

Grenzen: Spiel im „Vollbild (exklusiv)“ kann ein schwarzes Bild liefern → im Spiel „Randloses Fenster“ verwenden.
"""
import ctypes
import os
import struct
import sys
import threading
import time
import zlib

MOD_ALT, MOD_CONTROL, MOD_SHIFT, MOD_NOREPEAT = 0x1, 0x2, 0x4, 0x4000
WM_HOTKEY = 0x0312


def png_bytes(w, h, bgra):
    """32-Bit-BGRA (oben→unten) → PNG (RGB, ohne Pillow)."""
    rgb = bytearray(w * h * 3)
    rgb[0::3] = bgra[2::4]
    rgb[1::3] = bgra[1::4]
    rgb[2::3] = bgra[0::4]
    stride = w * 3
    mv = memoryview(rgb)
    raw = b"".join(b"\x00" + mv[y * stride:(y + 1) * stride] for y in range(h))

    def chunk(typ, data):
        return struct.pack(">I", len(data)) + typ + data + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b""))


def _lila(r, g, b):
    return r > 60 and b > 80 and g < 0.62 * min(r, b) and b - g > 40


def tooltip_box(w, h, bgra):
    """Tooltip (Maus über einer Kiste) finden: violetter Material-Balken. → (x0, y0, x1, y1) oder None.
    Sucht auf jedem 2. Pixel; Balkenmitte = Zeile mit den meisten violetten Pixeln (± 60 %)."""
    runs = []
    for y in range(0, h, 2):
        row = bgra[y * w * 4:(y + 1) * w * 4]
        n = 0
        for i in range(0, len(row), 8):
            if _lila(row[i + 2], row[i + 1], row[i]):
                n += 1
        runs.append(n)
    m = max(runs) if runs else 0
    if m < 10:
        return None
    ym = runs.index(m); a = b = ym
    while a > 0 and runs[a - 1] >= 0.6 * m: a -= 1
    while b < len(runs) - 1 and runs[b + 1] >= 0.6 * m: b += 1
    yc = a + b                      # Mitte in voller Auflösung
    row = bgra[yc * w * 4:(yc + 1) * w * 4]
    xs = [x for x in range(w) if _lila(row[x * 4 + 2], row[x * 4 + 1], row[x * 4])]
    # längster zusammenhängender Lauf (Text im Balken = kleine Lücken)
    best, s, last = (0, 0), None, -99
    for x in xs:
        if s is None or x - last > 30: s = x
        if x - s > best[1] - best[0]: best = (s, x)
        last = x
    x0 = best[0]
    return (max(0, x0 - 40), max(0, yc - 125), min(w, x0 + 360), min(h, yc + 40))


def _petrol(r, g, b):
    return r < 16 and 50 <= g <= 76 and 50 <= b <= 76 and abs(g - b) < 9


def bp_box(w, h, bgra):
    """Blueprint-Tooltip im Fabrication Kiosk (Name in petrolfarbenem Kasten neben der Maus) → (x0, y0, x1, y1) oder None.
    Zeilen mit langem petrolfarbenem Lauf sammeln; Text-Zeilen dazwischen dürfen fehlen; gleiche rechte Kante = ein Kasten."""
    s = h / 1125.0
    minrun, maxgap = int(150 * s), 6 * s
    rows = []
    for y in range(0, h, 2):
        o = y * w * 4
        best, st, gap, last = (0, 0), None, 0, 0
        for x in range(0, w, 2):
            i = o + x * 4
            if _petrol(bgra[i + 2], bgra[i + 1], bgra[i]):
                if st is None: st = x
                last, gap = x, 0
            elif st is not None:
                gap += 1
                if gap > maxgap:
                    if last - st > best[1] - best[0]: best = (st, last)
                    st, gap = None, 0
        if st is not None and last - st > best[1] - best[0]: best = (st, last)
        if best[1] - best[0] >= minrun:
            rows.append((best[0], best[1], y))
    boxes, cur = [], None
    for r in rows + [None]:
        if r and cur and r[2] - cur[3] <= 24 * s and abs(r[1] - cur[1]) < 10 * s:
            cur = (min(cur[0], r[0]), max(cur[1], r[1]), cur[2], r[2])
        else:
            if cur: boxes.append(cur)
            cur = (r[0], r[1], r[2], r[2]) if r else None
    boxes = [b for b in boxes if 22 * s <= b[3] - b[2] <= 70 * s]
    if not boxes:
        return None
    b = max(boxes, key=lambda b: (b[1] - b[0]) * (b[3] - b[2]))
    return (max(0, b[0] - 4), max(0, b[2] - 4), min(w, b[1] + 6), min(h, b[3] + 6))


def _hudblau(r, g, b):
    return b > 200 and g > 170 and r < 170 and b - r > 70


def traktor_box(w, h, bgra):
    """Traktorstrahl-Anzeige („100.0% TITANIUM [AVG 295Q]“, darunter „1.2t“) in der Bildmitte → (x0, y0, x1, y1) oder None.
    Hellblaue Textzeile suchen (Mitte des Bildes), Ausschnitt links bis zum Kreis/Gewicht, unten bis unter die Tonnen-Zeile."""
    xa, xb, ya, yb = int(w * .30), int(w * .88), int(h * .30), int(h * .78)
    rows = {}
    for y in range(ya, yb, 2):
        o = y * w * 4
        n = 0
        for x in range(xa, xb, 2):
            i = o + x * 4
            if _hudblau(bgra[i + 2], bgra[i + 1], bgra[i]): n += 1
        if n: rows[y] = n
    if not rows: return None
    ym = max(rows, key=rows.get)
    if rows[ym] < 40 * w / 2560: return None
    t = b = ym
    while rows.get(t - 2, 0) >= rows[ym] * 0.15: t -= 2
    while rows.get(b + 2, 0) >= rows[ym] * 0.15: b += 2
    xs = []
    for y in range(t, b + 1, 2):
        o = y * w * 4
        xs += [x for x in range(xa, xb, 2) if _hudblau(bgra[o + x * 4 + 2], bgra[o + x * 4 + 1], bgra[o + x * 4])]
    if not xs: return None
    xs.sort(); x0, x1 = xs[int(len(xs) * .01)], xs[int(len(xs) * .99)]
    zh = b - t + 2
    if x1 - x0 < 8 * zh or zh > 0.05 * h: return None   # keine Textzeile
    return (max(0, x0 - int(3.5 * zh)), max(0, t - zh // 2), min(w, x1 + zh), min(h, b + int(2.2 * zh)))


def ausschnitt(w, h, bgra, box):
    x0, y0, x1, y1 = box
    cw = x1 - x0
    out = bytearray()
    for y in range(y0, y1):
        out += bgra[(y * w + x0) * 4:(y * w + x1) * 4]
    return cw, y1 - y0, bytes(out)


def dpi_aware():
    """Echte Pixel statt hochskalierter Größe (vor dem Fenster aufrufen)."""
    if os.name != "nt":
        return
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass


def grab():
    """Bildschirmfoto des Hauptbildschirms → (breite, hoehe, BGRA-Bytes)."""
    from ctypes import wintypes
    u32, g32 = ctypes.windll.user32, ctypes.windll.gdi32
    H = ctypes.c_void_p
    u32.GetDC.restype = H; u32.GetDC.argtypes = [H]
    u32.ReleaseDC.argtypes = [H, H]
    g32.CreateCompatibleDC.restype = H; g32.CreateCompatibleDC.argtypes = [H]
    g32.CreateCompatibleBitmap.restype = H; g32.CreateCompatibleBitmap.argtypes = [H, ctypes.c_int, ctypes.c_int]
    g32.SelectObject.restype = H; g32.SelectObject.argtypes = [H, H]
    g32.BitBlt.argtypes = [H, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, H, ctypes.c_int, ctypes.c_int, wintypes.DWORD]
    g32.GetDIBits.argtypes = [H, H, wintypes.UINT, wintypes.UINT, ctypes.c_void_p, ctypes.c_void_p, wintypes.UINT]
    g32.DeleteObject.argtypes = [H]
    g32.DeleteDC.argtypes = [H]

    class BIH(ctypes.Structure):
        _fields_ = [("biSize", wintypes.DWORD), ("biWidth", ctypes.c_long), ("biHeight", ctypes.c_long),
                    ("biPlanes", wintypes.WORD), ("biBitCount", wintypes.WORD), ("biCompression", wintypes.DWORD),
                    ("biSizeImage", wintypes.DWORD), ("biXPelsPerMeter", ctypes.c_long), ("biYPelsPerMeter", ctypes.c_long),
                    ("biClrUsed", wintypes.DWORD), ("biClrImportant", wintypes.DWORD)]

    w, h = u32.GetSystemMetrics(0), u32.GetSystemMetrics(1)
    sdc = u32.GetDC(None)
    mdc = g32.CreateCompatibleDC(sdc)
    bmp = g32.CreateCompatibleBitmap(sdc, w, h)
    old = g32.SelectObject(mdc, bmp)
    try:
        if not g32.BitBlt(mdc, 0, 0, w, h, sdc, 0, 0, 0x00CC0020 | 0x40000000):   # SRCCOPY | CAPTUREBLT
            raise OSError("BitBlt fehlgeschlagen")
        bih = BIH(ctypes.sizeof(BIH), w, -h, 1, 32, 0, 0, 0, 0, 0, 0)       # -h = Zeilen von oben nach unten
        buf = ctypes.create_string_buffer(w * h * 4)
        if not g32.GetDIBits(mdc, bmp, 0, h, buf, ctypes.byref(bih), 0):
            raise OSError("GetDIBits fehlgeschlagen")
        return w, h, buf.raw
    finally:
        g32.SelectObject(mdc, old)
        g32.DeleteObject(bmp)
        g32.DeleteDC(mdc)
        u32.ReleaseDC(None, sdc)


TON = {"name": "wc4_lock", "vol": 50, "dir": None}   # setzt pliskin_industrie.py aus programm.json


def ton(ok=True):
    """Rückmeldung: eigener Klang über die normale Windows-Lautstärke (toene.py). Eigene WAV: <Daten>/ton-ok.wav bzw. ton-fehler.wav."""
    try:
        import toene
        eigene = None
        if TON.get("dir"):
            p = os.path.join(TON["dir"], "ton-ok.wav" if ok else "ton-fehler.wav")
            eigene = p if os.path.exists(p) else None
        if TON.get("name") == "aus" and not eigene:
            return
        toene.spielen(TON.get("name") or "wc4_lock", ok, int(TON.get("vol", 50)), eigene)
    except Exception:
        pass


class Warteschlange:
    """Taste „spammen“: jedes Drücken macht sofort das Bildschirmfoto (schnell) und stellt es in die Schlange;
    ein Arbeiter sucht den Tooltip, schneidet aus und schickt nacheinander – das nächste Foto wartet nicht darauf."""
    def __init__(self, ziel_dir, senden=None, melden=None, ort=None):
        import queue
        self.q, self.ziel_dir, self.senden, self.melden, self.ort = queue.Queue(), ziel_dir, senden, melden, ort
        self.nr, self._lock = 0, threading.Lock()
        threading.Thread(target=self._arbeiter, daemon=True, name="pliskin-erfassung").start()

    def foto(self):
        try:
            w, h, px = grab()
        except Exception as e:
            ton(False)
            if self.melden: self.melden("Foto fehlgeschlagen: %s" % e, False)
            return
        with self._lock:
            self.nr += 1
            stamp = time.strftime("%Y%m%d-%H%M%S") + "-%03d" % (self.nr % 1000)   # Nummer statt ms: eindeutig auch bei schnellem Drücken
        self.q.put((w, h, px, stamp))

    def _arbeiter(self):
        while True:
            w, h, px, stamp = self.q.get()
            try:
                box, art = traktor_box(w, h, px), "traktor"   # Kiste im Traktorstrahl (zuerst: violette Holo-Kisten im Hintergrund täuschen sonst den Kisten-Tooltip)
                if not box:
                    box, art = tooltip_box(w, h, px), "kiste"
                if not box:
                    box, art = bp_box(w, h, px), "bp"   # kein Kisten-Tooltip → Blueprint im Fabricator?
                if not box:
                    os.makedirs(self.ziel_dir, exist_ok=True)   # zur Fehlersuche ganzes Bild behalten
                    with open(os.path.join(self.ziel_dir, "ohne-tooltip-%s.png" % stamp), "wb") as f:
                        f.write(png_bytes(w, h, px))
                    ton(False)
                    if self.melden: self.melden("Nichts gefunden – Maus über Kiste/Blueprint halten oder Kiste im Traktorstrahl", False)
                    continue
                cw, ch, cut = ausschnitt(w, h, px, box)
                data = png_bytes(cw, ch, cut)
                threading.Thread(target=ton, args=(True,), daemon=True).start()   # Ton sofort, Senden läuft weiter
                loc = self.ort() if self.ort else None
                ok, extra = (self.senden("%s-%s.png" % (art, stamp), data, loc) if self.senden else (True, "gespeichert"))
                if not ok:
                    ton(False)
                rest = self.q.qsize()
                if self.melden: self.melden(("Blueprint" if art == "bp" else "Kiste (Traktorstrahl)" if art == "traktor" else "Kiste") + " erfasst – " + extra + (" · noch %d in der Schlange" % rest if rest else ""), ok)
            except Exception as e:
                ton(False)
                if self.melden: self.melden("Erfassung fehlgeschlagen: %s" % e, False)


def ist_admin():
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def vordergrund_erhoeht():
    """Läuft das Fenster im Vordergrund (z. B. das Spiel) „als Administrator“? None = unbekannt."""
    try:
        from ctypes import wintypes
        u32, k32, a32 = ctypes.windll.user32, ctypes.windll.kernel32, ctypes.windll.advapi32
        k32.OpenProcess.restype = ctypes.c_void_p
        hwnd = u32.GetForegroundWindow()
        pid = wintypes.DWORD()
        u32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        hp = k32.OpenProcess(0x1000, False, pid.value)          # PROCESS_QUERY_LIMITED_INFORMATION
        if not hp:
            return True                                          # nicht einmal lesbar → sehr wahrscheinlich höhere Rechte
        tok = ctypes.c_void_p()
        try:
            if not a32.OpenProcessToken(ctypes.c_void_p(hp), 0x8, ctypes.byref(tok)):
                return True
            elev, n = wintypes.DWORD(), wintypes.DWORD()
            a32.GetTokenInformation(tok, 20, ctypes.byref(elev), 4, ctypes.byref(n))   # TokenElevation
            k32.CloseHandle(tok)
            return bool(elev.value)
        finally:
            k32.CloseHandle(ctypes.c_void_p(hp))
    except Exception:
        return None


MOD_WIN = 0x8
_VK = {"DRUCK": 0x2C, "PRINT": 0x2C, "PAUSE": 0x13, "EINFG": 0x2D, "INSERT": 0x2D, "ENTF": 0x2E, "DELETE": 0x2E,
       "POS1": 0x24, "HOME": 0x24, "ENDE": 0x23, "END": 0x23, "BILD↑": 0x21, "PAGEUP": 0x21, "BILD↓": 0x22, "PAGEDOWN": 0x22,
       "LEERTASTE": 0x20, "SPACE": 0x20, "ROLLEN": 0x91, "SCROLLLOCK": 0x91}


def parse_combo(text):
    """„Strg+Alt+S“ → (mods, vk) oder None. Erlaubt: Strg/Ctrl, Alt, Umschalt/Shift, Win + Buchstabe, Ziffer, F1–F24, Num0–9, Druck …"""
    mods, vk = 0, None
    for teil in [x.strip() for x in (text or "").split("+") if x.strip()]:
        u = teil.upper()
        if u in ("STRG", "CTRL", "CONTROL"): mods |= MOD_CONTROL
        elif u == "ALT": mods |= MOD_ALT
        elif u in ("UMSCHALT", "SHIFT"): mods |= MOD_SHIFT
        elif u == "WIN": mods |= MOD_WIN
        elif len(u) == 1 and u.isascii() and u.isalnum(): vk = ord(u)
        elif u[:1] == "F" and u[1:].isdigit() and 1 <= int(u[1:]) <= 24: vk = 0x6F + int(u[1:])
        elif u.startswith("NUM") and u[3:].isdigit() and len(u) == 4: vk = 0x60 + int(u[3:])
        elif u in _VK: vk = _VK[u]
        else: return None
    if vk is None or (not mods and not (0x70 <= vk <= 0x87 or vk in (0x2C, 0x13, 0x91))):
        return None   # einfache Taste ohne Strg/Alt nur bei F-Tasten/Druck/Pause/Rollen (sonst stört es beim Tippen)
    return mods, vk


class Hotkey:
    """Erfassungs-Taste. Fragt den Tastenzustand selbst ab (GetAsyncKeyState, ca. 40× pro Sekunde) statt RegisterHotKey:
    Spiele wie Star Citizen schalten System-Hotkeys ab, solange sie vorne sind (Raw Input „NOHOTKEYS“) – die Abfrage
    funktioniert trotzdem. Die Taste geht dabei auch ans Spiel (deshalb eine Taste wählen, die dort nicht belegt ist)."""
    MODS = ((MOD_CONTROL, 0x11), (MOD_ALT, 0x12), (MOD_SHIFT, 0x10))

    def __init__(self, callback):
        self.callback, self.aktiv, self.fehler = callback, None, ""
        self._combo = None
        self._busy = threading.Lock()

    def start(self, combo):
        if os.name != "nt":
            self.fehler = "nur unter Windows"; return False
        ok, _ = self.setzen(combo)
        threading.Thread(target=self._loop, daemon=True, name="pliskin-taste").start()
        return ok

    def _gedrueckt(self):
        u32 = ctypes.windll.user32
        p = self._combo
        if not p:
            return False
        mods, vk = p
        if not (u32.GetAsyncKeyState(vk) & 0x8000):
            return False
        for m, k in self.MODS:
            if (mods & m) and not (u32.GetAsyncKeyState(k) & 0x8000):
                return False
        if (mods & MOD_WIN) and not ((u32.GetAsyncKeyState(0x5B) | u32.GetAsyncKeyState(0x5C)) & 0x8000):
            return False
        return True

    def _loop(self):
        vorher = False
        while True:
            time.sleep(0.025)
            try:
                jetzt = self._gedrueckt()
            except Exception:
                jetzt = False
            if jetzt and not vorher:          # nur beim Herunterdrücken, nicht beim Halten
                threading.Thread(target=self.ausloesen, daemon=True).start()
            vorher = jetzt

    def ausloesen(self):
        """Wie ein Tastendruck (z. B. vom Handy ausgelöst). Foto sofort, Rest in der Warteschlange."""
        self.callback()

    def setzen(self, combo):
        """Neue Taste/Kombination → (ok, fehlertext)"""
        p = parse_combo(combo)
        if not p:
            self.fehler = "Kombination nicht erlaubt: %s" % combo
            return False, self.fehler
        self._combo, self.aktiv, self.fehler = p, combo, ""
        return True, ""


if __name__ == "__main__":   # Test am PC: python erfassung.py → ein Foto, Ausschnitt in .\erfassung-test\
    dpi_aware()
    ws = Warteschlange(os.path.join(os.getcwd(), "erfassung-test"), melden=lambda t, ok: print(t))
    ws.foto(); time.sleep(5)
    sys.exit(0)
