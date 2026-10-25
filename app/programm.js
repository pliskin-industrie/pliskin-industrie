'use strict';
/* Pliskin Industrie – Programm: Ausgabe/Version, Sprache, Server-Modus, Updates (GitHub) und Ersteinrichtung.
   Gilt für beide Ausgaben: „privat“ (Pi-Server + Lony Pliskins Programm) und „release“ (fertiges Programm mit eigenem Server). */

let APP = { version: APP_VERSION, edition: 'test', desktop: false, os: '', github: '', frozen: false };
let PROG = null, UPD = null;
async function progInit() {
  if (MODE === 'server') { try { APP = Object.assign(APP, await call('app_info') || {}); } catch (e) { /* alter Server */ } }
  if (APP.desktop) { try { PROG = await call('prog_get'); } catch (e) { PROG = null; } }
  document.querySelectorAll('.app-ver').forEach(e => { e.textContent = APP.version; });
  document.querySelectorAll('.app-ver-s').forEach(e => { e.textContent = String(APP.version).split('.').slice(0, 2).join('.'); });
  // Vorschau der Entwicklungs-Kopie (Port 8775, Daten in vorschaudaten/): deutlich kennzeichnen, damit niemand sie mit Live verwechselt
  if (/vorschaudaten/.test(APP.dataDir || '') && !document.getElementById('vorschau-schild')) {
    const v = document.createElement('div'); v.id = 'vorschau-schild'; v.setAttribute('data-notr', '');
    v.textContent = 'VORSCHAU · nächster Bau · Daten nur Kopie';
    v.style.cssText = 'position:fixed;left:50%;top:0;transform:translateX(-50%);z-index:99;background:#c0392b;color:#fff;font:700 12px sans-serif;padding:3px 12px;border-radius:0 0 6px 6px;letter-spacing:.06em;pointer-events:none';
    document.body.appendChild(v);
  }
  // Bestehende Nutzer (schon Daten da) überspringen die Ersteinrichtung
  if (S.settings.setupDone == null && !progEmpty()) S.settings.setupDone = true;
}
const progEmpty = () => !S.plans.length && !S.stacks.length && !Object.keys(S.owned).length && !S.fleet.length && !S.contracts.length;
const isEN = () => S && S.settings.lang === 'en';
const L2 = (de, en) => isEN() ? en : de;   // zweisprachige Texte im Programm-Bereich

/* ---------------- Einstellungen: Bereich „Programm“ ---------------- */
function progBoxHtml() {
  const st = S.settings, srvOn = PROG && PROG.server, run = PROG && PROG.running || {};
  const rel = (UPD && UPD.releases) || [];
  const server = APP.desktop
    ? `<label class="dim" style="display:flex;gap:6px;align-items:center;margin-top:4px;font:13px var(--vdu)"><input type="checkbox" id="pg-srv" ${srvOn ? 'checked' : ''}> ${L2('Server-Modus: auch Handy, Laptop und andere PCs im Heimnetz dürfen zugreifen', 'Server mode: phones, laptops and other PCs on your home network may connect')}</label>
       <div class="form" style="margin-top:6px"><div class="fld"><label>Port</label><input id="pg-port" type="number" min="1024" max="65535" value="${PROG.port || 8770}" style="width:110px"></div></div>
       ${srvOn && PROG.addrs && PROG.addrs.length ? `<div class="hint ok">${L2('Erreichbar unter', 'Reachable at')}: ${PROG.addrs.map(a => `<b>http://${esc(a)}:${run.port}</b>`).join(' · ')}</div>` : ''}
       <div class="hint">${L2(`<b>Was macht das?</b> Pliskin läuft immer mit einem kleinen eingebauten Server – normalerweise nur für dieses Fenster. Mit dem Server-Modus öffnet er sich für dein Heimnetz: Auf dem Handy oder Laptop einfach die Adresse oben im Browser öffnen, alle sehen und bearbeiten dieselben Daten (die liegen auf diesem Rechner). Dieser Rechner muss dafür an sein und Pliskin laufen. Beim ersten Einschalten fragt Windows evtl. nach einer Firewall-Freigabe – „Private Netzwerke“ erlauben. Nicht für das Internet gedacht (kein Passwort).`,
          `<b>What does it do?</b> Pliskin always runs a small built-in server – normally only for this window. Server mode opens it to your home network: open the address above in the browser on your phone or laptop and everyone sees and edits the same data (stored on this computer). This computer has to be on and Pliskin running. The first time, Windows may ask for a firewall permission – allow “Private networks”. Not meant for the internet (no password).`)}</div>`
    : MODE === 'server'
      ? `<div class="hint" style="margin-top:0">${L2('Pliskin läuft hier bereits als Server (z. B. auf dem Pi) – alle Geräte im Heimnetz greifen auf dieselben Daten zu. Den Server-Modus schaltest du im fertigen Programm (.exe / Linux) um.', 'Pliskin already runs as a server here (e.g. on a Raspberry Pi) – all devices on your network share the same data. Server mode is switched in the desktop program (.exe / Linux).')}</div>`
      : `<div class="hint" style="margin-top:0">${L2('Server-Modus gibt es im fertigen Programm.', 'Server mode is available in the desktop program.')}</div>`;
  const upd = !APP.github
    ? `<div class="hint">${L2('Update-Quelle (GitHub) ist in dieser Ausgabe nicht eingerichtet.', 'No update source (GitHub) configured in this edition.')}</div>`
    : `<div class="row2" style="margin-top:6px"><select id="pg-ver" style="min-width:220px">${rel.length ? rel.map(r => `<option value="${esc(r.tag)}">${esc(r.tag)}${r.tag.replace(/^v/, '') === APP.version ? ' · ' + L2('installiert', 'installed') : ''}${r.pre ? ' · Test' : ''} · ${esc(r.date)}${r.asset ? '' : ' · ' + L2('keine Datei für dein System', 'no file for your system')}</option>`).join('') : `<option value="">${L2('– noch nicht abgefragt –', '– not checked yet –')}</option>`}</select>
       <button class="k sm" id="pg-chk">${L2('Jetzt prüfen', 'Check now')}</button>${APP.desktop && APP.frozen ? `<button class="k sm pri" id="pg-inst" ${rel.length ? '' : 'disabled'}>${L2('Diese Version installieren', 'Install this version')}</button>` : ''}</div>
       ${UPD && UPD.newer ? `<div class="hint warn">${L2('Neue Version verfügbar', 'New version available')}: <b>${esc(UPD.newer)}</b></div>` : UPD && UPD.ok ? `<div class="hint ok">${L2('Du hast die neueste Version.', 'You are up to date.')}</div>` : UPD && UPD.error ? `<div class="hint bad">${esc(UPD.error)}</div>` : ''}
       ${!(APP.desktop && APP.frozen) ? `<div class="hint">${L2('Installieren geht im fertigen Programm. Ältere Versionen lassen sich dort genauso auswählen.', 'Installing works in the desktop program. Older versions can be chosen there as well.')}</div>` : `<div class="hint">${L2('Auch ältere Versionen lassen sich hier auswählen. Die bisherige Programmdatei bleibt als Sicherung daneben liegen, deine Daten bleiben unverändert.', 'Older versions can be chosen too. The previous program file is kept next to it as a backup; your data stays untouched.')}</div>`}`;
  return `<div class="win tight"><span class="pill">${L2('Programm', 'Program')}</span><span class="sub">Pliskin Industrie ${esc(APP.version)}${APP.edition && APP.edition !== 'test' ? ' · ' + esc(APP.edition) : ''}${APP.os ? ' · ' + esc(APP.os) : ''}</span>
      <div class="form"><div class="fld"><label>${L2('Sprache', 'Language')}</label><select id="pg-lang"><option value="de" ${!isEN() ? 'selected' : ''}>Deutsch</option><option value="en" ${isEN() ? 'selected' : ''}>English</option></select></div></div>
      <div class="flbl" style="margin-top:10px">${L2('Server-Modus', 'Server mode')}</div>${server}
      ${typeof erfKeyHtml === 'function' ? erfKeyHtml() : ''}
      <div class="flbl" style="margin-top:10px">${L2('Updates', 'Updates')}</div>
      <label class="dim" style="display:flex;gap:6px;align-items:center;font:13px var(--vdu)"><input type="checkbox" id="pg-hint" ${st.updHint !== false ? 'checked' : ''}> ${L2('Beim Start auf neue Version hinweisen', 'Notify me about new versions on start')}</label>${upd}</div>`;
}
function progBoxBind(el) {
  if (typeof erfKeyBind === 'function') erfKeyBind(el);
  const lg = $('#pg-lang', el); if (lg) lg.onchange = () => setLang(lg.value);
  const hn = $('#pg-hint', el); if (hn) hn.onchange = () => { S.settings.updHint = hn.checked; save(); };
  const sv = $('#pg-srv', el), pt = $('#pg-port', el);
  const setSrv = async () => {
    const r = await call('prog_set', { server: sv.checked, port: +pt.value || 8770 });
    if (r && r.reload) { location.href = r.reload; return; }
    PROG = await call('prog_get'); toast(sv.checked ? L2('Server-Modus an', 'Server mode on') : L2('Server-Modus aus', 'Server mode off')); render();
  };
  if (sv) sv.onchange = setSrv;
  if (pt) pt.onchange = () => { if (sv.checked) setSrv(); else call('prog_set', { port: +pt.value || 8770 }); };
  const ck = $('#pg-chk', el); if (ck) ck.onclick = async () => { ck.disabled = true; UPD = await call('updates', true); render(); };
  const ins = $('#pg-inst', el);
  if (ins) ins.onclick = async () => {
    const tag = $('#pg-ver', el).value; if (!tag) return;
    if (!await ask(L2(`Version <b>${esc(tag)}</b> herunterladen und Pliskin damit neu starten?<br><span class="dim">Deine Daten bleiben, die bisherige Programmdatei wird als Sicherung aufgehoben.</span>`, `Download version <b>${esc(tag)}</b> and restart Pliskin with it?<br><span class="dim">Your data stays; the previous program file is kept as a backup.</span>`), L2('Installieren', 'Install'))) return;
    setComm(L2('UPDATE WIRD GELADEN …', 'DOWNLOADING UPDATE …'));
    const r = await call('update_install', tag);
    if (r && r.ok) setComm(L2('UPDATE INSTALLIERT · PLISKIN STARTET NEU', 'UPDATE INSTALLED · RESTARTING')); else toast((r && r.error) || L2('Update fehlgeschlagen', 'Update failed'));
  };
}

/* ---------------- Update-Hinweis beim Start ---------------- */
async function progUpdateCheck() {
  if (!APP.github || MODE !== 'server' || DEMO) return;
  try { UPD = await call('updates', false); } catch (e) { return; }
  if (!UPD || !UPD.newer || S.settings.updHint === false || S.settings.updSkip === UPD.newer) return;
  const b = document.createElement('div'); b.id = 'upd-banner'; b.className = 'upd-banner';
  b.innerHTML = `<span>⬆ ${L2('Neue Version', 'New version')} <b>${esc(UPD.newer)}</b> ${L2('verfügbar', 'available')}</span><button class="k sm pri" id="ub-go">${L2('Ansehen', 'Show')}</button><button class="k sm" id="ub-skip">${L2('Diese überspringen', 'Skip this one')}</button><button class="k sm" id="ub-off">${L2('Hinweise aus', 'Mute')}</button><button class="k sm x" id="ub-x">✕</button>`;
  document.body.appendChild(b);
  const close = () => b.remove();
  $('#ub-go', b).onclick = () => { close(); if (window.MOBILE && typeof mGo === 'function') mGo('opt'); else switchTab('opt'); };
  $('#ub-skip', b).onclick = () => { S.settings.updSkip = UPD.newer; save(); close(); };
  $('#ub-off', b).onclick = () => { S.settings.updHint = false; save(); close(); toast(L2('Update-Hinweise aus – wieder einschalten unter Einstellungen → Programm', 'Update notices muted – turn back on in Settings → Program')); };
  $('#ub-x', b).onclick = close;
}

/* ---------------- Ersteinrichtung (neue Nutzer): Sprache, Design, leer oder Demo ---------------- */
function firstStart() {
  if (DEMO || S.settings.setupDone || $('#modal').classList.contains('on')) { if (!DEMO && S.settings.setupDone) helpFirstStart(); return; }
  const themes = typeof THEMES !== 'undefined' ? THEMES : [...document.querySelectorAll('#theme option')].map(o => [o.value, o.textContent]);
  const draw = () => openModal(`<h3>Pliskin Industrie ${esc(APP.version)}</h3>
    <div class="flbl">Sprache · Language</div>
    <div class="row2"><button class="k ${!isEN() ? 'pri' : ''}" data-fl="de">Deutsch</button><button class="k ${isEN() ? 'pri' : ''}" data-fl="en">English</button></div>
    <div class="flbl" style="margin-top:12px">${L2('Design', 'Design')}</div>
    <select id="fs-th" style="width:100%">${themes.map(([k, l]) => `<option value="${k}" ${S.settings.theme === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
    <div class="hint">${L2('Lässt sich jederzeit oben rechts bzw. unter Einstellungen ändern.', 'Can be changed any time (top right or in Settings).')}</div>
    <div class="flbl" style="margin-top:12px">${L2('Wie willst du starten?', 'How do you want to start?')}</div>
    <div class="hint" style="margin-top:0">${L2('<b>Leer starten</b>: Pliskin beginnt ohne Daten – du legst Lager, Pläne, Schiffe und Blueprints selbst an (oder liest die Blueprints per Log-Sync aus dem Spiel).<br><b>Demo ansehen</b>: Pliskin lädt fertige Beispiel-Daten (Lager, Crafting-Pläne, Schiffe, Contracts, Touren), damit du dir schnell einen Überblick verschaffen kannst, was alles geht. Im Demo-Modus wird nichts gespeichert; beenden mit dem Knopf im Demo-Banner – danach bist du wieder bei deinen eigenen (leeren) Daten.',
      '<b>Start empty</b>: Pliskin starts without data – you add storage, plans, ships and blueprints yourself (or read your blueprints from the game via Log-Sync).<br><b>Try the demo</b>: Pliskin loads ready-made sample data (storage, crafting plans, ships, contracts, tours) so you can quickly see what it can do. Nothing is saved in demo mode; leave it with the button in the demo banner – you are then back to your own (empty) data.')}</div>
    <div class="foot"><button class="k" id="fs-demo">${L2('Demo ansehen', 'Try the demo')}</button><button class="k pri" id="fs-go">${L2('Leer starten', 'Start empty')}</button></div>`, box => {
    $$('[data-fl]', box).forEach(b => b.onclick = async () => { await setLang(b.dataset.fl); draw(); });
    $('#fs-th', box).onchange = e => { S.settings.theme = e.target.value; applyTheme(); };
    const done = () => { S.settings.setupDone = true; save(); closeModal(); };
    $('#fs-go', box).onclick = () => { done(); render(); setTimeout(helpFirstStart, 300); };
    $('#fs-demo', box).onclick = () => { S.ui.helpSeen = true; done(); demoStart(); };
  });
  draw();
}
