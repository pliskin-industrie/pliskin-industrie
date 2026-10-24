<p align="center"><img src="docs/bilder/logo.png" width="110" alt="Pliskin Industrie"></p>

<h1 align="center">Pliskin Industrie 1.0.0</h1>
<p align="center"><b>Crafting · Lager · Logistik für Star Citizen</b><br>
<a href="#deutsch">Deutsch</a> · <a href="#english">English</a> · <a href="docs/HANDBUCH.md">Handbuch</a> · <a href="../../issues/new/choose">Fehler melden</a></p>

<p align="center"><img src="docs/bilder/01-heute.webp" width="900" alt="Heute / To-do"></p>

---

## Deutsch

Pliskin Industrie bringt **Blueprints, Crafting-Pläne, Lager, Mining und Fracht-Touren** an einen Ort. Das Programm liest deine Blueprints selbst aus dem Game.log, rechnet aus, was dir für deine Pläne noch fehlt und wo du es am besten findest. Die Spieldaten (Rezepte, Fundorte, Qualität, Schiffe, Karte) stammen direkt aus der `Data.p4k` des Spiels.

### Was es kann

| | |
|---|---|
| **Heute / To-do** – Was du jetzt craften kannst, was du holen oder minen musst und welche Mission dir einen fehlenden Blueprint bringt. Eine Liste zum Abarbeiten von oben nach unten. | <img src="docs/bilder/01-heute.webp" width="420"> |
| **Crafting-Pläne** – Bauteile, ganze Rüstungs-Sets, Schiffs-Fittings (SPViewer-Cart einfügen) oder Material-Ziele. Ziel-Qualität wie im Spiel: Mischen = mengengewichteter Durchschnitt, das beste Material zuerst. | <img src="docs/bilder/02-crafting-plaene.webp" width="420"> |
| **Lager** – Bestand je Ort mit Qualität, Kisten und Einheiten (SCU bis µSCU). Material-Symbole wie im Spiel-Inventar. | <img src="docs/bilder/03-lager.webp" width="420"> |
| **Lager-Ansicht** – dein Lager in 3D im Freight Elevator, mit echten SCU-Kisten aus den Spieldaten. Kiste auf einen anderen Ort ziehen = Umlagerung planen. | <img src="docs/bilder/04-lager-ansicht.webp" width="420"> |
| **Tour planen** – Verkaufs-, Umlager- und Contract-Touren mit kürzester Route, Hin- und Rückfracht, Ladeplan ohne Umladen, Karte, Flugzeit und Quantum-Sprit. | <img src="docs/bilder/05-tour.webp" width="420"> |
| **Material-Atlas** – wo ein Rohstoff vorkommt und wo am ehesten in Top-Qualität („Chance je Stein“), dazu Raffinerien und Verfahren. | <img src="docs/bilder/06-material-atlas.webp" width="420"> |
| **Mining-Ausflug** – mehrere Materialien wählen, Pliskin sucht die Orte, an denen du möglichst viel davon zusammen bekommst, mit Entfernung von deiner Home-Station. | <img src="docs/bilder/07-mining-ausflug.webp" width="420"> |
| **Blueprint-Katalog** – alle Blueprints mit Werten bei Q0 / Q500 / Q1000, Skins, Sets und eigenen Bildern aus den Spielmodellen. Status: hab ich, fehlt, erspielbar. | <img src="docs/bilder/08-katalog.webp" width="420"> |
| **Schiffe** – Cargo-Grids von rund 100 Schiffen aus den Spieldaten, Tür-Seite, Quantum-Antrieb, Reichweite. | <img src="docs/bilder/09-schiffe.webp" width="420"> |
| **Erfassung per Taste** – Maus über eine Kiste im Spiel, Taste drücken (Standard **Pause**): Material, Qualität und Menge werden aus dem Tooltip gelesen und gesammelt, bis du bestätigst. Auch vom Handy aus auslösbar. | |
| **Handy & Tablet** – eigene Oberfläche fürs Handy (Server-Modus, siehe unten). | <img src="docs/bilder/11-handy.webp" width="200"> |

**7 Designs:** SC Holo, SC Item Fabricator, SC Freight Elevator sowie Wing Commander III Victory, WC IV Lexington, WC IV Intrepid und Prophecy Midway.

<p align="center"><img src="docs/bilder/10-design-wc3v.webp" width="290"> <img src="docs/bilder/10-design-wc4i.webp" width="290"> <img src="docs/bilder/10-design-sccargo.webp" width="290"></p>

### Herunterladen und starten
1. Unter **Releases** die Datei für dein System laden:
   - Windows: `Pliskin-Industrie-v1.0.0-windows.exe`
   - Linux: `Pliskin-Industrie-v1.0.0-linux-x86_64`
2. **Windows:** Doppelklick. Windows warnt evtl. („Der Computer wurde durch Windows geschützt“), weil das Programm nicht signiert ist → *Weitere Informationen* → *Trotzdem ausführen*. Die Datei lässt sich mit `SHA256SUMS.txt` aus dem Release prüfen.
   **Linux:** `chmod +x Pliskin-Industrie-*-linux-x86_64` und starten. Fehlen Fenster-Bausteine (Qt), öffnet Pliskin sich automatisch im Browser.
3. Beim ersten Start: Sprache (Deutsch/English), Design und **leer starten** oder **Demo ansehen** wählen.

Deine Daten liegen nur bei dir: Windows `%LOCALAPPDATA%\PliskinIndustrie`, Linux `~/.local/share/PliskinIndustrie` (mit täglicher Sicherung). Ins Internet geht nichts automatisch – Preise von UEX oder Fundorte von SCMDB holst du nur auf Knopfdruck.

### Server-Modus (Handy, Laptop)
Einstellungen → Programm → *Server-Modus*: Pliskin öffnet sich für dein Heimnetz. Handy oder Laptop öffnen die angezeigte Adresse (z. B. `http://192.168.0.10:8770`) im Browser und arbeiten mit denselben Daten. Nur fürs Heimnetz gedacht (kein Passwort).

### Erfassungs-Taste im Spiel
Läuft Star Citizen mit Administrator-Rechten, gibt Windows Tastendrücke nicht an normale Programme weiter. Dann Pliskin auch als Administrator starten (Einstellungen → Programm → „Als Administrator neu starten“) – oder die Erfassung vom Handy aus auslösen.

### Updates
Pliskin prüft beim Start, ob es eine neue Version gibt (abschaltbar). Unter Einstellungen → Programm lässt sich jede Version – auch eine ältere – installieren. Die bisherige Programmdatei bleibt als Sicherung daneben liegen, deine Daten bleiben unverändert.

### Hilfe und Fehler melden
- Im Programm: **Hilfe** (mit Rundgang und Demo-Modus) und **Hilfe → Kontakt & Fehler melden**.
- Ausführliches [Handbuch](docs/HANDBUCH.md).
- [Fehler melden oder Wunsch einreichen](../../issues/new/choose) – oder per Mail an **pliskinindustrie@gmail.com**.

### Aus dem Quelltext bauen
Python 3.12, dann `bauen/windows.bat` bzw. `bauen/linux.sh`. Ohne Bau starten: `pip install -r requirements-windows.txt` (bzw. `-linux`), dann `python hysec_industrie.py`.
Neue Version: `VERSION` in `hysec_industrie.py` erhöhen, Tag `v<Version>` pushen – GitHub baut beide Programme und hängt sie ans Release (`.github/workflows/release.yml`).

### Datenquellen und Dank
Spieldaten aus der `Data.p4k` (Patch steht im Programm unten). Optional auf Knopfdruck: UEX Corp (Handelspreise), SCMDB (Fundorte, Raffinerie-Boni). Shader- und Modell-Logik für die Katalog-Bilder nach dem Open-Source-Projekt [StarBreaker](https://github.com/diogotr7/StarBreaker) (MIT).

Pliskin Industrie ist ein Fan-Projekt und steht in keiner Verbindung zu Cloud Imperium Games. Star Citizen® ist eine Marke von Cloud Imperium Rights LLC.

---

## English

Pliskin Industrie puts **blueprints, crafting plans, storage, mining and cargo tours** in one place. It reads your blueprints from Game.log, works out what your plans are still missing and where to find it. Game data (recipes, mining locations, quality, ships, map) comes straight from the game's `Data.p4k`.

**Features:** To-do list · crafting plans with target quality (weighted average, best material first) · storage with qualities, crates and units · 3D freight elevator view with real SCU crates and drag & drop transfers · tour planner (shortest route, round trips, loading plan, map, fuel) · material atlas, refineries · mining trip planner · blueprint catalog with stats at Q0/Q500/Q1000, skins, sets and own renders · ship cargo grids · hotkey capture of in-game crate tooltips · phone and tablet UI · 7 designs (Star Citizen and Wing Commander inspired).

### Download and start
1. Get the file for your system under **Releases** (Windows `.exe`, Linux `…-linux-x86_64`).
2. **Windows:** double-click. Windows may warn because the program is not signed → *More info* → *Run anyway*. Verify with `SHA256SUMS.txt`.
   **Linux:** `chmod +x` the file and run it. If window components (Qt) are missing, Pliskin opens in your browser instead.
3. On first start choose language, design and **start empty** or **try the demo**.

Your data stays on your machine: Windows `%LOCALAPPDATA%\PliskinIndustrie`, Linux `~/.local/share/PliskinIndustrie` (daily backups). Nothing is fetched from the internet automatically.

**Server mode** (Settings → Program) opens Pliskin to your home network for phones and laptops (home network only, no password).
**Capture hotkey:** if Star Citizen runs as administrator, start Pliskin as administrator too (Settings → Program), or trigger the capture from your phone.
**Updates:** checked on start (can be muted); any version can be installed under Settings → Program.

**Help & bug reports:** in the program under *Help → Contact*, via [GitHub issues](../../issues/new/choose) or by mail to **pliskinindustrie@gmail.com**. The detailed manual ([docs/HANDBUCH.md](docs/HANDBUCH.md)) is in German for now.

Fan project, not affiliated with Cloud Imperium Games. Star Citizen® is a trademark of Cloud Imperium Rights LLC. Rendering logic based on StarBreaker (MIT).
