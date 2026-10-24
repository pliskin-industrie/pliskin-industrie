"""Pliskin Industrie – optionale Ergänzung von SCMDB holen (nur auf Knopfdruck: Einstellungen → Datenquellen).

Pliskin liest Fundorte, Qualität, Raffinerie-Orte und Missionen selbst aus den Spieldaten (wissen_export.py).
Von SCMDB werden nur noch die Raffinerie-Boni genutzt (stehen in keiner Spieldatei), und nur, wenn du keine eigenen eingetragen hast.
Gespeichert wird eine kleine Fassung unter <Daten>/cache/scmdb.json (Server) bzw. app/data/scmdb.json (Aufruf von Hand):
  - Fundorte je Material (Schiff / ROC / Hand), Anteil der Gesteins-Vorkommen, Anteil im Gestein
  - Qualitäts-Chancen je System (abgeschnittene Normalverteilung aus den Spieldaten)
  - Raffinerien mit Ertrags-Bonus je Erz
  - Missionen je Blueprint-Pool mit Link-Schlüssel (https://scmdb.net/?m=<schluessel>)

Aufruf:  python3 scmdb_abgleich.py [--force]
"""
import json
import math
import os
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET_STD = os.path.join(HERE, "app", "data", "scmdb.json")   # alter Ort; der Server speichert unter <Daten>/cache/scmdb.json
BASE = "https://scmdb.net/data/"
UA = "PliskinIndustrie/1.0 (Crafting- und Lager-Tool; holt einmal je Patch)"
QSTEPS = [300, 500, 600, 700, 800, 900, 950]
GROUPS = {"ship": "SpaceShip_Mineables", "roc": "GroundVehicle_Mineables", "fps": "FPS_Mineables"}
ALIAS = {"Aluminium": "Aluminum", "Ice": "Pressurized Ice", "Quantanium": "Quantainium"}


def fetch(name):
    req = urllib.request.Request(BASE + name, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def base(n):
    """„Iron (Ore)“, „Raw Ice“, „Hephaestanite (Raw)“ -> Materialname"""
    n = str(n or "").replace("(Ore)", "").replace("(Raw)", "").strip()
    if n.startswith("Raw "):
        n = n[4:]
    return ALIAS.get(n, n)


def mission_key(t):
    """Gleiche Rechnung wie SCMDB (djb2-Hash, base36) -> Link https://scmdb.net/?m=<key>"""
    s = 5381
    for ch in t:
        s = ((s << 5) + s + ord(ch)) & 0xFFFFFFFF
    a, o = "0123456789abcdefghijklmnopqrstuvwxyz", ""
    while True:
        o = a[s % 36] + o
        s //= 36
        if s == 0:
            return o


def _cdf(x, mu, sd):
    return 0.5 * (1 + math.erf((x - mu) / (sd * math.sqrt(2))))


def pq(dist, q):
    """Anteil der Funde mit Qualität >= q (Normalverteilung, abgeschnitten auf min..max)"""
    a, b, mu, sd = dist["min"], dist["max"], dist["mean"], max(1e-6, dist["stddev"])
    lo, hi = _cdf(a, mu, sd), _cdf(b, mu, sd)
    if q <= a:
        return 1.0
    return max(0.0, (hi - _cdf(q, mu, sd)) / ((hi - lo) or 1))


def build(mining, merged, ver):
    E, C, QD = mining["mineableElements"], mining["compositions"], mining["qualityDistribution"]

    def dist(kind, el, system):
        if kind == "ship":
            cat = QD["shipmineables"].get(el.get("rarity") or "common") or QD["shipmineables"]["common"]
        else:
            cat = QD["fpsmineables" if kind == "fps" else "groundmineables"]
        d = (cat.get("elementOverrides") or {}).get(base(el["name"]).lower()) or cat["default"]
        ov = (cat.get("locationOverrides") or {}).get(system.lower())
        return ov[0]["distribution"] if ov and not (cat.get("elementOverrides") or {}).get(base(el["name"]).lower()) else d

    mats = {}
    for gid, el in E.items():
        key = el.get("materialName") or base(el["name"])
        if "(Pure)" in el["name"]:
            key = base(el["name"])
        m = mats.setdefault(key, {"key": key, "names": [], "rarity": el.get("rarity"), "where": {}, "q": {}, "dist": {}})
        m["names"].append(el["name"])
        for kind, grp in GROUPS.items():
            rows = []
            for loc in mining["locations"]:
                for g in loc["groups"]:
                    if g["groupName"] != grp:
                        continue
                    tot = sum(x["relativeProbability"] for x in g["deposits"]) or 1
                    p, best = 0.0, None
                    for x in g["deposits"]:
                        comp = C.get(x["compositionGuid"])
                        if not comp:
                            continue
                        miss, rng = 1.0, None
                        for part in comp["parts"]:
                            if part["elementGuid"] == gid:
                                miss *= 1 - min(1.0, part["probability"])
                                rng = (part["minPercent"], part["maxPercent"])
                        if rng:
                            p += x["relativeProbability"] / tot * (1 - miss)
                            if not best or x["relativeProbability"] > best[0]:
                                best = (x["relativeProbability"], rng)
                    if p > 0:
                        rows.append([loc["locationName"], loc["system"], loc.get("locationType"), round(p * 100, 1),
                                     round(best[1][0]), round(best[1][1])])
            if rows:
                old = m["where"].get(kind, [])
                m["where"][kind] = sorted(old + rows, key=lambda r: -r[3])
                m["q"][kind] = {s: [round(pq(dist(kind, el, s), t) * 100, 2) for t in QSTEPS] for s in ("Stanton", "Pyro", "Nyx")}
                m["dist"][kind] = {s: {k: dist(kind, el, s)[k] for k in ("min", "max", "mean", "stddev")} for s in ("Stanton", "Pyro", "Nyx")}
    mats = {k: v for k, v in mats.items() if v["where"]}

    prof = mining.get("refineryProfiles") or {}
    refs = [[r["name"], r["system"], {base(k): v for k, v in (prof.get(r["profileId"]) or {}).items()}] for r in mining.get("refineries") or []]

    pools = {}
    for c in merged.get("contracts") or []:
        for b in c.get("blueprintRewards") or []:
            pn = b.get("poolName")
            if not pn:
                continue
            lst = pools.setdefault(pn, {"n": 0, "c": []})
            lst["n"] += 1
            sysl = "/".join(c.get("availableSystems") or [])
            if not any(x[0] == c.get("title") and x[2] == sysl for x in lst["c"]):
                lst["c"].append([c.get("title") or c.get("debugName"), c.get("contractorName") or "", sysl,
                                 mission_key(c["debugName"]), c.get("missionType") or "", b.get("chance", 1)])
    return {"version": ver, "fetched": time.strftime("%Y-%m-%d %H:%M"), "source": "SCMDB (scmdb.net) – aus den Spieldateien",
            "qsteps": QSTEPS, "materials": mats, "refineries": refs, "pools": pools}


def run(force=False, log=print, target=None):
    TARGET = target or TARGET_STD
    try:
        vers = fetch("game-versions.json")
        live = [v for v in vers if "ptu" not in v["version"].lower()] or vers
        ver = live[0]["version"]
        old = None
        if os.path.exists(TARGET):
            try:
                old = json.load(open(TARGET, encoding="utf-8")).get("version")
            except Exception:
                old = None
        if old == ver and not force:
            log("SCMDB: Stand %s ist schon da" % ver)
            return False
        mining = fetch("mining_data-%s.json" % ver)   # nur diese Datei (Raffinerie-Boni); Missionen liest Pliskin selbst aus den Spieldaten
        out = build(mining, {}, ver)
        os.makedirs(os.path.dirname(TARGET), exist_ok=True)
        tmp = TARGET + ".neu"
        json.dump(out, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        os.replace(tmp, TARGET)
        log("SCMDB: %s geholt – %d Materialien, %d Raffinerien, %d Blueprint-Pools" % (ver, len(out["materials"]), len(out["refineries"]), len(out["pools"])))
        return True
    except Exception as e:  # offline o. ä.: alte Datei bleibt
        log("SCMDB: nicht erreichbar (%s) – alte Daten bleiben" % e)
        return False


if __name__ == "__main__":
    run(force="--force" in sys.argv)
