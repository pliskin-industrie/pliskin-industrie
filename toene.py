"""Pliskin Industrie – eigene Sci-Fi-Töne für die Erfassung (nur Python-Bordmittel, keine fremden Sounds).
klang(name, ok, lautstaerke 0..100) → WAV-Bytes. Varianten: wc4_lock, wc4_vdu, wc4_nav, zielerfassung, funk, bordcomputer, scanner, kamera, glas, chip, adlib, terminal. Fehlerton je Variante passend dazu."""
import io
import math
import random
import struct
import wave

RATE = 22050


def _wav(samples):
    b = io.BytesIO()
    with wave.open(b, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", max(-32767, min(32767, int(s * 32767)))) for s in samples))
    return b.getvalue()


def _ton(f0, dauer, f1=None, att=0.008, dec=6.0, obert=0.25, schweb=2.5, form="sin"):
    """weicher Ton: Anschlag, exponentielles Ausklingen, leichte Schwebung (zwei leicht verstimmte Stimmen)."""
    n = int(dauer * RATE); out = []
    ph1 = ph2 = 0.0
    for i in range(n):
        t = i / RATE
        f = f0 if f1 is None else f0 + (f1 - f0) * (t / dauer)
        ph1 += 2 * math.pi * f / RATE; ph2 += 2 * math.pi * (f + schweb) / RATE
        env = min(1.0, t / att) * math.exp(-dec * t)
        if form == "tri":
            v = (2 / math.pi) * math.asin(math.sin(ph1))
        else:
            v = 0.5 * (math.sin(ph1) + math.sin(ph2)) + obert * math.sin(2 * ph1) * 0.5
        out.append(v * env)
    return out


def _klick(dauer=0.03, hell=0.6):
    """kurzer, gefilterter Rausch-Klick (wie ein Kamera-Verschluss)."""
    random.seed(7); n = int(dauer * RATE); out = []; y = 0.0
    for i in range(n):
        y = y + hell * (random.uniform(-1, 1) - y)    # Tiefpass
        out.append(y * math.exp(-i / (n / 4)))
    return out


def _rechteck(f, dauer, puls=0.5, dec=8.0, tief=0.35):
    """Retro-Rechteckton (wie PC-Speaker/Chiptune), leicht gefiltert, damit er nicht kratzt."""
    n = int(dauer * RATE); out = []; ph = 0.0; y = 0.0
    for i in range(n):
        ph = (ph + f / RATE) % 1.0
        v = 1.0 if ph < puls else -1.0
        y += tief * (v - y)
        out.append(y * min(1.0, i / (0.004 * RATE)) * math.exp(-dec * i / RATE))
    return out


def _fm(f, dauer, verh=3.5, index=2.5, dec=5.0):
    """2-Operator-FM wie die AdLib/Sound-Blaster-Karten der 90er (Glocke/Metall)."""
    n = int(dauer * RATE); out = []
    for i in range(n):
        t = i / RATE; e = math.exp(-dec * t)
        out.append(math.sin(2 * math.pi * f * t + index * e * math.sin(2 * math.pi * f * verh * t)) * min(1.0, t / 0.003) * e)
    return out


def _crush(x, stufen=24, halten=3):
    """grob auflösen (wenige Lautstärkestufen, niedrigere Abtastrate) = Retro-Körnung"""
    out = []; last = 0.0
    for i, v in enumerate(x):
        if i % halten == 0:
            last = round(v * stufen) / stufen
        out.append(last)
    return out


def _saege(f0, dauer, f1=None, dec=6.0, cut=0.18, res=0.0, vib=0.0):
    """analoger Synth: Sägezahn durch Tiefpass (wie die Cockpit-Synths der 90er), optional Vibrato."""
    n = int(dauer * RATE); out = []; ph = 0.0; y1 = y2 = 0.0
    for i in range(n):
        t = i / RATE
        f = (f0 if f1 is None else f0 * (f1 / f0) ** (t / dauer)) * (1 + vib * math.sin(2 * math.pi * 7 * t))
        ph = (ph + f / RATE) % 1.0
        v = 2 * ph - 1
        y1 += cut * (v - y1 + res * (y1 - y2)); y2 += cut * (y1 - y2)
        out.append(y2 * min(1.0, t / 0.005) * math.exp(-dec * t))
    return out


def _rauschen(dauer, hell=0.3, dec=10.0):
    random.seed(3); n = int(dauer * RATE); out = []; y = 0.0
    for i in range(n):
        y += hell * (random.uniform(-1, 1) - y)
        out.append(y * math.exp(-dec * i / RATE))
    return out


def _sweep_rauschen(dauer, von=0.04, bis=0.5, dec=3.0):
    """Rauschen, dessen Filter sich öffnet (Triebwerk/Autopilot-„Wusch“)."""
    random.seed(11); n = int(dauer * RATE); out = []; y = 0.0
    for i in range(n):
        k = von + (bis - von) * (i / n) ** 1.5
        y += k * (random.uniform(-1, 1) - y)
        out.append(y * min(1.0, i / (0.05 * RATE)) * math.exp(-dec * i / RATE))
    return out


def _wc4(x):
    """Klang wie die 8-Bit-Samples von 1996: etwas weniger Stufen + halbe Abtastrate (leichte Körnung)."""
    return _crush(x, 48, 2)


def _mix(*teile):
    """(startzeit, samples, lautstaerke) zusammenmischen"""
    n = max(int(s * RATE) + len(x) for s, x, _ in teile)
    out = [0.0] * n
    for s, x, v in teile:
        o = int(s * RATE)
        for i, val in enumerate(x):
            out[o + i] += val * v
    return out


def _echo(x, zeit=0.11, staerke=0.3, mal=3):
    d = int(zeit * RATE); out = x + [0.0] * d * mal
    for k in range(1, mal + 1):
        for i, v in enumerate(x):
            out[i + d * k] += v * staerke ** k
    return out


def klang(name="wc4_lock", ok=True, lautstaerke=50):
    vol = max(0, min(100, lautstaerke)) / 100 * 0.55
    if name == "wc4_lock":     # Raketen-Aufschaltung: Pieptöne werden schneller, dann Dauerton = „Lock“
        if ok:
            teile, s = [], 0.0
            for d in (0.075, 0.06, 0.045, 0.035):
                teile.append((s, _rechteck(1240, 0.035, 0.5, 6, 0.3), 0.42)); s += d
            teile.append((s, _rechteck(1240, 0.24, 0.5, 5, 0.3), 0.42))
            x = _wc4(_mix(*teile))
        else:
            x = _wc4(_mix((0, _rechteck(620, 0.09, 0.5, 6, 0.3), 0.45), (0.13, _rechteck(620, 0.09, 0.5, 6, 0.3), 0.45), (0.26, _rechteck(460, 0.25, 0.5, 6, 0.3), 0.45)))
    elif name == "wc4_vdu":    # Display umschalten: Relais-Klick + drei fallende Digital-Zirper + kurzer Bestätigungston
        x = _wc4(_mix((0, _klick(0.018, 0.8), 0.6), *[(0.02 + i * 0.035, _rechteck(f, 0.03, 0.3, 20, 0.35), 0.38) for i, f in enumerate((2093, 1760, 1397))],
                      (0.14, _ton(1047, 0.16, dec=12, obert=0.3), 0.4))) if ok \
            else _wc4(_mix((0, _klick(0.018, 0.8), 0.6), (0.03, _rechteck(196, 0.3, 0.5, 5, 0.12), 0.55)))
    elif name == "wc4_nav":    # Autopilot / NAV-Punkt: Triebwerks-Wusch + aufsteigender Zweiklang
        x = _wc4(_echo(_mix((0, _sweep_rauschen(0.35, 0.03, 0.4, 4), 0.35), (0.12, _saege(392, 0.3, 784, dec=5, cut=0.15), 0.3),
                            (0.25, _ton(784, 0.2, dec=9), 0.3), (0.25, _ton(1175, 0.25, dec=8), 0.25)), 0.12, 0.22, 2)) if ok \
            else _wc4(_mix((0, _sweep_rauschen(0.3, 0.4, 0.03, 5), 0.35), (0.05, _saege(392, 0.35, 196, dec=5, cut=0.15), 0.35)))
    elif name == "zielerfassung":   # Ziel-Erfassung: aufsteigender Such-Ton mit Flattern, dann zwei Lock-Pulse
        x = _echo(_mix((0, _saege(300, 0.22, 1100, dec=2, cut=0.12, vib=0.04), 0.45),
                       (0.23, _ton(1480, 0.06, dec=20, obert=0.2), 0.45), (0.31, _ton(1480, 0.12, dec=12, obert=0.2), 0.45)), 0.1, 0.25, 2) if ok \
            else _echo(_mix((0, _saege(900, 0.35, 180, dec=3, cut=0.12, vib=0.08), 0.5)), 0.1, 0.25, 2)
    elif name == "funk":       # Funk-Kanal: kurzes Rauschen wie beim Öffnen eines Comm-Kanals, dann Doppel-Zirp
        x = _mix((0, _rauschen(0.09, 0.45, 25), 0.35), (0.06, _saege(1800, 0.05, 900, dec=25, cut=0.25), 0.45),
                 (0.13, _ton(1175, 0.07, dec=18), 0.4), (0.21, _ton(1568, 0.14, dec=11), 0.4)) if ok \
            else _mix((0, _rauschen(0.07, 0.45, 25), 0.35), (0.05, _saege(700, 0.3, 300, dec=6, cut=0.15), 0.5), (0.28, _rauschen(0.12, 0.6, 30), 0.3))
    elif name == "bordcomputer":   # Bordcomputer: tiefer „Daten angenommen“-Synth mit Abfall + heller Bestätigung
        x = _echo(_mix((0, _saege(220, 0.18, 110, dec=10, cut=0.1, res=0.6), 0.6), (0.02, _ton(55, 0.15, dec=18, obert=0), 0.5),
                       (0.12, _saege(880, 0.2, 990, dec=10, cut=0.2), 0.35)), 0.11, 0.22, 2) if ok \
            else _mix((0, _saege(110, 0.35, 98, dec=4, cut=0.12, res=0.4, vib=0.02), 0.6), (0.18, _saege(104, 0.25, 92, dec=6, cut=0.12), 0.5))
    elif name == "chip":        # Chiptune: schnelles Rechteck-Arpeggio (C-E-G-C) wie ein DOS-Spiel „OK“
        x = _crush(_mix(*[(i * 0.045, _rechteck(f, 0.07 if i < 3 else 0.16, 0.5, 10 if i < 3 else 9), 0.5) for i, f in enumerate((523, 659, 784, 1046))]), 20, 2) if ok \
            else _crush(_mix((0, _rechteck(311, 0.12, 0.25, 8), 0.5), (0.13, _rechteck(233, 0.22, 0.25, 7), 0.5)), 20, 2)
    elif name == "adlib":     # FM-Glocke der 90er-Soundkarten, zwei Töne mit kurzem Hall
        x = _echo(_mix((0, _fm(880, 0.25, 3.5, 2.2, 9), 0.45), (0.08, _fm(1320, 0.4, 3.5, 2.0, 7), 0.4)), 0.12, 0.25, 2) if ok \
            else _echo(_mix((0, _fm(330, 0.5, 1.41, 3.0, 5), 0.5)), 0.12, 0.25, 2)
    elif name == "terminal":  # Cockpit-Computer: kurze Daten-Zirper, dann Bestätigung (gekörnt)
        x = _crush(_mix(*[(i * 0.028, _rechteck(1200 + 380 * ((i * 7) % 4), 0.022, 0.5, 30), 0.35) for i in range(5)],
                        (0.16, _rechteck(1568, 0.14, 0.5, 12), 0.45)), 16, 3) if ok \
            else _crush(_mix(*[(i * 0.09, _rechteck(f, 0.08, 0.5, 14), 0.5) for i, f in enumerate((440, 330, 220))]), 16, 3)
    elif name == "kamera":
        x = _mix((0, _klick(0.025, 0.7), 0.9), (0.045, _klick(0.02, 0.5), 0.6),
                 (0.07, _ton(1046, 0.16, dec=18), 0.35)) if ok else _mix((0, _klick(0.03, 0.4), 0.6), (0.04, _ton(392, 0.28, 262, dec=7, form="tri"), 0.45))
    elif name == "glas":
        x = _echo(_mix((0, _ton(784, 0.5, dec=7, obert=0.4), 0.30), (0.06, _ton(988, 0.5, dec=7, obert=0.4), 0.28),
                       (0.12, _ton(1319, 0.6, dec=6, obert=0.3), 0.26)), 0.14, 0.28) if ok \
            else _echo(_mix((0, _ton(523, 0.45, 494, dec=6), 0.3), (0.1, _ton(392, 0.5, 370, dec=6), 0.3)), 0.14, 0.25)
    else:   # scanner: Verschluss-Klick + zwei weiche, aufsteigende Töne mit Nachhall
        x = _echo(_mix((0, _klick(0.02, 0.5), 0.5), (0.03, _ton(660, 0.09, 700, dec=14), 0.35),
                       (0.10, _ton(990, 0.22, 1040, dec=9), 0.32)), 0.09, 0.3) if ok \
            else _echo(_mix((0, _ton(330, 0.25, 220, dec=6, form="tri"), 0.5)), 0.1, 0.25)
    m = max(1e-9, max(abs(v) for v in x))
    return _wav([v / m * vol for v in x])


def spielen(name="wc4_lock", ok=True, lautstaerke=50, eigene=None):
    """Windows: über die normale Lautstärke (nicht der laute Beep). eigene = Pfad zu eigener WAV-Datei."""
    try:
        import winsound
        if eigene:
            winsound.PlaySound(eigene, winsound.SND_FILENAME)
        elif lautstaerke > 0:
            winsound.PlaySound(klang(name, ok, lautstaerke), winsound.SND_MEMORY)
    except Exception:
        pass


if __name__ == "__main__":   # Probedateien schreiben
    import sys, os
    ziel = sys.argv[1] if len(sys.argv) > 1 else "."
    for n in ("wc4_lock", "wc4_vdu", "wc4_nav", "zielerfassung", "funk", "bordcomputer", "scanner", "kamera", "glas", "chip", "adlib", "terminal"):
        for ok in (True, False):
            open(os.path.join(ziel, "ton-%s-%s.wav" % (n, "ok" if ok else "fehler")), "wb").write(klang(n, ok, 50))
