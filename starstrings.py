"""Pliskin Industrie – Blueprint-Häkchen in die StarStrings-global.ini (MrKraken StarStrings: https://github.com/MrKraken/StarStrings).
Ohne installiertes StarStrings ändert Pliskin nichts.

Verschiedene StarStrings-Stände werden verstanden: Blueprint-Listen „- Name (Zusatz)“ oder „- [ ] Name“, [BP] am Titel-Ende
oder -Anfang, Bauteile „Mil/2/C Epier“ oder „Epier [Military S02 C]“. Welche Fassung installiert ist, erkennt Pliskin selbst (fassung()).
Pliskin setzt je Blueprint in der Liste:
  [X]                     = hab ich
  <EMn>[Gesucht]</EMn>    = fehlt und steckt in einem Crafting-Plan (Farbe EM1–EM4 wählbar, Standard EM2 = grün)
  [Fehlt]                 = fehlt (nicht geplant)
und schreibt in Missionstitel mit blauem [BP] zusätzlich „<EMn>[Gesucht]</EMn>“, wenn die Mission einen gesuchten Blueprint bringt.
Das Spiel liest die Datei nur beim Start → Änderungen gelten ab dem nächsten Spielstart.
Vor der ersten Änderung einer frischen Datei (ohne Pliskin-Markierungen) wird eine Sicherung „global.ini.vor-pliskin-<Datum>“ angelegt."""
import os
import re
import time

# Liste nach „Potential Blueprints“ bis zur nächsten Leerzeile; je Punkt „\\n- “ mit oder ohne Marke (beide Sprachen, jede Farbe)
LISTE = re.compile(r"(Potential Blueprints</EM4>)(.*?)(?=\\n\\n|$)")
PUNKT = re.compile(r"(\\n- )((?:\[ \]|\[X\]|<EM4>\[X\]</EM4>|\[Fehlt\]|\[Missing\]|<EM\d>\[(?:Gesucht|Wanted)\]</EM\d>) )?([^\\\r\n]+)")
# Titel-Marke von Pliskin (alt „[Gesuchte BP]“, neu „[Gesucht]“/„[Wanted]“) – überall im Titel entfernen, dann neu setzen
TITEL_MARKE = re.compile(r"<EM\d>\[(?:Gesucht(?:e BP)?|Wanted)\]</EM\d> ")
ORG_BP = re.compile(r"^<EM4>\[BP\*?\]</EM4> ")
WORTE = {"de": ("Gesucht", "Fehlt"), "en": ("Wanted", "Missing")}
FARBEN = ("EM1", "EM2", "EM3", "EM4")


def norm(name):
    """Blueprint-Name ohne Klassen-Präfix („Civ/2/A 7MA 'Lorica'“ → „7ma 'lorica'“), klein."""
    return re.sub(r"^[A-Za-z]{2,4}/\d/[A-D] ", "", name or "").strip().lower()


def fassung(text):
    """„hysec“ = Hysec-Fassung (Titel beginnen mit „<EM4>[BP*]</EM4>“, Werte-Block in Item-Beschreibungen),
    sonst „standard“. Nur die Hysec-Fassung wird im Programm erwähnt."""
    if text.count("=<EM4>[BP") > 20 or "=== BASE VALUES ===" in text:
        return "hysec"
    return "standard"


def finde(status, name):
    """Status zu einem Listen-Namen – Schreibweisen beider Fassungen: „Mil/2/C Epier“, „Epier [Military S02 C]“,
    „Trawler Scraper Module (Salvage Mod)“, „Venture Arms Base“."""
    kand = [name, re.sub(r"\s*\[[A-Za-z]+ S0*\d+ [A-D]\]$", "", name)]
    kand += [re.sub(r"\s*\([^)]*\)$", "", k) for k in kand]
    kand += [re.sub(r" Base$", "", k) for k in kand]
    for k in kand:
        st = status.get(norm(k))
        if st:
            return st
    return None


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

        def punkt(m):
            st = finde(status, m.group(3))
            if st not in ZEICHEN:   # unbekannt: hatte die Zeile ein Kästchen → „[ ]“, offizielle Fassung bleibt ohne
                n["unbekannt"] += 1
                return m.group(1) + ("[ ] " if m.group(2) else "") + m.group(3)
            n[st] += 1
            if st == "g":
                treffer[0] = True
            return m.group(1) + ZEICHEN[st] + " " + m.group(3)
        zeilen[i] = key + "=" + LISTE.sub(lambda L: L.group(1) + PUNKT.sub(punkt, L.group(2)), wert)
        if treffer[0]:
            gesucht_basis.add(_basis(key.split(",")[0]))
    for i, z in enumerate(zeilen):   # Titel mit [BP]: „[Gesucht]“ setzen oder entfernen (Org: nach „[BP*]“ vorne, offiziell: ganz vorne)
        if "=" not in z or "[BP" not in z:
            continue
        key, wert = z.split("=", 1)
        if not key.lower().split(",")[0].endswith(("title", "title_001", "title_002", "title_003")) and "_title" not in key.lower():
            continue
        rein = TITEL_MARKE.sub("", wert)
        if _basis(key.split(",")[0]) in gesucht_basis:
            m = ORG_BP.match(rein)
            rein = rein[:m.end()] + GESUCHT_TITEL + rein[m.end():] if m else GESUCHT_TITEL + rein
            n["titel"] += 1
        zeilen[i] = key + "=" + rein
    neu = nl.join(zeilen)
    data = (b"\xef\xbb\xbf" if bom else b"") + neu.encode("utf-8")
    if data == raw:
        return dict(n, ok=True, geaendert=False, pfad=p, fassung=fassung(text))
    tmp = p + ".pliskin-tmp"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, p)
    return dict(n, ok=True, geaendert=True, pfad=p, sicherung=frisch, fassung=fassung(text))
