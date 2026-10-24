# Pliskin Industrie 1.0 – Handbuch

Crafting, Lager und Logistik für Star Citizen an einem Ort. Läuft im Browser (PC, Handy, Tablet), die Daten liegen zentral auf einem kleinen Server.

## In 5 Schritten loslegen

1. **Home-Station festlegen.** Unter *Logistik → Home & Favoriten* deinen Haupt-Hub wählen, z. B. Area18 oder New Babbage.
2. **Lager füllen.** Unter *Lager* Material und Waren einbuchen: Menge (SCU, cSCU, mSCU oder Stück), Qualität, Ort und Kisten.
3. **Crafting-Plan anlegen.** Unter *Crafting-Pläne* Bauteile, ein ganzes Rüstungs-Set, ein Fitting von SPViewer oder ein Material-Ziel eintragen.
4. **Heute / To-do abarbeiten.** Dort steht, was du jetzt craften kannst, was du holen oder minen musst und welche Mission dir fehlende Blueprints bringt.
5. **Log-Sync.** In der PC-App auf dem Spiele-PC „⟳ Log-Sync“ drücken. Neue Blueprints werden dann automatisch abgehakt.

Der **Rundgang** unter *Hilfe* zeigt alles in einer Minute. Der **Demo-Modus** unter *Einstellungen* lädt Beispiel-Daten zum Ausprobieren. Dabei wird nichts gespeichert.

## Bereiche

### Heute / To-do
- **Nächste Schritte:** eine sortierte Liste zum Abarbeiten von oben nach unten (Craften, Holen, Tour, Minen, Mission, Verkauf).
- **Craften:** zeigt, was jetzt baubar ist, und bei allem anderen, was fehlt (Blueprint oder Material).
- **Material & Mining:** fehlendes Material mit drei Angaben:
  - die besten Fundorte für deine Wunsch-Qualität
  - die Qualitäts-Chance im besten System
  - die beste Raffinerie
- **Logistik:** Umlagerungen, Verkauf, Contracts und die Home-Station.
- **Blueprints:** fehlende Blueprints nach Mission sortiert, mit Link zur Mission auf scmdb.net.
- Oben kannst du auf einen einzelnen Plan filtern.

### Logistik
- **Lager:** Bestand je Ort.
  - 💰/🔒 schaltet zwischen Verkauf und Behalten um.
  - „→ ⌂“ legt eine Umlagerung zur Home-Station an.
- **Zusammenholen:** holt alles für einen Plan verplante Material per Klick zur Home-Station. Die Umlagerungen landen in der Lager-Tour.
- **Tour planen:** Es gibt zwei getrennte Touren.
  - Die **Lager-Tour** fasst Verkauf und Umlagerungen zusammen, die **Contracts-Tour** deine Fracht-Aufträge.
  - Oben steht die **Übersicht**: alle angelegten Umlagerungen und Verkäufe (bzw. Contracts). Haken = fliegt in dieser Tour mit, ohne Haken bleibt der Eintrag für später. ✕ löscht, „Tour beenden“ geht immer.
  - Die Tour startet und endet an der Home-Station. Die Route wird so gewählt, dass die Gesamtstrecke möglichst kurz ist.
  - **Hin- und Rückfracht** geht: Ein Ort darf mehrmals vorkommen (A → B → A). Der Frachtraum des Schiffs wird beachtet – passt nicht alles auf einmal, wird erst abgeladen und dann weiter geladen.
  - Wird ein Lagerposten gelöscht oder verkauft, fallen die zugehörigen Verkäufe/Umlagerungen automatisch weg; eine Tour ohne Fracht verschwindet.
  - Der Ladeplan stapelt nur so, dass nie umgeladen werden muss.
  - Für jeden Flug stehen Entfernung, Flugzeit und Quantum-Sprit dabei. Orte mit Tankstelle (Fahrzeug-Service laut Sternkarte der Spieldaten) tragen ⛽. Reicht der Sprit nicht, schlägt Pliskin „⛽ hier tanken“ vor – bevorzugt an einem Stopp, an dem man wirklich tanken kann.
  - Verkauf „Kürzeste Route“: Pliskin bündelt Käufer – lieber ein Käufer für mehrere Posten (bis 10 Gm Umweg) als für jeden Posten den nächsten.
- **🔲 Lager-Ansicht:** dein Lager als 3D-Bild im Freight Elevator (Größe in den Einstellungen, Standard Large 16×14×4).
  - Echte SCU-Kisten aus den Spieldaten (1/8 bis 32 SCU), das Material-Symbol steht auf Deckel und Seiten. Handmineables liegen in Stor*All-Kisten (1/8 SCU = 125 Steine).
  - Gleiches Material liegt als kompakter Haufen zusammen. Zoom, Drehen und Ebenen-Regler.
  - Liste je Material (echte SCU, Kisten je Größe, davon High Quality) und Liste der geplanten Umlagerungen. Antippen hebt die Kisten hervor.
  - **Ziehen & Ablegen** einer Kiste auf einen anderen Ort legt nach Rückfrage eine Umlagerung an.
- **Contracts:** angenommene Fracht-Aufträge. Mengen und Orte würfelt das Spiel jedes Mal neu, deshalb trägst du sie selbst ein.
- **Home & Favoriten:** eine Home-Station (wie im Spiel) plus Orte, an denen du oft bist. Beide erscheinen als Knöpfe unter jedem Ort-Feld.

### Crafting-Pläne
Ein Plan ist eine Liste von Bauteilen mit Anzahl und Mindest-Qualität. Pliskin reserviert passendes Material aus dem Lager, die niedrigste passende Qualität zuerst, und rechnet aus, was fehlt. Material-Ziele gehen auch, z. B. „6 SCU Gold ab Q900 auf Vorrat“.

**Ziel-Qualität beim Craften:** Wie im Spiel zählt beim Mischen der mengengewichtete Durchschnitt. Pliskin nimmt das beste Material zuerst und füllt mit schlechterem auf, solange der Durchschnitt das Ziel noch hält (Plan-Tabelle „Ziel-Q“, Zutat z. B. „Ziel Q700 · Ø 850“).
„1 gebaut“ öffnet das **Craft-Fenster**: Je Zutat stehen alle passenden Lagerposten zur Auswahl, mit Vorschlag, Summe und Ø-Qualität live. Abgebucht wird genau das, was du auswählst.

### Schiffe
- Cargo-Grids kommen aus den Spieldaten. Jedes Grid lässt sich benennen (✎), und du stellst ein, wo die Tür oder Rampe ist.
- Fehlt ein Grid in den Daten, trägst du die Maße selbst ein.
- **Quantum-Antrieb:** Standard laut Spieldaten oder ein anderer gleicher Größe. Daraus ergeben sich Tempo, Tank, Verbrauch und Reichweite.

### Datenbank
- **Material-Atlas:** Wo kommt ein Material vor, und wo am ehesten in Top-Qualität?
  - **Chance je Stein** = Anteil der Steine dort, die das Material enthalten × Anteil der Funde in Wunsch-Qualität im System.
  - **Steine mit …** sagt nur, wie oft das Material vorkommt, und nichts über die Qualität.
  - Laut Spieldaten hat jeder Rohstoff seine eigene Qualitäts-Verteilung (im Rohstoff-Eintrag), dazu Ausnahmen je System. Pyro liegt etwas höher, Stanton und Nyx sind gleich.
  - Auch Sonder-Orte: Höhlen (Stanton/Pyro), Hathor-Höhlen (Carinite, Jaclium, Saldynium), Breaker-Stationen in Nyx (Sadaryx; Large Geode: Savrilium, Torite).
- **⛏ Mining-Ausflug:** mehrere Materialien anhaken, jedes mit eigener Ziel-Qualität (aus dem Plan vorbelegt; im To-do gibt es dafür den Knopf „Mining-Ausflug planen“).
  - Pliskin listet die Orte, an denen du möglichst viele davon zusammen bekommst. Der Balken zeigt, wie gut der Ort für das Material ist, verglichen mit dem besten Ort dafür.
  - Dazu: Entfernung und Flugzeit ab Home (geschätzt, mit gewähltem Schiff), ob der Sprit hin und zurück reicht, das Engpass-Material und die Raffinerie in der Nähe.
  - Für Gürtel, L-Punkte und Asteroiden-Felder ohne festen Kartenpunkt gibt es keine Entfernung.
- **Raffinerien:** welche Stationen eine Raffinerie haben (Spieldaten), Ertrags-Bonus oder -Abzug je Erz, dazu eine Gesamt-Tabelle.
  - Die Boni schickt der Spiel-Server – sie stehen in keiner Datei. Mit ✎ trägst du ab, was das Raffinerie-Terminal anzeigt; dein Wert gilt immer. Fehlende Werte ergänzt Pliskin (abschaltbar) von SCMDB (ˢ).
- **✎ Eigene Daten:** die zwei Dinge, die in keiner Spieldatei stehen (der Spiel-Server schickt sie): **Raffinerie-Boni** und **Handelspreise**.
  - Raffinerie wählen → alle Erze als Tabelle eintippen (grau = SCMDB-Wert, falls geholt). Preise: Ware, Ort, Verkauf/Einkauf je SCU.
  - **Mehrere auf einmal:** Freitext oder Tabelle aus Excel/Sheets einfügen → Vorschau → Übernehmen. Beispiele: `Levski: Gold +5, Quantainium -2` · `ARC-L1 Titanium 5 Quartz 11` · `Gold 6543 Levski` · `Quantainium verkauf 21000 einkauf 0 @ Port Tressler`. Tippfehler bei Erzen werden vorgeschlagen (?), Unbekanntes wird übersprungen.
  - **Teilen:** „Meine Werte als Text kopieren“ – andere fügen den Text bei sich ein.
  - Eigene Werte gelten immer vor UEX und SCMDB (für Verkaufstour, Lagerwert, Raffinerie-Empfehlungen).
- **Raffinerie-Verfahren:** die 9 Verfahren, aufgeteilt in 3 Tempo- × 3 Ertrags-Stufen. Faustregel: immer viel Ertrag nehmen. Wie lange du warten kannst, entscheidet das Tempo.
- **Missionen → Blueprints:** welche Mission welche Blueprints bringen kann (Spieldaten), mit Link zur Mission auf scmdb.net.
- **Blueprints (Katalog):** alle Blueprints nach Kategorien, mit Bild, Status und Werten. Derselbe Katalog öffnet sich bei „Bauteil zum Plan“.
  - Gruppen: Waffen (Art, Schadens-Art, Hersteller), Rüstung (ganze Sets, Helme, Rucksäcke …, Klasse, Einsatz), Schiffsteile (Komponente, Größe, Klasse, Grade, passend zu einem Schiff), Sonstiges.
  - Status: ✓ hab ich · 🎯 Mission · ⏳ nur Event (Pool ohne aktive Mission, oder Messe-Edition wie IAE) · ⛔ derzeit nicht erspielbar (an keiner Mission) · ★ Start-Blueprint.
  - Werte: Basis, Q0, Q500, Q1000 und eine Spalte für den Qualitäts-Regler. Der Regler gilt auch als „ab Q“ beim Hinzufügen.
  - Je Rüstung / Waffe / Rüstungsteil eine Karte in der Standard-Farbe; im Detail Skin wählen → Bild wechselt. Set-Modus: Bild zeigt das ganze Set auf einer Figur. Gibt es denselben Skin mit anderen Helm-Formen (Morozov-SH / -SH-C / -SH-S), steht darunter die Auswahl „Helmform“.
  - Filter „Erspielbar“: 🎯 Erspielbar = Mission oder Start-Blueprint · ⛔ Nicht erspielbar = nur Event oder (noch) an keiner Mission.
  - Gruppe **🔧 Werkzeuge**: Pyro-RYT-Multi-Tool, ParaMed, Cambio-SRT, MaxLift-Traktorstrahl (je Gerät eine Karte, Varianten als Skins; in 4.10.2 ohne Blueprint). Tankstutzen (früher „Andockring“) stehen bei den Schiffsteilen.
  - Auch **nicht craftbare** Rüstungen, Helme, Rucksäcke, Unteranzüge und Handwaffen aus den Spieldaten (Shop/Beute/Event, ohne Blueprint): Schild „⛔ nicht craftbar“, Bild + Skins, kein „Zum Plan“. Zählen beim Filter zu „Nicht erspielbar“.
  - Bilder: **selbst berechnet aus den Spieldaten** (Modelle, Texturen, Farbschichten, Paletten; Arme locker nach unten) in `app/data/modelle/`. Keine Wiki-Fotos mehr.
    Einstellungen → Katalog-Bilder: Unteranzug auf Set-Bildern neutral (grau) oder passend (gleicher Hersteller).
  - Bilder neu berechnen (nach einem Patch): `werkzeuge/modell_liste.py` → `modell_holen.py` → `modell_jobs.py` → Bildrechner (Port 8772, rechnet mit: Pi und jeder Browser im Heimnetz unter http://192.168.x.x:8772) → `katalog_bilder.py`.
  - Werte neu erzeugen: `werkzeuge/werte_export.py` (Werte, Hersteller, Waffenart aus Game2.dcb → `daten/spieldaten/<Patch>/werte.json`) und `werkzeuge/katalog_export.py … --ohne-bilder` (ruft am Ende `katalog_bilder.py` auf). Die Star-Citizen-Wiki-API wird nicht mehr gebraucht (nur noch Rückfall, wenn `werte.json` fehlt).

## Begriffe
- **SCU:** Frachteinheit. 1 SCU = 100 cSCU = 1.000 mSCU = 1.000.000 µSCU.
- **Q:** Qualität 0–1000.
- **Umlagerung:** eigener Bestand von Ort A nach Ort B. Ist der Stopp erledigt, bucht Pliskin den Bestand automatisch um.

## Woher die Daten kommen
| Was | Quelle |
|---|---|
| Rezepte, Werte aller Teile, Hersteller, Schiffe, Cargo-Grids, Quantum-Antriebe, Karte, Orte mit Ausstattung (Tanken, Raffinerie, Handel …), Waren, Fundorte, Qualitäts-Verteilung, Missionen → Blueprints, Bilder | Spieldaten (Data.p4k, Patch 4.10.2), selbst ausgelesen |
| Handelspreise | **eigene Einträge** (Datenbank → ✎ Eigene Daten), optional von [UEX Corp](https://uexcorp.space) – nur auf Knopfdruck (Einstellungen → Datenquellen) |
| Raffinerie-Boni | **eigene Einträge** (Datenbank → ✎ Eigene Daten), optional von [SCMDB](https://scmdb.net) – nur auf Knopfdruck |
| Eigene Blueprints | Game.log des Spiele-PCs |

**Geschätzt** sind die Flugzeiten (ohne Ausrichten und Sprungtunnel) und die Quantum-Reichweite. Die Formel nutzt den Verbrauch aus den Spieldaten, ist aber nicht im Spiel nachgemessen.

## Betrieb (Technik)
- `hysec_server.py` liefert die Oberfläche aus `app/` aus und speichert die Daten in `serverdaten/daten.json` mit täglicher Sicherung.
- Nach einem neuen Patch (auf dem Pi, mit der Data.p4k): `werkzeuge/wissen_export.py` (Fundorte, Qualität, Raffinerien, Missionen → `app/data/wissen.json`; Orte + Waren → `app/data/orte.json`), `werkzeuge/werte_export.py` + `katalog_export.py` (Katalog-Werte), wie bisher `rezepte_export.py`, `schiffe_export.py`, `karte_export.py`, `missionen_export.py`.
- Pliskin holt **nichts von selbst** aus dem Internet. UEX und SCMDB nur per Knopf unter Einstellungen → Datenquellen (Zwischenspeicher `<Daten>/cache/uex.json` bzw. `scmdb.json`; `scmdb_abgleich.py` macht den SCMDB-Abruf).
- `demo_erzeugen.py` erzeugt die Beispiel-Daten für den Demo-Modus (`app/data/demo.json`).
- Mehrere Geräte gleichzeitig gehen. Ändern zwei Geräte gleichzeitig, werden die Änderungen zusammengeführt (Lager, Pläne, Contracts … je Eintrag; Gelöschtes bleibt gelöscht; nur bei genau demselben Feld gewinnt das Gerät, das zuletzt speichert).
- Tagessicherungen: die letzten 60 Tage alle, ältere je Monat eine (der Rest wandert nach `sicherungen/alt/`, nichts wird gelöscht).

## Programm: Sprache, Server-Modus, Updates
- **Ersteinrichtung** (neue Nutzer): Sprache (Deutsch/English), Design (Standard: SC · Holo) und *leer starten* oder *Demo ansehen*. Bestehende Daten überspringen das.
- **Sprache:** Einstellungen → Programm. Englisch übersetzt die ganze Oberfläche (Wörterbuch `werkzeuge/i18n/`, gebaut mit `werkzeuge/i18n_bauen.py` → `app/i18n_en.js`).
- **Server-Modus** (fertiges Programm): Einstellungen → Programm. Der eingebaute Server öffnet sich fürs Heimnetz (Port einstellbar, Standard 8770); Adresse wird angezeigt. Nur der eigene Rechner darf Server-Modus und Updates umschalten.
- **Updates:** GitHub-Releases. Hinweis beim Start (abschaltbar, „Diese überspringen“), Versionsliste mit Installieren (auch ältere). Die alte Programmdatei bleibt als `….alt` liegen.
- **Ausgaben:** „privat“ (Pi-Server + `Pliskin Industrie.exe` mit Pi-Verbindung, gebaut mit `EXE_BAUEN.bat`) und „release“ (offenes Programm mit eigenem Server, zusammengestellt mit `werkzeuge/release_bauen.py`, gebaut von GitHub Actions für Windows und Linux).


## Erfassung: Kisten aus dem Spiel einlagern (Bilderkennung)
- **Am Spiele-PC** läuft „Pliskin Industrie.exe“ (Fenster darf minimiert sein). Im Spiel Inventar oder Freight Manager öffnen,
  Maus über eine Kiste halten (Tooltip sichtbar) und die **Erfassungs-Taste** drücken (Standard **Pause**) – jeder Druck = eine Kiste.
  Taste nehmen, die im Spiel nicht belegt ist (Buchstaben-Kombis lösen im Spiel die Buchstaben mit aus). Gut: Pause, Rollen, F13–F24 (Sondertasten an Maus/Tastatur).
  **Wichtig:** Läuft Star Citizen / der RSI-Launcher als Administrator, kommt die Taste im Spiel nur an, wenn Pliskin ebenfalls als Administrator läuft
  (Einstellungen → Programm → „Als Administrator neu starten“; Pliskin erkennt das und weist darauf hin). Läuft das Spiel normal, geht es ohne. Alternative immer: vom Handy auslösen.
  Hoher Doppelton = erfasst, tiefer Ton = kein Tooltip gefunden. Taste änderbar: Einstellungen → Programm → Erfassungs-Taste.
- **Vom Handy aus**: „+“ → „📷 Kiste am PC erfassen“ (Maus am PC über der Kiste halten) – füllt das Einbuchen-Fenster aus.
  Auch in Lager → 📷 Erfassung: „Jetzt am PC erfassen“. Das Programm am PC fragt dafür jede Sekunde beim Server nach.
- **Lager → 📷 Erfassung**: alle erfassten Kisten (sammeln sich, bis du bestätigst). Material, Qualität, Menge, Kiste und Ort
  (aus dem Game.log: letzter Ort, an dem du Inventar/Freight Manager geöffnet hast) sind vorbelegt; **gelb = bitte prüfen**.
  „Passt – einlagern“ bucht alles ins Lager (gleiches Material + Qualität + Ort = ein Posten, Kisten werden mitgezählt).
- Erkennung: Tooltip-Balken (violett Material, türkis Qualität, oliv Menge). Qualität/Menge per eigenem Muster-Vergleich
  (data/ziffern.json + jede bestätigte Kiste als neues Muster), Material + Menge zusätzlich per Tesseract.js (lädt aus dem Internet).
  Test an 37 eigenen Bildern: Qualität 35, Menge 34, Material 36 richtig – der Rest wird gelb markiert.
- Kiste: unter 1 SCU = angebrochene 1er-Kiste, sonst Menge = Kistengröße.
- Bilder: ganzes Bildschirmfoto bleibt am PC in `<Daten>\erfassung\`, der Ausschnitt liegt beim Server in `erfassung/neu` → `erledigt`/`verworfen`/`lernen` (nichts wird gelöscht).
- Im Spiel „Randloses Fenster“ nutzen – im exklusiven Vollbild kann das Bild schwarz sein.

## Kontakt & Fehler melden
- Im Programm: **Hilfe → Kontakt & Fehler melden**. „Fehler melden“ öffnet ein vorbereitetes Formular auf GitHub mit den Programm-Infos (Version, System, Design, Patch). Lager- und Plandaten werden nie mitgeschickt.
- Ohne GitHub-Konto: Mail an pliskinindustrie@gmail.com.
