"""Pliskin Industrie – Blueprint-Häkchen in die StarStrings-global.ini (MrKraken StarStrings: https://github.com/MrKraken/StarStrings).
Ohne installiertes StarStrings ändert Pliskin nichts.

In der global.ini (MrKraken StarStrings, eigene Fassung) stehen in den Missionsbeschreibungen Listen
„<EM4>Potential Blueprints</EM4>\\n- [ ] Name …“. Pliskin setzt je Blueprint:
  [X]                     = hab ich
  <EMn>[Gesucht]</EMn>    = fehlt und steckt in einem Crafting-Plan (Farbe EM1–EM4 wählbar, Standard EM2 = grün)
  [Fehlt]                 = fehlt (nicht geplant)
und schreibt in Missionstitel mit blauem [BP] zusätzlich „<EMn>[Gesucht]</EMn>“, wenn die Mission einen gesuchten Blueprint bringt.
Das Spiel liest die Datei nur beim Start → Änderungen gelten ab dem nächsten Spielstart.
Vor der ersten Änderung einer frischen Datei (ohne Pliskin-Markierungen) wird eine Sicherung „global.ini.vor-pliskin-<Datum>“ angelegt."""
import os
import re
import time

# Marken in beiden Sprachen erkennen (Wechsel der Sprache ersetzt die alten)
MARKE = re.compile(r"(\\n- )(?:\[ \]|\[X\]|<EM4>\[X\]</EM4>|\[Fehlt\]|\[Missing\]|<EM\d>\[(?:Gesucht|Wanted)\]</EM\d>) ([^\\\r\n]+)")
# alte („[Gesuchte BP]“) und neue Titel-Marke („[Gesucht]“) in jeder Farbe erkennen
TITEL_BP = re.compile(r"^(<EM4>\[BP\*?\]</EM4> )(?:<EM\d>\[(?:Gesucht(?:e BP)?|Wanted)\]</EM\d> )?")
WORTE = {"de": ("Gesucht", "Fehlt"), "en": ("Wanted", "Missing")}
FARBEN = ("EM1", "EM2", "EM3", "EM4")


def norm(name):
    """Blueprint-Name ohne Klassen-Präfix („Civ/2/A 7MA 'Lorica'“ → „7ma 'lorica'“), klein."""
    return re.sub(r"^[A-Za-z]{2,4}/\d/[A-D] ", "", name or "").strip().lower()


def _basis(key):
    return re.sub(r"(?i)_?(title|desc|description)(?=_|$)", "#", key)


def pfad(live_dir):
    return os.path.join(live_dir, "data", "Localization", "english", "global.ini")


def schreiben(live_dir, status, farbe="EM2", sprache="de"):
    """status = {norm(name): 'x'|'g'|'f'} → global.ini anpassen. farbe = Farb-Tag für [Gesucht]/[Wanted],
    sprache de|en = Wörter der Marken. Gibt Zähler zurück."""
    farbe = farbe if farbe in FARBEN else "EM2"
    ges, fehlt = WORTE.get(sprache, WORTE["de"])
    ZEICHEN = {"x": "[X]", "g": "<%s>[%s]</%s>" % (farbe, ges, farbe), "f": "[%s]" % fehlt}
    GESUCHT_TITEL = "<%s>[%s]</%s> " % (farbe, ges, farbe)
    p = pfad(live_dir)
    if not os.path.exists(p):
        return {"ok": False, "error": "global.ini nicht gefunden: " + p}
    raw = open(p, "rb").read()
    bom = raw.startswith(b"\xef\xbb\xbf")
    text = raw.decode("utf-8-sig")
    nl = "\r\n" if "\r\n" in text else "\n"
    zeilen = text.split(nl)
    if "Potential Blueprints</EM4>" not in text:   # Original-Datei des Spiels oder anderes Sprachpaket → nichts anfassen
        return {"ok": False, "error": "keine StarStrings-Datei (MrKraken) gefunden – erst StarStrings installieren", "ohne": True}
    frisch = not any(w in text for w in ("[Gesucht]", "[Fehlt]", "[Gesuchte BP]", "[Wanted]", "[Missing]"))
    if frisch:   # neue/aktualisierte StarStrings-Datei → Sicherung, bevor Pliskin etwas ändert
        sich = p + ".vor-pliskin-" + time.strftime("%Y%m%d-%H%M%S")
        with open(sich, "wb") as f:
            f.write(raw)
    n = {"x": 0, "g": 0, "f": 0, "unbekannt": 0, "titel": 0}
    gesucht_basis = set()
    for i, z in enumerate(zeilen):
        if "Potential Blueprints</EM4>" not in z or "=" not in z:
            continue
        key, wert = z.split("=", 1)
        treffer = [False]

        def ersetze(m):
            st = status.get(norm(m.group(2)))
            if st not in ZEICHEN:
                n["unbekannt"] += 1
                return m.group(1) + "[ ] " + m.group(2)
            n[st] += 1
            if st == "g":
                treffer[0] = True
            return m.group(1) + ZEICHEN[st] + " " + m.group(2)
        zeilen[i] = key + "=" + MARKE.sub(ersetze, wert)
        if treffer[0]:
            gesucht_basis.add(_basis(key.split(",")[0]))
    for i, z in enumerate(zeilen):   # Titel mit blauem [BP]: „[Gesuchte BP]“ setzen oder entfernen
        if "=" not in z:
            continue
        key, wert = z.split("=", 1)
        if not TITEL_BP.match(wert):
            continue
        rein = TITEL_BP.sub(lambda m: m.group(1), wert, count=1)
        if _basis(key.split(",")[0]) in gesucht_basis:
            rein = TITEL_BP.sub(lambda m: m.group(1) + GESUCHT_TITEL, rein, count=1)
            n["titel"] += 1
        zeilen[i] = key + "=" + rein
    neu = nl.join(zeilen)
    data = (b"\xef\xbb\xbf" if bom else b"") + neu.encode("utf-8")
    if data == raw:
        return dict(n, ok=True, geaendert=False, pfad=p)
    tmp = p + ".pliskin-tmp"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, p)
    return dict(n, ok=True, geaendert=True, pfad=p, sicherung=frisch)
