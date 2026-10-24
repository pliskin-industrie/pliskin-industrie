'use strict';
/* Pliskin Industrie – Hilfe, Rundgang (Schritt für Schritt durch die Oberfläche) und Demo-Modus */

/* ------------------------------------------------------------------ */
/* Demo-Modus                                                           */
/* ------------------------------------------------------------------ */
function demoStart() { try { sessionStorage.setItem('pliskin-demo', '1'); } catch (e) { toast('Demo geht in diesem Browser nicht'); return; } location.reload(); }
function demoEnd() { try { sessionStorage.removeItem('pliskin-demo'); } catch (e) { /* egal */ } location.reload(); }
function demoBanner() {
  let b = document.getElementById('demo-banner');
  if (!DEMO) { if (b) b.remove(); return; }
  if (b) return;
  b = document.createElement('div'); b.id = 'demo-banner';
  b.innerHTML = '<b>DEMO-MODUS</b> · Beispiel-Daten · nichts wird gespeichert <button class="k sm">Demo beenden</button>';
  b.querySelector('button').onclick = demoEnd;
  document.body.appendChild(b);
}

/* ------------------------------------------------------------------ */
/* Rundgang                                                             */
/* ------------------------------------------------------------------ */
const RG_PC = [
  ['#nav [data-tab=todo]', 'todo', 'Heute / To-do', 'Deine Startseite. „Nächste Schritte“ sagt dir, was als Nächstes dran ist: craften, Material holen, minen, Touren, Missionen für fehlende Blueprints.'],
  ['#nav [data-tab=lager]', 'lager', 'Lager', 'Alles, was du besitzt – mit Menge, Qualität, Kisten und Ort. Hier buchst du ein, bearbeitest, gibst zum Verkauf frei oder legst mit „→ ⌂“ eine Umlagerung zur Home-Station an.'],
  ['#nav [data-tab=tour]', 'tour', 'Tour planen', 'Zwei Touren: Lager (Verkauf + Umlagerung) und Contracts. Pliskin legt die Stopps fest, packt den Ladeplan ohne Umladen, rechnet Sprit und Flugzeit.'],
  ['#nav [data-tab=ctr]', 'ctr', 'Contracts', 'Angenommene Fracht-Aufträge eintragen. „in Tour“ = kommt in die Contracts-Tour.'],
  ['#nav [data-tab=orte]', 'orte', 'Home & Favoriten', 'Deine Home-Station (wie im Spiel genau eine) und Orte, an denen du oft bist. Sie erscheinen als Knöpfe unter jedem Ort-Feld.'],
  ['#nav [data-tab=plan]', 'plan', 'Crafting-Pläne', 'Was willst du bauen? Bauteile, ganze Rüstungs-Sets, Fittings von SPViewer oder Material-Ziele. Pliskin rechnet, was fehlt.'],
  ['#nav [data-tab=ships]', 'ships', 'Schiffe', 'Deine Transport-Schiffe: Cargo-Grids (benennbar), Tür/Rampe, Quantum-Antrieb mit Reichweite.'],
  ['#nav [data-tab=db]', 'db', 'Datenbank', 'Nachschlagen: wo welches Material in Top-Qualität vorkommt, welche Raffinerie welchen Bonus hat, welche Mission welche Blueprints bringt.'],
  ['#btn-sync', null, 'Log-Sync', 'In der PC-App auf dem Spiele-PC liest dieser Knopf deine Game-Logs und hakt neue Blueprints automatisch ab.'],
  ['#nav [data-tab=help]', 'help', 'Hilfe', 'Hier findest du alles noch mal zum Nachlesen – und den Demo-Modus zum gefahrlosen Ausprobieren. Viel Spaß, o7!']
];
const RG_MOB = [
  ['#m-keys [data-v=todo]', 'todo', 'To-do', 'Deine Startseite mit den nächsten Schritten: craften, Material holen, minen, Touren, fehlende Blueprints.'],
  ['#m-keys [data-v=plans]', null, 'Crafting-Pläne', 'Was willst du bauen? Pliskin rechnet, was dir noch fehlt.'],
  ['#m-keys [data-v="+"]', null, 'Schnell einbuchen', 'Material oder Ware in Sekunden ins Lager buchen.'],
  ['#m-keys [data-v=lager]', null, 'Lager', 'Dein Bestand nach Ort – antippen für Bearbeiten, Umbuchen, Verkauf.'],
  ['#m-keys [data-v=mehr]', null, 'Mehr', 'Tour planen, Contracts, Schiffe, Datenbank, Home & Favoriten, Einstellungen, Hilfe und der Demo-Modus.']
];
let RG = null;
function startRundgang() {
  const steps = window.MOBILE ? RG_MOB : RG_PC;
  RG = { steps, i: 0 };
  closeModal();
  if (window.MOBILE && typeof mGo === 'function') mGo('todo');
  rgShow();
}
function rgEnd() { const o = document.getElementById('rg'); if (o) o.remove(); RG = null; S.ui.helpSeen = true; save(); }
function rgShow() {
  if (!RG) return;
  const [sel, tab, title, text] = RG.steps[RG.i];
  if (tab && !window.MOBILE && current !== tab) switchTab(tab);
  let o = document.getElementById('rg');
  if (!o) { o = document.createElement('div'); o.id = 'rg'; document.body.appendChild(o); }
  const t = document.querySelector(sel), r = t ? t.getBoundingClientRect() : { left: innerWidth / 2 - 60, top: 120, width: 120, height: 40, right: innerWidth / 2 + 60, bottom: 160 };
  if (t && (r.top < 0 || r.bottom > innerHeight)) { t.scrollIntoView({ block: 'center' }); return setTimeout(rgShow, 250); }
  const pad = 6, bw = Math.min(360, innerWidth - 24);
  let bx = r.right + 14, by = r.top;
  if (bx + bw > innerWidth - 8) { bx = Math.max(8, Math.min(innerWidth - bw - 8, r.left)); by = r.bottom + 12; }
  if (by + 190 > innerHeight) by = Math.max(8, r.top - 200);
  o.innerHTML = `<div class="rg-hole" style="left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + 2 * pad}px;height:${r.height + 2 * pad}px"></div>
    <div class="rg-box" style="left:${bx}px;top:${by}px;width:${bw}px"><div class="rg-n">${RG.i + 1} / ${RG.steps.length}</div><h4>${esc(title)}</h4><p>${esc(text)}</p>
    <div class="rg-k"><button class="k sm" data-rg="x">Beenden</button><div class="grow"></div>${RG.i ? '<button class="k sm" data-rg="-1">Zurück</button>' : ''}<button class="k sm pri" data-rg="1">${RG.i < RG.steps.length - 1 ? 'Weiter' : 'Fertig'}</button></div></div>`;
  $$('[data-rg]', o).forEach(b => b.onclick = () => {
    const v = b.dataset.rg;
    if (v === 'x' || (v === '1' && RG.i >= RG.steps.length - 1)) return rgEnd();
    RG.i += +v; rgShow();
  });
}
window.addEventListener('resize', () => { if (RG) rgShow(); });
function helpFirstStart() {
  if (S.ui.helpSeen || RG || $('#modal').classList.contains('on')) return;
  openModal(`<h3>Willkommen bei Pliskin Industrie ${APP_VERSION}</h3>
    <div>Crafting, Lager und Logistik für Star Citizen – an einem Ort. Neu: <b>Heute/To-do</b> mit nächsten Schritten, <b>Datenbank</b> mit Fundorten, Raffinerien und Missionen, <b>Home-Station</b>, Sprit und Flugzeit in der Tour.</div>
    <div class="hint">Der Rundgang zeigt dir in einer Minute, wo was ist. Später jederzeit unter „Hilfe“.</div>
    <div class="foot"><button class="k" id="hf-no">Später</button>${DEMO ? '' : '<button class="k" id="hf-demo">Demo ausprobieren</button>'}<button class="k pri" id="hf-go">Rundgang starten</button></div>`, box => {
    $('#hf-no', box).onclick = () => { S.ui.helpSeen = true; save(); closeModal(); };
    const d = $('#hf-demo', box); if (d) d.onclick = () => { S.ui.helpSeen = true; save(); demoStart(); };
    $('#hf-go', box).onclick = () => startRundgang();
  });
}

/* ------------------------------------------------------------------ */
/* Hilfe-Seite                                                          */
/* ------------------------------------------------------------------ */
const HELP = [
  ['In 5 Schritten loslegen', `<ol>
    <li><b>Home-Station festlegen</b> (Logistik → Home &amp; Favoriten) – z. B. Area18 oder New Babbage.</li>
    <li><b>Lager füllen</b>: Material und Waren einbuchen (Menge, Qualität, Ort, Kisten).</li>
    <li><b>Crafting-Plan anlegen</b>: Bauteile, Rüstungs-Set oder ein Fitting von SPViewer einfügen.</li>
    <li><b>Heute / To-do</b> abarbeiten: craften, Material zusammenholen, minen, Missionen für fehlende Blueprints.</li>
    <li><b>Log-Sync</b> in der PC-App drücken – neue Blueprints werden automatisch abgehakt.</li></ol>`],
  ['Heute / To-do', `<p><b>Nächste Schritte</b> mischt alles zu einer Liste, die du von oben abarbeitest. Die Unter-Reiter zeigen dasselbe nach Art sortiert:</p>
    <ul><li><b>Craften</b>: was jetzt baubar ist und was noch fehlt (Blueprint oder Material).</li>
    <li><b>Material &amp; Mining</b>: fehlendes Material mit den besten Fundorten für deine Wunsch-Qualität und der besten Raffinerie.</li>
    <li><b>Logistik</b>: Umlagerungen, Verkauf, Contracts.</li>
    <li><b>Blueprints</b>: fehlende Blueprints nach Mission sortiert, mit Link zur Mission in SCMDB.</li></ul>
    <p>Oben kannst du auf einen einzelnen Plan filtern.</p>`],
  ['Logistik', `<ul><li><b>Lager</b>: Bestand je Ort. „→ ⌂“ legt eine Umlagerung zur Home-Station an. 💰/🔒 schaltet Verkauf/Behalten.</li>
    <li><b>Zusammenholen</b>: holt alles Material eines Plans per Klick zur Home-Station (als Umlagerungen in der Lager-Tour).</li>
    <li><b>Tour planen</b>: Lager-Tour (Verkauf + Umlagerung) und Contracts-Tour getrennt. Oben die <b>Übersicht</b> aller angelegten Umlagerungen, Verkäufe bzw. Contracts – Haken = fliegt jetzt mit. Pliskin legt die kürzeste Reihenfolge fest (Start an der Home-Station), auch mit <b>Hin- und Rückfracht</b> (A → B → A) und mit Blick auf den Frachtraum, packt den Ladeplan so, dass nie umgeladen werden muss, und zeigt Sprit und Flugzeit je Abschnitt. ⛽ = hier kann man tanken. Gelöschte Lagerposten fallen automatisch aus der Tour.</li>
    <li><b>Contracts</b>: angenommene Fracht-Aufträge. Mengen und Orte würfelt das Spiel jedes Mal neu – deshalb trägst du sie ein.</li></ul>`],
  ['Crafting-Pläne', `<p>Ein Plan ist eine Liste von Bauteilen (z. B. alle Komponenten für ein Schiff) mit Anzahl und Ziel-Qualität. Wie im Spiel wird Material gemischt: Die Qualität ist der Durchschnitt nach Menge – Pliskin nimmt die besten Lagerposten zuerst und füllt mit schlechteren auf, solange der Schnitt das Ziel hält. Beim „1 gebaut“ wählst du die verwendeten Lagerposten selbst (Vorschlag: beste zuerst). Pliskin reserviert passendes Material aus dem Lager (niedrigste passende Qualität zuerst) und rechnet aus, was fehlt. Material-Ziele („6 SCU Gold ab Q900 auf Vorrat“) gehen auch.</p>`],
  ['Schiffe', `<p>Cargo-Grids kommen aus den Spieldaten. Für jedes Grid kannst du einen Namen und die Tür/Rampe einstellen. Fehlt ein Grid in den Daten, trägst du die Maße selbst ein. Der Quantum-Antrieb bestimmt Flugzeit und Reichweite – baust du einen anderen ein, wähl ihn aus.</p>`],
  ['Datenbank', `<ul><li><b>Material-Atlas</b>: wo ein Material vorkommt und wo am ehesten in Top-Qualität. „Chance je Stein“ = wie viele Steine dort das Material in deiner Wunsch-Qualität enthalten.</li>
    <li><b>⛏ Mining-Ausflug</b>: mehrere Materialien anhaken (oder im To-do „Mining-Ausflug planen“ drücken) – Pliskin zeigt die Orte, wo du möglichst viele davon in Wunsch-Qualität zusammen findest, mit Entfernung und Flugzeit ab Home, Engpass-Material und Raffinerie in der Nähe.</li>
    <li><b>Raffinerien</b>: welche Stationen eine Raffinerie haben (Spieldaten) und der Ertrags-Bonus je Erz. Die Boni schickt der Spiel-Server – mit ✎ trägst du ein, was das Terminal zeigt; fehlende ergänzt Pliskin von SCMDB (abschaltbar).</li>
    <li><b>✎ Eigene Daten</b>: Raffinerie-Boni und Handelspreise – die stehen in keiner Spieldatei (der Spiel-Server schickt sie). Eintragen als Tabelle oder viele auf einmal als Freitext (auch aus Excel/Sheets einfügen, mit Vorschau). „Als Text kopieren“ zum Teilen mit der Org. Deine Werte gelten immer vor UEX und SCMDB.</li>
    <li><b>Raffinerie-Verfahren</b>: die 9 Verfahren nach Tempo, Ertrag und Kosten.</li>
    <li><b>Missionen → Blueprints</b>: welche Mission welche Blueprints bringen kann (aus den Spieldaten), mit Link zur Mission auf scmdb.net.</li>
    <li><b>Blueprints (Katalog)</b>: alle 1.600+ Blueprints nach Kategorien (Waffen-Art, Schadens-Art, Rüstungsklasse, Einsatz, Schiffsteil, Größe, Klasse, Grade) mit Bild, Status (🎯 Mission, ⏳ nur Event, ⛔ derzeit nicht erspielbar, ★ Start) und Werten bei Q0 / Q500 / Q1000 plus Qualitäts-Regler. Jede Rüstung und jede Waffe ist <b>eine</b> Karte in der Standard-Farbe – im Detail wählst du den Skin, das Bild wechselt mit. Im Set-Modus zeigt das Bild immer das <b>ganze Set</b> (Helm, Torso, Arme, Beine) auf einer Figur. Gibt es einen Skin mit mehreren Helm-Formen (z. B. Morozov-SH / -SH-C / -SH-S), wählst du darunter die <b>Helmform</b>. Filter „🎯 Erspielbar / ⛔ Nicht erspielbar“ trennt, was du dir jetzt holen kannst, von dem, was (noch) nicht geht. Handgeräte wie Multi-Tool, ParaMed, Cambio-SRT und MaxLift stehen unter <b>🔧 Werkzeuge</b> (derzeit ohne Blueprint). Auch Rüstungen und Waffen <b>ohne Blueprint</b> (z. B. Morozov-SH-I) stehen drin – mit Schild „⛔ nicht craftbar“, Bild und Skins, aber ohne „Zum Plan“. Derselbe Katalog öffnet sich bei „Bauteil zum Plan“. Die Bilder berechnet Pliskin selbst aus den Spieldaten; welcher Unteranzug auf den Set-Bildern zu sehen ist, stellst du in den Einstellungen ein.</li></ul>`],
  ['Begriffe', `<ul><li><b>SCU</b> = Frachteinheit. 1 SCU = 100 cSCU = 1.000 mSCU. Die Raffinerie zeigt cSCU.</li>
    <li><b>Q</b> = Qualität 0–1000. Höhere Qualität gibt bessere Werte beim Craften.</li>
    <li><b>Steine mit …</b> = wie oft ein Material an einem Ort vorkommt. Sagt nichts über die Qualität.</li>
    <li><b>Raffinerie-Bonus</b> = mehr (oder weniger) fertiges Material aus derselben Menge Erz.</li></ul>`],
  ['Programm: Sprache, Server-Modus, Updates', `<ul>
    <li>Sprache: Deutsch oder Englisch – beim ersten Start wählbar, später unter Einstellungen → Programm.</li>
    <li>Server-Modus (nur im fertigen Programm): öffnet Pliskin für dein Heimnetz. Handy, Laptop und andere PCs öffnen die angezeigte Adresse im Browser und arbeiten mit denselben Daten. Der Rechner muss dafür laufen. Kein Passwort – nur fürs Heimnetz.</li>
    <li>Updates: Beim Start weist Pliskin auf eine neue Version hin (abschaltbar oder pro Version überspringbar). Unter Einstellungen → Programm lässt sich jede Version installieren, auch eine ältere. Deine Daten bleiben dabei unverändert.</li>
    <li>Demo-Modus: lädt fertige Beispiel-Daten, damit du dir schnell einen Überblick verschaffen kannst. Im Demo-Modus wird nichts gespeichert; beenden über den Knopf im Demo-Banner.</li></ul>`],
  ['Woher die Daten kommen', `<ul><li><b>Spieldaten</b> (Data.p4k, Patch %PATCH%): Rezepte, Schiffe, Cargo-Grids, Quantum-Antriebe, Karte, Orte mit Ausstattung (Tanken, Raffinerie, Handel …), Waren, Fundorte, Qualitäts-Verteilung, Missions-Belohnungen. Pliskin liest sie selbst aus – bei jedem neuen Patch neu.</li>
    <li><b>Nicht in den Spieldateien</b> (schickt der Spiel-Server): Handelspreise und Raffinerie-Boni. Dafür gibt es <b>eigene Einträge</b> (Datenbank → ✎ Eigene Daten) – die gehen immer vor.</li>
    <li><b>UEX Corp</b> (optional, nur auf Knopfdruck in den Einstellungen): Handelspreise, von Spielern gemeldet, können veraltet sein.</li>
    <li><b>SCMDB</b> (optional, nur auf Knopfdruck in den Einstellungen): ergänzt Raffinerie-Boni, für die du nichts eingetragen hast. Missions-Links führen zu scmdb.net.</li>
    <li><b>Geschätzt</b> sind: Flugzeiten (ohne Ausrichten und Sprungtunnel) und die Sprit-Reichweite.</li></ul>`],
  ['Fragen', `<p><b>Wird etwas automatisch gelöscht?</b> Nein. Pliskin legt jeden Tag eine Sicherung an.</p>
    <p><b>Mehrere Geräte?</b> Ja – PC, Laptop, Handy und Tablet sehen dieselben Daten. Änderst du auf zwei Geräten gleichzeitig, führt Pliskin beide Änderungen zusammen.</p>
    <p><b>Demo-Modus?</b> Lädt Beispiel-Daten nur in diesem Fenster, nichts wird gespeichert. Beenden über den Knopf oben.</p>`]
];
function renderHelp() {
  const el = $('#help');
  el.innerHTML = `<div class="win tight"><span class="pill">Hilfe</span><span class="sub">Pliskin Industrie ${APP_VERSION} · Crafting, Lager &amp; Logistik für Star Citizen</span>
    <div class="row2"><button class="k pri" id="hp-rg">Rundgang starten</button>${DEMO ? '<button class="k x" id="hp-demo">Demo beenden</button>' : '<button class="k" id="hp-demo">Demo-Modus ausprobieren</button>'}</div></div>
    <div class="helpgrid">${HELP.map(([t, b]) => `<div class="win tight helpsec"><span class="pill">${esc(t)}</span><div class="helptxt">${b.replace(/%PATCH%/g, esc(R.patch || '?'))}</div></div>`).join('')}</div>`;
  el.insertAdjacentHTML('beforeend', kontaktHtml());
  $('#hp-rg', el).onclick = startRundgang;
  $('#hp-demo', el).onclick = () => DEMO ? demoEnd() : demoStart();
  kontaktBind(el);
}

/* ------------------------------------------------------------------ */
/* Kontakt: Fehler melden, Wunsch einreichen, Mail                     */
/* ------------------------------------------------------------------ */
const KONTAKT_MAIL = 'pliskinindustrie@gmail.com';
const kontaktRepo = () => (typeof APP !== 'undefined' && APP.github) || 'pliskin-industrie/pliskin-industrie';
function kontaktInfo() {   // Angaben, die bei einer Fehlermeldung helfen (nichts Persönliches)
  const a = typeof APP !== 'undefined' ? APP : {};
  return ['Pliskin Industrie ' + (a.version || APP_VERSION) + (a.edition ? ' (' + a.edition + ')' : ''), 'System: ' + (a.os || '–') + (a.desktop ? ' · Programm' : ' · Browser'),
    'Design: ' + (document.body.dataset.t || '–') + ' · Sprache: ' + (typeof LANG !== 'undefined' ? LANG : 'de') + (document.body.classList.contains('mob') ? ' · Handy-Ansicht' : ''),
    'Spieldaten-Patch: ' + (R.patch || '?'), 'Browser: ' + navigator.userAgent].join('\n');
}
function kontaktLink(vorlage) {
  const u = new URLSearchParams({ template: vorlage + '.yml' });
  if (vorlage === 'fehler') u.set('umgebung', kontaktInfo());
  return 'https://github.com/' + kontaktRepo() + '/issues/new?' + u.toString();
}
function kontaktHtml() {
  return `<div class="win tight kontakt"><span class="pill">${L2('Kontakt &amp; Fehler melden', 'Contact &amp; bug reports')}</span>
    <div class="helptxt">${L2('Etwas geht nicht, rechnet falsch oder du hast eine Idee? Am besten über GitHub – dort sieht jeder, was schon gemeldet ist. Ohne GitHub-Konto geht es auch per Mail.',
      'Something broken, wrong numbers or an idea? GitHub is best – everyone can see what is already reported. Without a GitHub account, just send a mail.')}</div>
    <div class="row2" style="margin-top:8px;flex-wrap:wrap">
      <button class="k pri" data-url="${esc(kontaktLink('fehler'))}">🐞 ${L2('Fehler melden', 'Report a bug')}</button>
      <button class="k" data-url="${esc(kontaktLink('wunsch'))}">💡 ${L2('Wunsch / Idee', 'Feature request')}</button>
      <button class="k" data-url="https://github.com/${esc(kontaktRepo())}/issues">${L2('Gemeldete Punkte ansehen', 'View reported issues')}</button>
      <button class="k" data-url="mailto:${KONTAKT_MAIL}?subject=${encodeURIComponent('Pliskin Industrie ' + APP_VERSION)}">✉ ${KONTAKT_MAIL}</button>
      <button class="k" id="kt-info">${L2('Programm-Infos kopieren', 'Copy program info')}</button></div>
    <div class="hint">${L2('Programm-Infos = Version, System, Design, Patch – hilft beim Nachstellen. Deine Lager- und Plandaten werden nie mitgeschickt. Ein Screenshot hilft fast immer.',
      'Program info = version, system, design, patch – helps to reproduce. Your storage and plan data is never sent. A screenshot almost always helps.')}</div></div>`;
}
function kontaktBind(el) {
  el.querySelectorAll('.kontakt [data-url]').forEach(k => { k.onclick = () => {   // als echter Link öffnen (im Programm-Fenster → Standard-Browser)
    const a = document.createElement('a'); a.href = k.dataset.url; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); }; });
  const b = $('#kt-info', el);
  if (b) b.onclick = () => copyText(kontaktInfo()).then(ok => toast(ok ? L2('Kopiert – in die Meldung einfügen', 'Copied – paste it into your report') : L2('Kopieren ging nicht', 'Copy failed')));
}
