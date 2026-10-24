'use strict';
/* Pliskin Industrie – Etappe 2: Schiffe (Cargo-Grids), Contracts, Umlagerung, Aktive Tour (Karte + Ladeplan).
   Nutzt Daten und Bausteine aus app.js (S, U, save, render, openModal, attachAC …).
   Spieldaten: data/schiffe.json (Grids aus Standard-Ausstattung), data/karte.json (Positionen aus den System-Containern). */

const E2 = { ready: false, loading: null, karte: { systems: {} }, ship: {} };
function e2Init() {
  if (E2.ready) return Promise.resolve();
  if (!E2.loading) E2.loading = Promise.all([loadShips(), fetch('data/karte.json').then(r => r.json()).catch(() => ({ systems: {} }))])
    .then(([ships, k]) => { E2.karte = k; ships.forEach(s => E2.ship[s.id] = s); E2.ready = true; });
  return E2.loading;
}
// Bildschirme rufen das auf: sind die Daten noch nicht da, erst laden, dann neu zeichnen
const e2Wait = el => { if (E2.ready) return false; el.innerHTML = '<div class="empty">Lade Schiffs- und Kartendaten …</div>'; e2Init().then(render); return true; };

/* ------------------------------------------------------------------ */
/* Grundlagen: Kisten, Farben, Orte                                     */
/* ------------------------------------------------------------------ */
// Kistenformen in 1-SCU-Feldern (Breite, Länge, Höhe) – wie im alten SC Lager
const BOXG = { 1: [1, 1, 1], 2: [1, 2, 1], 4: [2, 2, 1], 8: [2, 2, 2], 16: [2, 4, 2], 24: [2, 6, 2], 32: [2, 8, 2] };
const SPLIT = { 32: [16, 16], 24: [16, 8], 16: [8, 8], 8: [4, 4], 4: [2, 2], 2: [1, 1] };
const DOORS = [['vorne', 'vorne'], ['rechts', 'rechts'], ['hinten', 'hinten'], ['links', 'links']];
// Farben weit auseinander (Ware bzw. Stopp im Ladeplan)
const PALETTE = ['#3f9cff', '#f0b020', '#9be040', '#e060c8', '#40d8d0', '#ff6a50', '#e4e4f0', '#a070ff', '#ffe060', '#3fb060', '#ff9ac0', '#b08860'];
const wareCol = w => { let h = 0; for (const c of String(w)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };
const fitsMaxDim = (d, mx) => { if (!mx) return true; const a = [...d].sort((p, q) => p - q), b = [...mx].sort((p, q) => p - q); return a.every((v, i) => v <= b[i]); };
const fitsGrid = (d, g) => { const a = [...d].sort((p, q) => p - q), b = [g.x, g.y, g.z].sort((p, q) => p - q); return a.every((v, i) => v <= b[i]) && fitsMaxDim(d, g.max); };
const maxCrate = g => Math.max(0, ...[32, 24, 16, 8, 4, 2, 1].filter(s => fitsGrid(BOXG[s], g)));

const KIND = { star: ['#ffd27a', 2.2], planet: ['#7fd0ff', 1.1], moon: ['#9fb4c0', .5], lpoint: ['#f0b050', .45], jump: ['#c88aff', .9], station: ['#5ad2e8', .45] };
const PCOL = { Hurston: '#c08050', Crusader: '#e0c890', ArcCorp: '#d06050', microTech: '#8ad0f0', 'Pyro I': '#d07040', Monox: '#a08860', Bloom: '#80a070', 'Pyro IV': '#a07060', 'Pyro V': '#c09060', Terminus: '#7090b0' };
const sysBodies = sys => (E2.karte.systems[sys] || []).map(b => ({ ...b, sys, y: -b.y }));   // Spiel: y nach oben, Bildschirm: nach unten
const allBodies = () => Object.keys(E2.karte.systems).flatMap(sysBodies);
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Ort (Text, z. B. UEX-Terminal „Baijini Point“) -> Himmelskörper der Karte
function locInfo(loc) {
  if (!loc) return null;
  const man = S.locMap[loc]; if (man) { const b = allBodies().find(x => x.sys === man.sys && x.name === man.body); if (b) return { sys: b.sys, body: b, manual: true }; }
  const t = (U.terminals || []).find(x => x.name === loc) || (U.terminals || []).find(x => norm(x.name) === norm(loc));
  const sys = t && t.system;
  const find = (name, s) => allBodies().find(b => norm(b.name) === norm(name) && (!s || b.sys === s));
  const txt = [loc, t && t.station, t && t.city, t && t.outpost].filter(Boolean).join(' ');
  let m = txt.match(/\b([A-Z]{3})-L(\d)\b/);
  if (m) { const b = find(m[1] + '-L' + m[2], sys); if (b) return { sys: b.sys, body: b }; }
  m = txt.match(/\b(\w+) Gateway\b/i);
  if (m) { const b = allBodies().find(x => x.kind === 'jump' && norm(x.name) === norm('Sprungpunkt ' + m[1]) && (!sys || x.sys === sys)); if (b) return { sys: b.sys, body: b }; }
  // Station mit eigenem Kartenpunkt (z. B. „Checkmate Station“ liegt am L4 von Monox, nicht am Planeten)
  const tn = ' ' + norm(txt) + ' ';
  const st = allBodies().filter(b => b.kind === 'station' && (!sys || b.sys === sys) && tn.includes(' ' + norm(b.name) + ' ')).sort((a, b) => b.name.length - a.name.length)[0];
  if (st) return { sys: st.sys, body: st };
  if (t) { const b = find(t.moon, sys) || find(t.planet, sys); if (b) return { sys: b.sys, body: b }; }
  // Haupt-Städte und Orbital-Stationen (z. B. Home-Station „Area18“) ohne UEX-Treffer
  const CITY = { 'area18': 'ArcCorp', 'area 18': 'ArcCorp', 'baijini point': 'ArcCorp', 'lorville': 'Hurston', 'everus harbor': 'Hurston', 'new babbage': 'microTech', 'port tressler': 'microTech', 'orison': 'Crusader', 'seraphim station': 'Crusader' };
  const cb = CITY[norm(loc)] || Object.entries(CITY).find(([k]) => (' ' + norm(loc) + ' ').includes(' ' + k + ' '))?.[1];
  if (!t && cb) { const b = find(cb, 'Stanton'); if (b) return { sys: b.sys, body: b }; }
  // Freitext: längster Körpername, der im Ortsnamen vorkommt („Lorville (Hurston)“, „Daymar Outpost“)
  const n = ' ' + norm(loc) + ' ';
  const hit = allBodies().filter(b => b.kind !== 'star' && n.includes(' ' + norm(b.name) + ' ')).sort((a, b) => b.name.length - a.name.length)[0];
  return hit ? { sys: hit.sys, body: hit } : null;
}
// Entfernung in Gm (Luftlinie); zwischen Systemen über die Sprungpunkte
function locDist(a, b) {
  const A = locInfo(a), B = locInfo(b);
  if (!A || !B) return null;
  const d = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  if (A.sys === B.sys) return d(A.body, B.body);
  const ja = sysBodies(A.sys).find(x => x.kind === 'jump' && norm(x.name) === norm('Sprungpunkt ' + B.sys));
  const jb = sysBodies(B.sys).find(x => x.kind === 'jump' && norm(x.name) === norm('Sprungpunkt ' + A.sys));
  return ja && jb ? d(A.body, ja) + d(jb, B.body) : null;
}

/* ------------------------------------------------------------------ */
/* Eigene Schiffe                                                       */
/* ------------------------------------------------------------------ */
const fleetModel = f => E2.ship[f.ship] || { name: f.ship, scu: 0, grids: [] };
const fleetGrids = f => (f.grids && f.grids.length ? f.grids : fleetModel(f).grids) || [];
const fleetScu = f => fleetGrids(f).reduce((a, g) => a + g.x * g.y * g.z, 0);
const fleetName = f => f ? (f.name || fleetModel(f).name) : '–';
/* Quantum: Antrieb (eigener oder Standard), Tank, Reichweite – Werte laut Spieldaten, Flugzeit/Verbrauch geschätzt */
const fleetQd = f => f && (QDRIVES[f.qd] || QDRIVES[fleetModel(f).qd]) || null;
const fleetQt = f => f ? (fleetModel(f).qtank || 0) : 0;
const fleetRange = f => { const d = fleetQd(f), t = fleetQt(f); return d && d.fuel && t ? t / d.fuel : null; };
const qtTime = (f, gm) => { const d = fleetQd(f); return d && gm != null ? (gm < 0.02 ? 0 : (d.spool || 5) + 10 + gm / d.speed) : null; };   // Hochfahren + Beschleunigen (~10 s) + Strecke; gleicher Ort/Planet = kein Quantumsprung
const fmtFly = s => s == null ? '?' : s < 90 ? Math.round(s) + ' s' : Math.round(s / 60) + ' min';
const gridLabel = (g, i, f) => (f && f.gridNames && f.gridNames[i]) || (g.port || '').replace(/^hardpoint_/i, '').replace(/cargo_?grid_?/i, '').replace(/_/g, ' ').trim() || 'Grid ' + (i + 1);

function renderShips() {
  const el = $('#ships'); if (e2Wait(el)) return;
  let h = `<div class="win tight"><span class="pill">Meine Schiffe</span>
    <div class="row2"><button class="k pri" id="sh-add">+ Schiff</button><div class="grow"></div>
    <span class="dim" style="font-size:13px">Cargo-Grids aus den Spieldaten (Patch ${esc((E2.karte.patch) || '?')}) · Türseite pro Grid einstellbar</span></div></div>`;
  if (!S.fleet.length) h += '<div class="win tight"><div class="empty">Noch kein Schiff. „+ Schiff“ – z. B. Zeus Mk II CL.</div></div>';
  for (const f of S.fleet) {
    const m = fleetModel(f), gs = fleetGrids(f), inTour = [S.tour, S.stour].some(t => t && t.ship === f.id);
    h += `<div class="win tight"><span class="pill">${esc(fleetName(f))}</span><span class="sub">${esc(m.name)} · ${fleetScu(f)} SCU${inTour ? ' · <span class="green">in der Tour</span>' : ''}</span>
      <div class="row2"><button class="k sm" data-fa="ren" data-f="${f.id}">Umbenennen</button>${gs.length ? '' : `<button class="k sm" data-fa="grid" data-f="${f.id}">Grid selbst eintragen</button>`}
      ${f.grids && f.grids.length ? `<button class="k sm" data-fa="grid" data-f="${f.id}">Grid ändern</button>` : ''}
      <button class="k sm ${inTour ? 'pri' : ''}" data-fa="tour" data-f="${f.id}">Für die Tour nutzen</button><div class="grow"></div><button class="k sm x" data-fa="del" data-f="${f.id}">×</button></div>
      ${gs.length ? '' : '<div class="hint">Für dieses Schiff steht kein Cargo-Grid in der Standard-Ausstattung der Spieldaten. Maße einfach selbst eintragen (1 Feld = 1 SCU).</div>'}
      ${shipQtBox(f)}
      <div class="e2grids">${gs.map((g, i) => `<div class="e2gcard"><div class="e2gh">${esc(gridLabel(g, i, f))} · ${g.x}×${g.y}×${g.z} = ${g.x * g.y * g.z} SCU · max. Kiste ${maxCrate(g)} SCU
        <button class="k sm" data-gname="${f.id}" data-gi="${i}" title="Grid benennen">✎</button>
        <select data-door="${f.id}" data-gi="${i}" title="Wo ist die Tür / Rampe?">${DOORS.map(([k, l], di) => `<option value="${di}" ${(f.doors?.[i] ?? 0) === di ? 'selected' : ''}>Tür ${l}</option>`).join('')}</select></div>
        <canvas data-cv="${f.id}:${i}"></canvas></div>`).join('')}</div></div>`;
  }
  el.innerHTML = h;
  $('#sh-add', el).onclick = openShipAdd;
  $$('[data-fa]', el).forEach(b => b.onclick = () => fleetAction(b.dataset.f, b.dataset.fa));
  $$('[data-gname]', el).forEach(b => b.onclick = () => gridRename(b.dataset.gname, +b.dataset.gi));
  $$('[data-qd]', el).forEach(s => s.onchange = () => { const f = S.fleet.find(x => x.id === s.dataset.qd); f.qd = s.value || undefined; save(); render(); });
  $$('[data-door]', el).forEach(s => s.onchange = () => { const f = S.fleet.find(x => x.id === s.dataset.door); f.doors = f.doors || {}; f.doors[s.dataset.gi] = +s.value; save(); render(); });
  $$('canvas[data-cv]', el).forEach(cv => { const [fid, gi] = cv.dataset.cv.split(':'); const f = S.fleet.find(x => x.id === fid); drawIso(cv, fleetGrids(f)[gi], [], { door: f.doors?.[gi] ?? 0 }); });
}
function shipQtBox(f) {
  const m = fleetModel(f), d = fleetQd(f), std = QDRIVES[m.qd], rg = fleetRange(f);
  const size = (std && std.size) || (d && d.size) || null;
  const opts = Object.values(QDRIVES).filter(x => !size || x.size === size).sort((a, b) => a.name.localeCompare(b.name));
  if (!d && !opts.length) return '<div class="hint">Keine Quantum-Daten für dieses Schiff in den Spieldaten.</div>';
  return `<div class="e2qt"><span class="dim">Quantum-Antrieb</span>
    <select data-qd="${f.id}"><option value="">${std ? 'Standard: ' + esc(std.name) : '– wählen –'}</option>${opts.map(x => `<option value="${esc(x.id)}" ${f.qd === x.id ? 'selected' : ''}>${esc(x.name)} (S${x.size})</option>`).join('')}</select>
    ${d ? `<span>Tempo <b>${F(d.speed, 2)} Gm/s</b></span><span>Tank <b>${F(fleetQt(f), 1)} SCU</b></span><span>Verbrauch <b>${F(d.fuel * 1000, 1)} mSCU/Gm</b></span>
    <span>Reichweite <b class="green">${rg ? '~' + N(rg) + ' Gm' : '?'}</b></span><span class="dim">z. B. 40 Gm ≈ ${fmtFly(qtTime(f, 40))}</span>` : ''}
    <span class="dim" style="font-size:12px">laut Spieldaten · Flugzeit und Reichweite geschätzt</span></div>`;
}
function gridRename(fid, gi) {
  const f = S.fleet.find(x => x.id === fid); if (!f) return;
  const g = fleetGrids(f)[gi];
  openModal(`<h3>Grid benennen</h3><input id="gn-n" value="${esc((f.gridNames || {})[gi] || '')}" placeholder="${esc(gridLabel(g, gi))}" style="width:100%"><div class="hint">Leer lassen = Name aus den Spieldaten.</div><div class="foot"><button class="k" id="gn-x">Abbrechen</button><button class="k pri" id="gn-go">Speichern</button></div>`, box => {
    const inp = $('#gn-n', box); inp.focus();
    const go = () => { f.gridNames = f.gridNames || {}; if (inp.value.trim()) f.gridNames[gi] = inp.value.trim(); else delete f.gridNames[gi]; closeModal(); save(); render(); };
    $('#gn-go', box).onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') go(); }; $('#gn-x', box).onclick = closeModal;
  });
}
function openShipAdd() {
  openModal(`<h3>Schiff hinzufügen</h3><div class="search"><input id="sa-q" placeholder="z. B. „zeus cl“, „freelancer“, „c2“" autocomplete="off"></div>
    <label class="ftog" style="margin:6px 0"><input type="checkbox" id="sa-cargo" checked> nur Schiffe mit Cargo-Grid</label>
    <div id="sa-list" style="max-height:52vh;overflow:auto"></div><div class="foot"><button class="k" id="sa-x">Fertig</button></div>`, box => {
    const q = $('#sa-q', box), list = $('#sa-list', box);
    const draw = () => {
      const w = norm(q.value).split(' ').filter(Boolean), cargo = $('#sa-cargo', box).checked;
      const res = Object.values(E2.ship).filter(s => (!cargo || s.scu > 0) && w.every(x => norm(s.name).includes(x))).slice(0, 80);
      list.innerHTML = `<table class="ptab">${res.map(s => `<tr class="clickrow" data-id="${esc(s.id)}"><td class="name">${esc(s.name)}</td><td>${s.scu ? s.scu + ' SCU' : '<span class="dim">kein Grid</span>'}</td><td class="l dim">${s.grids.length > 1 ? s.grids.length + ' Grids' : ''}</td><td><button class="k sm pri">+</button></td></tr>`).join('')}</table>` + (res.length ? '' : '<div class="empty">Nichts gefunden.</div>');
      $$('tr[data-id]', list).forEach(tr => tr.onclick = () => {
        const f = { id: uid(), ship: tr.dataset.id, name: '', doors: {} }; S.fleet.push(f);
        if (!S.tour) S.tour = { ship: f.id, stops: [] }; else if (!S.tour.ship) S.tour.ship = f.id;
        hist('Schiff hinzugefügt: ' + fleetName(f)); save(); toast(fleetName(f) + ' hinzugefügt'); render();
      });
    };
    q.oninput = draw; $('#sa-cargo', box).onchange = draw; draw(); q.focus();
    $('#sa-x', box).onclick = closeModal;
  });
}
async function fleetAction(id, a) {
  const f = S.fleet.find(x => x.id === id); if (!f) return;
  if (a === 'del') { if (!await ask(`„${esc(fleetName(f))}“ aus deinen Schiffen entfernen?`, 'Entfernen', true)) return; S.fleet = S.fleet.filter(x => x !== f); [S.tour, S.stour].forEach(t => { if (t && t.ship === id) t.ship = (S.fleet[0] || {}).id || null; }); }
  if (a === 'tour') { S.tour = S.tour || { stops: [] }; S.tour.ship = id; S.stour = S.stour || { stops: [] }; S.stour.ship = id; toast(fleetName(f) + ' fliegt die Tour'); }
  if (a === 'ren') {
    openModal(`<h3>Schiff benennen</h3><input id="fr-n" value="${esc(f.name)}" placeholder="${esc(fleetModel(f).name)}" style="width:100%"><div class="foot"><button class="k" id="fr-x">Abbrechen</button><button class="k pri" id="fr-go">Speichern</button></div>`, box => {
      const inp = $('#fr-n', box); inp.focus();
      const go = () => { f.name = inp.value.trim(); closeModal(); save(); render(); };
      $('#fr-go', box).onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') go(); }; $('#fr-x', box).onclick = closeModal;
    });
    return;
  }
  if (a === 'grid') {
    const g = (f.grids && f.grids[0]) || { x: 2, y: 4, z: 2, max: null };
    openModal(`<h3>Cargo-Grid · ${esc(fleetName(f))}</h3><div class="hint" style="margin-top:0">Maße in Feldern (1 Feld = 1 SCU = 1,25 m). Beispiel: 4 breit × 8 tief × 2 hoch = 64 SCU.</div>
      <div class="form"><div class="fld"><label>Breite</label><input id="fg-x" type="number" min="1" value="${g.x}" style="width:80px"></div>
      <div class="fld"><label>Tiefe</label><input id="fg-y" type="number" min="1" value="${g.y}" style="width:80px"></div>
      <div class="fld"><label>Höhe</label><input id="fg-z" type="number" min="1" value="${g.z}" style="width:80px"></div>
      <div class="fld"><label>größte Kiste</label><select id="fg-m">${[32, 24, 16, 8, 4, 2, 1].map(s => `<option ${s === 32 ? 'selected' : ''}>${s}</option>`).join('')}</select></div></div>
      <div class="foot">${f.grids && f.grids.length ? '<button class="k x" id="fg-del">Eigene Maße löschen</button>' : ''}<button class="k" id="fg-x2">Abbrechen</button><button class="k pri" id="fg-go">Speichern</button></div>`, box => {
      $('#fg-x2', box).onclick = closeModal;
      const del = $('#fg-del', box); if (del) del.onclick = () => { f.grids = []; closeModal(); save(); render(); };
      $('#fg-go', box).onclick = () => {
        const v = k => Math.max(1, Math.round(num($('#fg-' + k, box).value)));
        f.grids = [{ port: 'eigenes Grid', x: v('x'), y: v('y'), z: v('z'), max: BOXG[$('#fg-m', box).value] }];
        closeModal(); save(); render();
      };
    });
    return;
  }
  save(); render();
}

/* ------------------------------------------------------------------ */
/* Contracts                                                            */
/* ------------------------------------------------------------------ */
const CSTAT = { offen: ['offen', ''], tour: ['in der Tour', 'warn'], erledigt: ['erledigt', 'ok'] };
const ctrScu = c => c.lines.reduce((a, l) => a + (l.scu || 0), 0);
function renderContracts() {
  const el = $('#ctr'); if (e2Wait(el)) return;
  const act = S.contracts.filter(c => c.status !== 'erledigt'), done = S.contracts.filter(c => c.status === 'erledigt');
  const row = c => `<tr><td class="name">${esc(c.giver || '–')}${c.note ? `<div class="dim" style="font-size:12px">${esc(c.note)}</div>` : ''}</td>
    <td class="l">${c.lines.map(l => `<div><span class="e2chip" style="background:${wareCol(l.ware)}"></span>${esc(l.ware)} <b>${F(l.scu, 2)}</b> SCU · ${esc(l.from || '?')} → ${esc(l.to || '?')}${(!locInfo(l.from) || !locInfo(l.to)) ? ' <span class="tag warn" title="Ort nicht auf der Karte gefunden – in der Tour zuordnen">?</span>' : ''}</div>`).join('')}</td>
    <td>${F(ctrScu(c), 2)}</td><td>${c.reward ? N(c.reward) : '–'}</td><td class="l dim">${esc(c.deadline || '')}</td>
    <td class="l"><span class="tag ${CSTAT[c.status][1]}">${CSTAT[c.status][0]}</span></td>
    <td style="white-space:nowrap">${c.status !== 'erledigt' ? `<button class="k sm ${c.status === 'tour' ? '' : 'pri'}" data-ca="tour" data-c="${c.id}">${c.status === 'tour' ? 'aus Tour' : 'in Tour'}</button> ` : ''}<button class="k sm" data-ca="edit" data-c="${c.id}">Bearbeiten</button> ${c.status !== 'erledigt' ? `<button class="k sm" data-ca="done" data-c="${c.id}">✓</button> ` : ''}<button class="k sm x" data-ca="del" data-c="${c.id}">×</button></td></tr>`;
  const head = '<tr><th class="l">Auftraggeber</th><th class="l">Fracht · Strecke</th><th>SCU</th><th>aUEC</th><th class="l">Frist</th><th class="l">Status</th><th></th></tr>';
  el.innerHTML = `<div class="win tight"><span class="pill">Contracts</span><span class="sub">${act.length} offen · ${F(act.reduce((a, c) => a + ctrScu(c), 0), 2)} SCU · ${N(act.reduce((a, c) => a + (c.reward || 0), 0))} aUEC</span>
    <div class="row2"><button class="k pri" id="ct-add">+ Contract</button><div class="grow"></div><span class="dim" style="font-size:13px">„in Tour“ = wird in der Aktiven Tour eingeplant</span></div>
    <div class="scroll"><table class="ptab">${head}${act.map(row).join('') || '<tr><td colspan="7" class="empty">Keine offenen Contracts.</td></tr>'}</table></div></div>
    ${done.length ? `<div class="win tight"><span class="pill">Erledigt</span><div class="scroll"><table class="ptab">${head}${done.slice(-30).reverse().map(row).join('')}</table></div></div>` : ''}`;
  $('#ct-add', el).onclick = () => openContract();
  $$('[data-ca]', el).forEach(b => b.onclick = () => contractAction(b.dataset.c, b.dataset.ca));
}
async function contractAction(id, a) {
  const c = S.contracts.find(x => x.id === id); if (!c) return;
  if (a === 'edit') return openContract(c);
  if (a === 'del') { if (!await ask(`Contract „${esc(c.giver || '')}“ löschen?`, 'Löschen', true)) return; S.contracts = S.contracts.filter(x => x !== c); }
  if (a === 'tour') c.status = c.status === 'tour' ? 'offen' : 'tour';
  if (a === 'done') { c.status = 'erledigt'; c.doneTs = now(); hist(`Contract erledigt: ${c.giver || ''}${c.reward ? ' · +' + N(c.reward) + ' aUEC' : ''}`); }
  save(); render();
}
function openContract(c) {
  const ed = c ? JSON.parse(JSON.stringify(c)) : { id: uid(), giver: '', reward: 0, deadline: '', note: '', status: 'tour', lines: [{ id: uid(), ware: '', scu: 0, from: '', to: '' }] };
  const lineHtml = (l, i) => `<div class="form e2line" data-li="${i}">
    <div class="fld" style="min-width:170px;flex:2"><label>Ware</label><input data-lf="ware" value="${esc(l.ware)}" autocomplete="off"></div>
    <div class="fld"><label>SCU</label><input data-lf="scu" value="${l.scu ? FI(l.scu, 3) : ''}" style="width:80px"></div>
    <div class="fld" style="min-width:170px;flex:2"><label>von</label><input data-lf="from" value="${esc(l.from)}" autocomplete="off"></div>
    <div class="fld" style="min-width:170px;flex:2"><label>nach</label><input data-lf="to" value="${esc(l.to)}" autocomplete="off"></div>
    <button class="k sm x" data-ldel="${i}" style="align-self:flex-end">×</button></div>`;
  const draw = () => openModal(`<h3>${c ? 'Contract bearbeiten' : 'Neuer Contract'}</h3>
    <div class="form"><div class="fld" style="flex:2;min-width:180px"><label>Auftraggeber</label><input id="co-g" value="${esc(ed.giver)}" placeholder="z. B. Covalex"></div>
      <div class="fld"><label>Belohnung aUEC</label><input id="co-r" value="${ed.reward || ''}" style="width:120px"></div>
      <div class="fld"><label>Frist</label><input id="co-d" value="${esc(ed.deadline)}" placeholder="z. B. 2 h" style="width:110px"></div></div>
    <div class="flbl">Fracht</div><div id="co-lines">${ed.lines.map(lineHtml).join('')}</div>
    <button class="k sm" id="co-add">+ Zeile</button>
    <div class="form" style="margin-top:8px"><div class="fld" style="flex:1"><label>Notiz</label><input id="co-n" value="${esc(ed.note)}"></div></div>
    <label class="ftog" style="margin-top:6px"><input type="checkbox" id="co-t" ${ed.status === 'tour' ? 'checked' : ''} ${ed.status === 'erledigt' ? 'disabled' : ''}> in die Contracts-Tour aufnehmen</label>
    <div class="foot"><button class="k" id="co-x">Abbrechen</button><button class="k pri" id="co-go">Speichern</button></div>`, box => {
    const grab = () => {
      ed.giver = $('#co-g', box).value.trim(); ed.reward = Math.round(num($('#co-r', box).value)); ed.deadline = $('#co-d', box).value.trim(); ed.note = $('#co-n', box).value.trim();
      $$('.e2line', box).forEach(r => { const l = ed.lines[r.dataset.li]; $$('[data-lf]', r).forEach(i => { l[i.dataset.lf] = i.dataset.lf === 'scu' ? num(i.value) : i.value.trim(); }); });
      if (ed.status !== 'erledigt') ed.status = $('#co-t', box).checked ? 'tour' : 'offen';
    };
    $$('.e2line', box).forEach(r => {
      attachAC($('[data-lf=ware]', r), q => materialChoices(q).map(x => ({ ...x, value: x.label })));
      attachAC($('[data-lf=from]', r), locationChoices); attachAC($('[data-lf=to]', r), locationChoices);
    });
    $('#co-add', box).onclick = () => { grab(); const last = ed.lines[ed.lines.length - 1] || {}; ed.lines.push({ id: uid(), ware: '', scu: 0, from: last.from || '', to: last.to || '' }); draw(); };
    $$('[data-ldel]', box).forEach(b => b.onclick = () => { grab(); ed.lines.splice(+b.dataset.ldel, 1); if (!ed.lines.length) ed.lines.push({ id: uid(), ware: '', scu: 0, from: '', to: '' }); draw(); });
    $('#co-x', box).onclick = closeModal;
    $('#co-go', box).onclick = () => {
      grab(); ed.lines = ed.lines.filter(l => l.ware && l.scu > 0);
      if (!ed.lines.length) { toast('Mindestens eine Fracht-Zeile mit Ware und SCU'); return; }
      const i = S.contracts.findIndex(x => x.id === ed.id);
      if (i >= 0) S.contracts[i] = ed; else { ed.ts = now(); S.contracts.push(ed); hist(`Contract angenommen: ${ed.giver || ''} · ${F(ctrScu(ed), 2)} SCU`); }
      closeModal(); save(); render();
    };
    if (!c) $('#co-g', box).focus();
  });
  draw();
}

/* ------------------------------------------------------------------ */
/* Umlagerung (eigener Lagerbestand von A nach B)                       */
/* ------------------------------------------------------------------ */
function lagerMoves() {
  const open = S.moves.filter(m => m.status !== 'erledigt');
  const stOpt = S.stacks.filter(s => s.unit !== 'Stk').map(s => `<option value="${s.id}">${esc(resName(s.mat))} · ${fmtAmt(s.amount, s.unit)}${s.q != null ? ' · Q' + s.q : ''} · ${esc(s.loc || 'ohne Ort')}</option>`).join('');
  return `<div class="win tight"><span class="pill">Umlagerung planen</span>
    <div class="form"><div class="fld" style="min-width:260px;flex:2"><label>Was (aus dem Lager)</label><select id="mv-s">${stOpt || '<option value="">Lager ist leer</option>'}</select></div>
      <div class="fld"><label>Menge SCU</label><input id="mv-a" placeholder="alles" style="width:100px"></div>
      <div class="fld" style="min-width:220px;flex:2"><label>Nach</label><input id="mv-to" autocomplete="off" placeholder="z. B. Port Tressler"></div>
      <button class="k pri" id="mv-go">Einplanen</button></div>
    <div class="hint">Geplante Umlagerungen landen in der Lager-Tour unter „Tour planen“ (laden am alten Ort, abladen am Ziel). Ist der Stopp erledigt, bucht Pliskin den Bestand automatisch um.</div></div>
  <div class="win tight"><span class="pill">Geplant</span><table class="ptab"><tr><th class="l">Ware</th><th>SCU</th><th class="l">von → nach</th><th class="l">Status</th><th></th></tr>
    ${open.map(m => { const s = S.stacks.find(x => x.id === m.stack); return `<tr><td class="name">${s ? esc(resName(s.mat)) : '<span class="bad">Bestand fehlt</span>'}</td><td>${F(m.amount, 2)}</td><td class="l">${esc(s ? s.loc : '?')} → ${esc(m.to)}</td>
      <td class="l"><span class="tag ${m.status === 'tour' ? 'warn' : ''}">${m.status === 'tour' ? 'in der Tour' : 'offen'}</span></td>
      <td style="white-space:nowrap"><button class="k sm" data-ma="tour" data-m="${m.id}">${m.status === 'tour' ? 'aus Tour' : 'in Tour'}</button> <button class="k sm x" data-ma="del" data-m="${m.id}">×</button></td></tr>`; }).join('') || '<tr><td colspan="5" class="empty">Nichts geplant.</td></tr>'}</table></div>`;
}
function bindMoves(el) {
  const to = $('#mv-to', el); attachAC(to, locationChoices);
  $('#mv-go', el).onclick = () => {
    const s = S.stacks.find(x => x.id === $('#mv-s', el).value); if (!s) return;
    const t = to.value.trim(); if (!t) { to.focus(); return; }
    if (t === s.loc) { toast('Ziel = aktueller Ort'); return; }
    const a = $('#mv-a', el).value.trim() ? Math.min(s.amount, num($('#mv-a', el).value)) : s.amount;
    if (!(a > 0)) { toast('Menge fehlt'); $('#mv-a', el).focus(); return; }
    S.moves.push({ id: uid(), stack: s.id, amount: a, to: t, status: 'tour', ts: now() });
    hist(`Umlagerung geplant: ${F(a, 2)} SCU ${resName(s.mat)} ${s.loc || ''} → ${t}`); save(); render();
  };
  $$('[data-ma]', el).forEach(b => b.onclick = () => {
    const m = S.moves.find(x => x.id === b.dataset.m); if (!m) return;
    if (b.dataset.ma === 'del') S.moves = S.moves.filter(x => x !== m); else m.status = m.status === 'tour' ? 'offen' : 'tour';
    save(); render();
  });
}

/* ------------------------------------------------------------------ */
/* Aktive Tour: Fracht-Zeilen, Stopps, Route                            */
/* ------------------------------------------------------------------ */
// Zwei getrennte Touren: „Lager“ (Verkäufe + Umlagerungen, S.stour) und „Contracts“ (S.tour); Umschalter oben in „Tour planen“
const tourKind = () => S.ui.tourKind === 'ctr' ? 'ctr' : 'lager';
// Aufräumen (bei jedem Anzeigen): Verkäufe/Umlagerungen ohne Lagerposten fallen weg, Touren ohne Fracht verlieren ihre Stopps
function tourClean() {
  let n = saleClean();
  for (const m of S.moves) if ((m.status === 'tour' || m.status === 'offen') && !S.stacks.some(s => s.id === m.stack && s.amount > 1e-9)) { m.status = 'entfallen'; m.doneTs = now(); n++; }
  const k = S.ui.tourKind;
  for (const kind of ['lager', 'ctr']) {
    const T = kind === 'ctr' ? S.tour : S.stour; if (!T || !T.stops.length) continue;
    S.ui.tourKind = kind;
    if (!tourLines().length) { T.stops = []; T.sig = null; T.manual = false; T.round = 0; n++; }
  }
  S.ui.tourKind = k;
  return n;
}
// Übersicht oben in „Tour planen“: alles Angelegte, je Eintrag „in der Tour“ an/aus und löschen
function tourOverview(kind) {
  const ck = (attr, id, on) => `<input type="checkbox" ${attr}="${id}" ${on ? 'checked' : ''} title="in der Tour">`;
  let rows = '', n = 0, on = 0;
  if (kind === 'lager') {
    const mv = S.moves.filter(m => m.status === 'tour' || m.status === 'offen');
    if (mv.length) rows += `<tr><th colspan="4" class="l">Umlagerungen</th></tr>` + mv.map(m => { const st = S.stacks.find(x => x.id === m.stack); n++; on += m.status === 'tour';
      return `<tr><td>${ck('data-ovm', m.id, m.status === 'tour')}</td><td class="l">${esc(st ? resName(st.mat) : '?')}</td><td class="l">${F(m.amount, 2)} SCU · ${esc(st ? st.loc : '?')} → ${esc(m.to)}</td><td><button class="k sm x" data-ovmx="${m.id}">×</button></td></tr>`; }).join('');
    const sl = S.sales.filter(x => x.status === 'tour' || x.status === 'offen'), rounds = [...new Set(sl.map(x => x.round || 1))].sort((a, b) => a - b);
    for (const r of rounds) rows += `<tr><th colspan="4" class="l">Verkauf${rounds.length > 1 ? ' · Runde ' + r : ''}</th></tr>` + sl.filter(x => (x.round || 1) === r).map(x => { const st = S.stacks.find(y => y.id === x.stack); n++; on += x.status === 'tour';
      return `<tr><td>${ck('data-ovs', x.id, x.status === 'tour')}</td><td class="l">${esc(st ? resName(st.mat) : '?')}</td><td class="l">${F(x.amount, 2)} SCU · ${esc(st ? st.loc : '?')} → ${esc(x.term)} · ${N(x.amount * (x.price || 0))} aUEC</td><td><button class="k sm x" data-ovsx="${x.id}">×</button></td></tr>`; }).join('');
  } else {
    const cs = S.contracts.filter(c => c.status === 'tour' || c.status === 'offen');
    rows += cs.map(c => { n++; on += c.status === 'tour';
      return `<tr><td>${ck('data-ovc', c.id, c.status === 'tour')}</td><td class="l">${esc(c.giver || 'Contract')}</td><td class="l">${c.lines.map(l => esc(l.ware) + ' ' + F(l.scu, 0) + ' SCU ' + esc(l.from || '?') + ' → ' + esc(l.to || '?')).join(' · ')}${c.reward ? ' · ' + N(c.reward) + ' aUEC' : ''}</td><td></td></tr>`; }).join('');
  }
  const T = curTour(), busy = on || T.stops.length;
  const html = `<details class="win tight e2ov" ${S.ui.tourOv === false ? '' : 'open'}><summary><span class="pill">Übersicht</span> <span class="sub">${n ? `${n} angelegt · ${on} in der Tour` : 'nichts angelegt'}</span></summary>
    ${n ? `<div class="hint" style="margin-top:4px">Haken = fliegt in dieser Tour mit. Ohne Haken bleibt der Eintrag für später gespeichert.</div><table class="ptab">${rows}</table>`
      : `<div class="hint">${kind === 'lager' ? 'Noch keine Umlagerung oder kein Verkauf angelegt (Lager → Umlagerung, oder „Verkauf planen“).' : 'Noch kein Contract angelegt (Logistik → Contracts).'}</div>`}
    ${busy ? '<div class="row2"><div class="grow"></div><button class="k sm x" id="ov-end">Tour beenden</button></div>' : ''}</details>`;
  const bind = el => {
    const ov = $('.e2ov', el); if (ov) ov.ontoggle = () => { S.ui.tourOv = ov.open; save(); };
    const tog = (list, id, a, b) => { const x = list.find(y => y.id === id); if (x) x.status = x.status === a ? b : a; save(); render(); };
    $$('[data-ovm]', el).forEach(c => c.onchange = () => tog(S.moves, c.dataset.ovm, 'tour', 'offen'));
    $$('[data-ovs]', el).forEach(c => c.onchange = () => tog(S.sales, c.dataset.ovs, 'tour', 'offen'));
    $$('[data-ovc]', el).forEach(c => c.onchange = () => tog(S.contracts, c.dataset.ovc, 'tour', 'offen'));
    $$('[data-ovmx]', el).forEach(b => b.onclick = () => { S.moves = S.moves.filter(m => m.id !== b.dataset.ovmx); save(); render(); });
    $$('[data-ovsx]', el).forEach(b => b.onclick = () => { S.sales = S.sales.filter(x => x.id !== b.dataset.ovsx); save(); render(); });
    const e = $('#ov-end', el); if (e) e.onclick = tourEnd;
  };
  return { html, bind };
}
function curTour() {
  const ship = (S.fleet[0] || {}).id || null;
  if (tourKind() === 'ctr') return S.tour || (S.tour = { ship, stops: [] });
  return S.stour || (S.stour = { ship: (S.tour && S.tour.ship) || ship, stops: [] });
}
function tourLines() {
  const out = [];
  if (tourKind() === 'lager') {
    saleClean();
    for (const m of S.moves) if (m.status === 'tour') { const s = S.stacks.find(x => x.id === m.stack); if (s && s.loc && s.loc !== m.to) { const stk = s.unit === 'Stk';   // Stückware (Mineralien zum Mitnehmen) belegt keinen Frachtraum
      out.push({ id: 'mv:' + m.id, src: 'move', ref: m.id, ware: resName(s.mat), scu: stk ? 0 : m.amount, stk: stk ? m.amount : 0, from: s.loc, to: m.to, who: 'Umlagerung', boxes: !stk && m.amount >= s.amount - 1e-6 ? s.boxes : null }); } }
    return out.concat(saleLines());
  }
  for (const c of S.contracts) if (c.status === 'tour') c.lines.forEach(l => { if (l.from && l.to && l.from !== l.to) out.push({ id: c.id + ':' + l.id, src: 'ctr', ref: c.id, ware: l.ware, scu: l.scu, from: l.from, to: l.to, who: c.giver }); });
  return out;
}
// Routenplanung: Stopps mit eigener Lade-/Abladeliste (s.pu / s.dr = Zeilen-IDs) – derselbe Ort darf mehrmals vorkommen (Hin- und Rückfracht A → B → A).
// Strahlsuche über die Reihenfolgen: kürzeste Gesamtstrecke, Frachtraum des Schiffs wird beachtet (voll → erst abladen).
// Ausstattung eines Ortes: zuerst Spieldaten (Sternkarte, data/orte.json), sonst UEX – Ort = Terminal-Name, Station oder Stadt
let PLACES = null;
function placeOf(loc) {
  if (!PLACES || PLACES._u !== U || PLACES._o !== ORTE) {   // neu, wenn UEX oder Ortsdaten neu geladen
    PLACES = { _u: U, _o: ORTE };
    (U.places || []).forEach(p => { if (p.name) PLACES[norm(p.name)] = p; });
    (ORTE.orte || []).forEach(o => { PLACES[norm(o.name)] = { name: o.name, system: o.system, refuel: o.am.includes('service'), repair: o.am.includes('service'), refinery: o.am.includes('refinery'), src: 'spiel' }; });
  }
  const n = norm(loc); if (PLACES[n]) return PLACES[n];
  const t = (U.terminals || []).find(x => norm(x.name) === n);
  if (t) for (const k of ['station', 'city', 'outpost']) if (t[k] && PLACES[norm(t[k])]) return PLACES[norm(t[k])];
  return Object.values(PLACES).find(p => p && p.name && n.includes(norm(p.name)) && norm(p.name).length > 5) || null;
}
const hasFuel = loc => !!(placeOf(loc) || {}).refuel;
const DIST_UNKNOWN = 60;   // Gm für Orte ohne Kartenposition (nur zum Vergleichen der Routen)
function planRoute(lines, start, cap, carry0) {
  const L = Object.fromEntries(lines.map(l => [l.id, l])), dist = (a, b) => a === b ? 0 : (a && b ? (locDist(a, b) ?? DIST_UNKNOWN) : 0);
  const locs = [...new Set(lines.flatMap(l => [l.from, l.to]))], all = locs.concat(start ? [start] : []);
  let avg = 0, n = 0; for (const x of all) for (const y of all) if (x < y) { avg += dist(x, y); n++; } avg = n ? avg / n : 0;
  const room = c => (cap > 0 ? cap : Infinity) - [...c].reduce((a, id) => a + (L[id].scu || 0), 0);
  const visit = (st, loc) => {   // an diesem Ort: erst abladen, dann laden, was passt (große Posten zuerst)
    const carry = new Set(st.carry), todo = new Set(st.todo), dr = [...carry].filter(id => L[id].to === loc), pu = [];
    dr.forEach(id => carry.delete(id));
    let free = room(carry);
    [...todo].filter(id => L[id].from === loc).sort((x, y) => L[y].scu - L[x].scu).forEach(id => {
      if (L[id].scu <= free + 1e-9 || (!carry.size && !pu.length)) { pu.push(id); todo.delete(id); carry.add(id); free -= L[id].scu; }   // passt nie ins Schiff → trotzdem mitnehmen (Warnung „über Kapazität“)
    });
    if (!dr.length && !pu.length) return null;
    return { cur: loc, carry, todo, d: st.d + dist(st.cur, loc), stops: st.stops.concat([{ loc, pu, dr }]) };
  };
  let beam = [{ cur: start, carry: new Set(carry0 || []), todo: new Set(lines.map(l => l.id).filter(id => !(carry0 || []).includes(id))), d: 0, stops: [] }];
  const fin = [], W = 40;
  for (let step = 0; step < 4 * lines.length + 4 && beam.length; step++) {
    const next = [], seen = new Set();
    for (const st of beam) {
      if (!st.todo.size && !st.carry.size) { fin.push(st); continue; }
      const cand = new Set([...st.carry].map(id => L[id].to).concat([...st.todo].map(id => L[id].from)));
      for (const loc of cand) {
        const ns = visit(st, loc); if (!ns) continue;
        const key = loc + '|' + [...ns.todo].sort() + '|' + [...ns.carry].sort(); if (seen.has(key)) continue; seen.add(key);
        ns.score = ns.d + avg * 0.6 * (ns.todo.size + ns.carry.size); next.push(ns);
      }
    }
    beam = next.sort((x, y) => x.score - y.score).slice(0, W);
  }
  const home = (S.settings.home || '').trim(), back = st => home && locInfo(home) && st.stops.length ? dist(st.stops[st.stops.length - 1].loc, home) : 0;
  const best = fin.sort((x, y) => (x.d + back(x)) - (y.d + back(y)))[0];
  return best ? best.stops : lines.length ? planRoute(lines, start, 0, carry0) : [];   // Notfall: ohne Kapazitätsgrenze
}
function tourSync() {
  const T = curTour(), lines = tourLines(), ids = new Set(lines.map(l => l.id)), sig = lines.map(l => l.id + l.from + l.to + l.scu).sort().join('|');
  const ship = S.fleet.find(f => f.id === T.ship), cap = ship ? fleetScu(ship) : 0;
  const old = T.stops.some(s => !s.pu);   // Touren aus der alten Fassung (ein Stopp je Ort) → neu planen
  if (T.sig !== sig || old || T.cap !== cap) {
    const clean = st => ({ ...st, pu: (st.pu || []).filter(id => ids.has(id)), dr: (st.dr || []).filter(id => ids.has(id)) });
    const keep = old ? [] : (T.manual ? T.stops : T.stops.filter(s => s.done)).map(clean);
    const placed = new Set(keep.flatMap(s => s.pu)), dropped = new Set(keep.flatMap(s => s.dr));
    const carry = [...placed].filter(id => !dropped.has(id));
    // Zeilen, die schon geladen sind, aber noch keinen Abladestopp haben, und alle neuen Zeilen planen
    const rest = lines.filter(l => !dropped.has(l.id) && !(placed.has(l.id) && keep.some(s => s.dr.includes(l.id))));
    const home = (S.settings.home || '').trim(), start = keep.length ? keep[keep.length - 1].loc : (home && locInfo(home) ? home : null);
    const plan = planRoute(rest.filter(l => !placed.has(l.id) || carry.includes(l.id)), start, cap, carry.filter(id => rest.some(l => l.id === id)));
    T.stops = keep.filter(s => s.done || s.pu.length || s.dr.length).concat(plan.map(p => ({ id: uid(), loc: p.loc, pu: p.pu, dr: p.dr, done: false })));
    T.sig = sig; T.cap = cap;
  }
  return lines;
}
function tourInfo() {
  const lines = tourSync(), T = curTour();
  T.stops.forEach((s, i) => { s.pu.forEach(id => { const l = lines.find(x => x.id === id); if (l) l.pu = i; }); s.dr.forEach(id => { const l = lines.find(x => x.id === id); if (l) l.dr = i; }); });
  lines.forEach(l => { if (l.pu == null) l.pu = 0; if (l.dr == null) l.dr = T.stops.length - 1; });
  const ship = S.fleet.find(f => f.id === T.ship) || null;
  const home = (S.settings.home || '').trim(), homeOk = home && locInfo(home) && T.stops.length;
  const legs = T.stops.map((s, i) => i ? locDist(T.stops[i - 1].loc, s.loc) : (homeOk && s.loc !== home ? locDist(home, s.loc) : 0));
  // Sprit: voll an der Home-Station; reicht er für den nächsten Abschnitt nicht (mit 10 % Reserve), wird am Stopp davor getankt (bevorzugt an einem Ort mit Tankstelle)
  const tank = ship ? fleetQt(ship) : 0, qd = ship ? fleetQd(ship) : null, fuel = [], refuel = new Set();
  let left = tank;
  if (qd && tank) {
    legs.forEach((d, i) => {
      const need = (d || 0) * qd.fuel;
      if (i > 0 && need * 1.1 > left) {   // zurück bis zum letzten Stopp mit Tankstelle, an dem der Rest noch gereicht hätte
        let j = i - 1; for (let k = i - 1; k >= 0 && k > i - 4; k--) if (hasFuel(T.stops[k].loc)) { j = k; break; }
        refuel.add(j); left = tank; for (let k = j + 1; k < i; k++) left -= (legs[k] || 0) * qd.fuel;
      }
      left -= need; fuel[i] = { need, left, pct: tank ? Math.max(0, left / tank * 100) : 0, short: need > tank };
    });
  }
  const homeBack = homeOk && T.stops[T.stops.length - 1].loc !== home ? locDist(T.stops[T.stops.length - 1].loc, home) : null;
  const after = k => lines.filter(l => l.pu <= k && l.dr > k);   // an Bord nach Stopp k
  const peak = Math.max(0, ...T.stops.map((s, k) => after(k).reduce((a, l) => a + l.scu, 0)));
  return { lines, T, ship, legs, after, peak, cap: ship ? fleetScu(ship) : 0, fuel, refuel, qd, tank, home: homeOk ? home : '', homeBack };
}
let TOUR_HL = { line: null }, TOUR_SCROLL = null;   // gewählte Fracht-Zeile (Liste/Kiste), Scroll-Position der Ablauf-Liste
function renderTour() {
  const el = $('#tour'); if (e2Wait(el)) return;
  const kind = tourKind(), head = `<div class="subkeys">${[['lager', 'Lager · Verkauf & Umlagerung'], ['ctr', 'Contracts']].map(([k, l]) => `<div class="key ${kind === k ? 'on' : ''}" data-tk="${k}">${l}</div>`).join('')}</div>`;
  const ov = tourOverview(kind);
  const bindHead = () => { $$('[data-tk]', el).forEach(b => b.onclick = () => { S.ui.tourKind = b.dataset.tk; save(); render(); }); ov.bind(el); };
  if (kind === 'lager' && (S.ui.saleView === 'plan' || !tourLines().length)) { renderSalePlanner(el, head + ov.html); bindHead(); return; }
  const I = tourInfo(), { T, lines, ship } = I;
  if (S.ui.tourStop == null || S.ui.tourStop >= T.stops.length) S.ui.tourStop = Math.max(0, T.stops.findIndex(s => !s.done));
  const k = S.ui.tourStop, sum = I.legs.reduce((a, d) => a + (d || 0), 0), unknown = T.stops.filter(s => !locInfo(s.loc));
  const reward = [...new Set(lines.filter(l => l.src === 'ctr').map(l => l.ref))].reduce((a, id) => a + ((S.contracts.find(c => c.id === id) || {}).reward || 0), 0);
  const saleSum = kind === 'lager' ? lines.filter(l => l.src === 'sale').reduce((a, l) => a + l.scu * (l.price || 0), 0) : 0;
  let h = head + ov.html + `<div class="win tight"><span class="pill">${kind === 'lager' ? 'Lager-Tour' : 'Contracts-Tour'}</span><span class="sub">${T.stops.length} Stopps · ${F(sum, 1)} Gm Luftlinie · ${N(kind === 'lager' ? saleSum : reward)} aUEC${kind === 'lager' ? saleRoundInfo() : ''}</span>
    <div class="row2"><label class="dim">Schiff</label><select id="tr-ship">${S.fleet.map(f => `<option value="${f.id}" ${f.id === T.ship ? 'selected' : ''}>${esc(fleetName(f))} · ${fleetScu(f)} SCU</option>`).join('') || '<option value="">– erst unter „Schiffe“ anlegen –</option>'}</select>
      <span class="${I.peak > I.cap ? 'bad' : 'green'}">max. ${F(I.peak, 1)} von ${I.cap} SCU an Bord</span>
      ${I.qd ? `<span class="${I.fuel.some(x => x && x.short) ? 'bad' : I.refuel.size ? 'warn' : 'dim'}">⛽ ${I.fuel.some(x => x && x.short) ? 'ein Flug ist länger als die Tank-Reichweite' : I.refuel.size ? I.refuel.size + '× tanken' : 'Sprit reicht'} · Flugzeit ~${fmtFly(I.legs.reduce((a, d) => a + (qtTime(ship, d) || 0), 0) + (I.homeBack != null ? qtTime(ship, I.homeBack) : 0))}</span>` : ''}<div class="grow"></div>
      ${kind === 'lager' ? '<button class="k sm" id="tr-plan">Verkauf planen</button>' : ''}<button class="k sm" id="tr-opt" title="Reihenfolge neu berechnen">Route neu berechnen</button><button class="k sm" onclick="switchTab('lager');S.ui.lagerTab='ansicht';save();render()" title="Bestand und geplante Umlagerungen als Kisten im Freight Elevator">🔲 Lager-Ansicht</button><button class="k sm x" id="tr-end">Tour beenden</button></div>
    ${!lines.length ? '<div class="empty">Keine Fracht eingeplant. Unter „Contracts“ einen Auftrag „in Tour“ setzen.</div>' : ''}
    ${lines.some(l => l.dr < l.pu) ? `<div class="hint bad">Reihenfolge passt nicht: ${[...new Set(lines.filter(l => l.dr < l.pu).map(l => esc(l.ware) + ' (laden ' + (l.pu + 1) + ', abladen ' + (l.dr + 1) + ')'))].join(', ')} – mit ▲▼ umstellen oder „Route neu berechnen“.</div>` : ''}
    ${unknown.length ? `<div class="hint warn">Ohne Kartenposition: ${unknown.map(s => `<a href="#" data-map="${esc(s.loc)}">${esc(s.loc)}</a>`).join(', ')} – anklicken und zuordnen.</div>` : ''}</div>`;
  // Ladeplan vorab durchrechnen (Kisten je Zeile für die Liste)
  const grids = ship ? fleetGrids(ship) : [];
  const states = lines.length && grids.length ? packTour(I, grids, ship.doors || {}) : T.stops.map(() => []);
  const crByLine = {}, seenC = new Set();
  states.flat().forEach(c => { if (seenC.has(c.id)) return; seenC.add(c.id); (crByLine[c.line] = crByLine[c.line] || []).push(c.s); });
  const crTxt = id => { const a = crByLine[id]; if (!a) return ''; const n = {}; a.forEach(x => n[x] = (n[x] || 0) + 1); return Object.keys(n).sort((p, q) => q - p).map(x => n[x] + '×' + x).join(' · '); };
  // Farben: je Ware oder je Abladestopp (Umschalter im Ladeplan)
  const colMode = S.ui.crateCol === 'stop' ? 'stop' : 'ware', wcol = {};
  [...new Set(lines.map(l => l.ware))].forEach((w, i) => wcol[w] = PALETTE[i % PALETTE.length]);
  const stopCol = n => PALETTE[(n - 1) % PALETTE.length];
  const lineCol = l => colMode === 'stop' ? stopCol(l.dr + 1) : wcol[l.ware];
  const hlLine = TOUR_HL.line && lines.some(l => l.id === TOUR_HL.line) ? TOUR_HL.line : null;
  if (lines.length) {
    h += `<div class="e2cols"><div class="win tight e2abl"><span class="pill">Ablauf</span><div class="e2tl">`;
    const lnH = (l, i, ph) => `<div class="e2ln ${hlLine === l.id ? 'hl' : ''}" data-ln="${esc(l.id)}" data-lst="${i}" data-lph="${ph}"><span class="e2chip" style="background:${lineCol(l)}"></span><span class="e2w">${esc(l.ware)}</span><span class="e2k">${crTxt(l.id)}</span><span class="e2t">${l.stk ? F(l.stk, 0) + ' Stk' : F(l.scu, 2) + ' SCU'}</span>
      <div class="e2who">${ph === 'an' ? 'von Stopp ' + (l.pu + 1) : '→ Stopp ' + (l.dr + 1)}${l.who ? ' · ' + esc(l.who) : ''}</div></div>`;
    const flyInfo = i => { const fu = I.fuel[i]; return `${I.qd ? ' · ~' + fmtFly(qtTime(ship, I.legs[i])) : ''}${fu ? ` · <span class="${fu.short ? 'bad' : fu.pct < 25 ? 'warn' : ''}" title="Quantum-Sprit nach diesem Flug (geschätzt)">⛽ ${fu.short ? 'Tank reicht nicht!' : F(fu.pct, 0) + ' %'}</span>` : ''}`; };
    if (I.home && T.stops[0].loc !== I.home) h += `<div class="e2st mini e2home"><span class="e2n">⌂</span><b>${esc(I.home)}</b> <span class="dim">· Start (Home-Station)${I.tank ? ' · Tank voll' : ''}</span></div>
      <div class="e2fly"><span>✈ ${I.legs[0] != null ? F(I.legs[0], 1) + ' Gm' : '? Gm'}${flyInfo(0)}</span><span class="e2bar"><i style="width:0%"></i></span><span>leer</span></div>`;
    T.stops.forEach((s, i) => {
      if (i) {
        const onb = I.after(i - 1).reduce((a, l) => a + l.scu, 0), pct = I.cap ? Math.min(100, onb / I.cap * 100) : 0;
        h += `<div class="e2fly"><span>✈ ${I.legs[i] != null ? F(I.legs[i], 1) + ' Gm' : '? Gm'}${flyInfo(i)}</span><span class="e2bar"><i style="width:${pct}%" class="${onb > I.cap ? 'over' : ''}"></i></span><span>${F(onb, 0)}/${I.cap} SCU an Bord</span></div>`;
      }
      const up = lines.filter(l => l.pu === i), down = lines.filter(l => l.dr === i && l.pu < i);
      const li = locInfo(s.loc);
      if (s.done && i !== k) { h += `<div class="e2st done mini" data-st="${i}"><span class="e2n">${i + 1}</span>✓ <b>${esc(s.loc)}</b> <span class="dim">· erledigt${down.length || up.length ? ' · ' + [down.length ? '−' + F(down.reduce((a, l) => a + l.scu, 0), 0) : '', up.length ? '+' + F(up.reduce((a, l) => a + l.scu, 0), 0) : ''].filter(Boolean).join(' ') + ' SCU' : ''}</span></div>`; return; }
      const sDown = down.reduce((a, l) => a + l.scu, 0), sUp = up.reduce((a, l) => a + l.scu, 0);
      h += `<div class="e2st ${s.done ? 'done' : ''} ${i === k ? 'sel' : ''}" data-st="${i}"><span class="e2n">${i + 1}</span>
        <div class="e2sh"><b>${esc(s.loc)}</b>${hasFuel(s.loc) ? ' <span class="dim" title="Hier kann man tanken (Fahrzeug-Service laut Spieldaten)">⛽</span>' : ''} <span class="dim">${li ? esc(li.body.name) + (li.sys !== 'Stanton' ? ' (' + li.sys + ')' : '') : ''}</span>${I.refuel.has(i) ? '<span class="tag warn" title="Sprit reicht sonst nicht für den nächsten Flug">⛽ hier tanken</span>' : ''}<span class="e2sum">${sDown || sUp ? (sDown ? '−' + F(sDown, 0) : '') + ' ' + (sUp ? '+' + F(sUp, 0) : '') + ' SCU' : ''}</span></div>
        ${down.length ? `<div class="e2sec off"><div class="e2lab">▼ Abladen</div>${down.map(l => lnH(l, i, 'an')).join('')}</div>` : ''}
        ${up.length ? `<div class="e2sec on"><div class="e2lab">▲ Laden</div>${up.map(l => lnH(l, i, 'ab')).join('')}</div>` : ''}
        <div class="row2" style="margin:6px 0 0"><button class="k sm" data-sm="-1" data-i="${i}">▲</button><button class="k sm" data-sm="1" data-i="${i}">▼</button>
        ${s.done ? '<span class="green">✓ erledigt</span>' : `<button class="k sm pri" data-done="${i}">✓ Stopp erledigt</button>`}</div></div>`;
    });
    if (I.homeBack != null) h += `<div class="e2fly"><span>✈ ${F(I.homeBack, 1)} Gm${I.qd ? ' · ~' + fmtFly(qtTime(ship, I.homeBack)) : ''}</span></div><div class="e2st mini e2home"><span class="e2n">⌂</span><b>${esc(I.home)}</b> <span class="dim">· zurück zur Home-Station</span></div>`;
    h += `</div></div><div>
      <div class="win tight"><span class="pill">Ladeplan · Stopp ${k + 1}</span><span class="sub" id="tr-lsub"></span>
        <div class="row2"><button class="k sm" data-ph="an">Ankunft</button><button class="k sm" data-ph="ab">Abflug</button><span style="width:10px"></span><button class="k sm" id="tr-rl">⟲</button><button class="k sm" id="tr-rr">⟳</button><span class="dim">Ebenen</span><input type="range" id="tr-lay" min="1" max="8" value="${S.ui.tourLayer || 8}" style="width:110px"><span style="width:10px"></span><span class="dim">Farbe</span><button class="k sm" data-cm="ware">Ware</button><button class="k sm" data-cm="stop">Stopp</button></div>
        <div class="e2grids" id="tr-grids"></div><div id="tr-miss"></div><div class="e2leg" id="tr-leg"></div>
        <div class="hint">Große Zahl = Kistengröße (SCU) · Schild = Stopp zum Abladen · Kiste oder Zeile antippen = hervorheben</div></div>
      <div class="win tight"><span class="pill">Karte</span><span class="sub" id="tr-sys"></span>
        <div class="row2"><span id="tr-sysb"></span><div class="grow"></div><button class="k sm" id="mz-in">+</button><button class="k sm" id="mz-out">−</button><button class="k sm" id="mz-fit">Alles</button></div>
        <svg id="tr-map" class="e2map"></svg><div class="hint">Ziehen = verschieben · Mausrad = Zoom · Planet antippen = Lupe mit Monden</div><svg id="tr-lupe" class="e2lupe"></svg></div>
    </div></div>`;
  }
  el.innerHTML = h; bindHead();
  const pl = $('#tr-plan', el); if (pl) pl.onclick = () => { S.ui.saleView = 'plan'; render(); };
  const sel = $('#tr-ship', el); if (sel) sel.onchange = () => { T.ship = sel.value; save(); render(); };
  $('#tr-opt', el).onclick = () => { T.manual = false; T.sig = null; save(); render(); };
  $('#tr-end', el).onclick = tourEnd;
  $$('[data-map]', el).forEach(a => a.onclick = e => { e.preventDefault(); mapLocDialog(a.dataset.map); });
  if (!lines.length) return;
  $$('[data-st]', el).forEach(d => d.onclick = e => { if (e.target.closest('button') || e.target.closest('[data-ln]')) return; S.ui.tourStop = +d.dataset.st; S.ui.tourPhase = null; TOUR_HL.line = null; render(); });
  $$('[data-ln]', el).forEach(d => d.onclick = () => {
    const i = +d.dataset.lst, same = TOUR_HL.line === d.dataset.ln && S.ui.tourStop === i && S.ui.tourPhase === d.dataset.lph;
    TOUR_HL.line = same ? null : d.dataset.ln; S.ui.tourStop = i; S.ui.tourPhase = d.dataset.lph; render();
  });
  // Liste behält ihre Scroll-Position; gewählte Zeile bzw. Stopp sichtbar halten
  const tl = $('.e2tl', el);
  if (tl) {
    if (TOUR_SCROLL != null) tl.scrollTop = TOUR_SCROLL;
    tl.onscroll = () => { TOUR_SCROLL = tl.scrollTop; };
    const tgt = $('.e2st.sel .e2ln.hl', el) || $('.e2ln.hl', el) || $('.e2st.sel', el);
    if (tgt) { const r = tgt.getBoundingClientRect(), R = tl.getBoundingClientRect(); if (r.top < R.top || r.bottom > R.bottom) { tl.scrollTop += r.top - R.top - 20; TOUR_SCROLL = tl.scrollTop; } }
  }
  $$('[data-sm]', el).forEach(b => b.onclick = () => { const i = +b.dataset.i, j = i + +b.dataset.sm; if (j < 0 || j >= T.stops.length) return; [T.stops[i], T.stops[j]] = [T.stops[j], T.stops[i]]; T.manual = true; save(); render(); });
  $$('[data-done]', el).forEach(b => b.onclick = () => stopDone(+b.dataset.done));
  // Ladeplan
  const hasDown = lines.some(l => l.dr === k && l.pu < k);
  const phase = S.ui.tourPhase || (hasDown ? 'an' : 'ab');
  const packed = phase === 'an' ? (k ? states[k - 1] : []) : states[k];
  $$('[data-ph]', el).forEach(b => { b.classList.toggle('pri', b.dataset.ph === phase); b.onclick = () => { S.ui.tourPhase = b.dataset.ph; render(); }; });
  $$('[data-cm]', el).forEach(b => { b.classList.toggle('pri', b.dataset.cm === colMode); b.onclick = () => { S.ui.crateCol = b.dataset.cm; save(); render(); }; });
  // Hervorheben: gewählte Zeile, sonst Ankunft = hier abladen, Abflug = hier geladen
  const isHl = hlLine ? (b => b.line === hlLine) : (phase === 'an' ? (b => b.bis === k + 1) : (b => b.von === k));
  const crateCol = b => colMode === 'stop' ? stopCol(b.bis) : (wcol[b.ware] || wareCol(b.ware));
  const onPick = b => { TOUR_HL.line = b && TOUR_HL.line !== b.line ? b.line : null; render(); };
  const onWares = [...new Set(packed.map(p => colMode === 'stop' ? p.bis : p.ware))];
  $('#tr-leg', el).innerHTML = onWares.map(v => colMode === 'stop'
    ? `<span><i class="e2chip" style="background:${stopCol(v)}"></i>Stopp ${v} · ${esc((T.stops[v - 1] || {}).loc || '')}</span>`
    : `<span><i class="e2chip" style="background:${wcol[v] || wareCol(v)}"></i>${esc(v)}</span>`).join('');
  const onScu = packed.filter(p => p.gi >= 0).reduce((a, p) => a + p.s, 0);
  $('#tr-lsub', el).textContent = (phase === 'an' ? 'Ankunft · markiert = hier abladen' : 'Abflug · nach dem Laden') + ' · ' + onScu + ' SCU in Kisten';
  const lay = $('#tr-lay', el); lay.max = Math.max(1, ...grids.map(g => g.z)); lay.oninput = () => { S.ui.tourLayer = +lay.value; drawTourGrids(); };
  const drawTourGrids = () => {
    const w = $('#tr-grids', el); w.innerHTML = '';
    grids.forEach((g, gi) => {
      const c = document.createElement('div'); c.className = 'e2gcard';
      c.innerHTML = `<div class="e2gh">${esc(gridLabel(g, gi, ship))} · ${g.x * g.y * g.z} SCU</div>`;
      const cv = document.createElement('canvas'); c.appendChild(cv); w.appendChild(c);
      // Aura nur bei bewusst gewählter Ware (Zeile in der Liste oder Kiste angeklickt) – sonst nur abdunkeln
      drawIso(cv, g, packed.filter(p => p.gi === gi), { door: ship.doors?.[gi] ?? 0, rot: S.ui.tourRot || 0, layer: +lay.value, isHl, col: crateCol, onPick,
        auraOf: b => hlLine && b.line === hlLine ? '#2fbf55' : null });
    });
    if (!grids.length) w.innerHTML = '<div class="empty">Kein Schiff mit Cargo-Grid gewählt.</div>';
    const miss = packed.filter(p => p.gi < 0);
    $('#tr-miss', el).innerHTML = miss.length ? `<div class="hint bad">Passt nicht (ohne Umladen): ${F(miss.reduce((a, p) => a + p.s, 0), 0)} SCU (${[...new Set(miss.map(p => p.ware))].map(esc).join(', ')})</div>` : '';
  };
  $('#tr-rl', el).onclick = () => { S.ui.tourRot = (S.ui.tourRot || 0) - 1; drawTourGrids(); };
  $('#tr-rr', el).onclick = () => { S.ui.tourRot = (S.ui.tourRot || 0) + 1; drawTourGrids(); };
  drawTourGrids();
  // Karte
  const route = T.stops.map((s, i) => ({ n: i + 1, li: locInfo(s.loc), done: s.done })).filter(r => r.li);
  const systems = [...new Set(route.map(r => r.li.sys))];
  const cur = (T.stops[k] && locInfo(T.stops[k].loc)) || route[0]?.li;
  const sys = S.ui.tourSys && E2.karte.systems[S.ui.tourSys] ? S.ui.tourSys : (cur ? cur.sys : 'Stanton');
  $('#tr-sysb', el).innerHTML = Object.keys(E2.karte.systems).map(s => `<button class="k sm ${s === sys ? 'pri' : ''}" data-sys="${s}">${s}${systems.includes(s) ? ' •' : ''}</button>`).join(' ');
  $$('[data-sys]', el).forEach(b => b.onclick = () => { S.ui.tourSys = b.dataset.sys; render(); });
  const map = sysMap($('#tr-map', el), sys, route.filter(r => r.li.sys === sys), $('#tr-lupe', el));
  $('#mz-in', el).onclick = () => map.zoom(1 / 1.4); $('#mz-out', el).onclick = () => map.zoom(1.4); $('#mz-fit', el).onclick = () => map.fit();
  $('#tr-sys', el).textContent = sys + ' · maßstabsgetreu (Spieldaten)';
}
// Stopp abhaken: Umlagerungen im Lager buchen, Contracts bei kompletter Lieferung abschließen
function stopDone(i) {
  const I = tourInfo(), s = I.T.stops[i];
  for (const l of I.lines.filter(l => l.dr === i && l.src === 'move')) {
    const m = S.moves.find(x => x.id === l.ref), st = m && S.stacks.find(x => x.id === m.stack); if (!st) continue;
    if (m.amount >= st.amount - 1e-6) st.loc = m.to;
    else { st.amount = Math.round((st.amount - m.amount) * 1e6) / 1e6; st.boxes = {}; S.stacks.push({ ...st, id: uid(), amount: m.amount, loc: m.to, boxes: {} }); }
    m.status = 'erledigt'; m.doneTs = now();
    hist(`Umgelagert: ${F(m.amount, 2)} SCU ${resName(st.mat)} → ${m.to}`);
  }
  for (const l of I.lines.filter(l => l.dr === i && l.src === 'sale')) saleDone(l);
  s.done = true;
  const delivered = id => I.lines.some(l => l.id === id && I.T.stops[l.dr] && I.T.stops[l.dr].done);   // Contract fertig, wenn jede Zeile an ihrem Abladestopp abgehakt ist
  if (tourKind() === 'ctr') for (const c of S.contracts.filter(c => c.status === 'tour')) if (c.lines.filter(l => l.from && l.to && l.from !== l.to).every(l => delivered(c.id + ':' + l.id))) {
    c.status = 'erledigt'; c.doneTs = now(); hist(`Contract erledigt: ${c.giver || ''}${c.reward ? ' · +' + N(c.reward) + ' aUEC' : ''}`);
  }
  S.ui.tourStop = Math.min(i + 1, I.T.stops.length - 1);
  setComm(`STOPP ${i + 1} ERLEDIGT · ${s.loc.toUpperCase()}`);
  if (tourKind() === 'lager') saleRoundCheck();
  save(); render();
}
async function tourEnd() {
  const lager = tourKind() === 'lager';
  if (!await ask(lager ? 'Lager-Tour beenden? Noch nicht erledigte Verkäufe werden verworfen (die Ware bleibt im Lager), Umlagerungen gehen zurück auf „offen“.'
    : 'Contracts-Tour beenden? Noch nicht erledigte Contracts gehen zurück auf „offen“.', 'Beenden', true)) return;
  if (lager) { S.moves.forEach(m => { if (m.status === 'tour') m.status = 'offen'; }); S.sales = S.sales.filter(x => x.status === 'erledigt'); }
  else S.contracts.forEach(c => { if (c.status === 'tour') c.status = 'offen'; });
  const T = curTour(); T.stops = []; T.sig = null; T.manual = false; S.ui.tourStop = 0;
  hist('Tour beendet'); save(); render();
}
function mapLocDialog(loc) {
  const opts = allBodies().filter(b => b.kind !== 'star').sort((a, b) => a.sys.localeCompare(b.sys) || a.name.localeCompare(b.name));
  openModal(`<h3>Wo liegt „${esc(loc)}“?</h3><div class="hint" style="margin-top:0">Planet, Mond, L-Punkt oder Sprungpunkt wählen – Pliskin merkt sich das.</div>
    <select id="lm-b" style="width:100%">${opts.map(b => `<option value="${esc(b.sys + '|' + b.name)}">${esc(b.sys)} · ${esc(b.name)}</option>`).join('')}</select>
    <div class="foot"><button class="k" id="lm-x">Abbrechen</button><button class="k pri" id="lm-go">Speichern</button></div>`, box => {
    $('#lm-x', box).onclick = closeModal;
    $('#lm-go', box).onclick = () => { const [sys, body] = $('#lm-b', box).value.split('|'); S.locMap[loc] = { sys, body }; [S.tour, S.stour].forEach(t => t && (t.sig = null)); closeModal(); save(); render(); };
  });
}

/* ------------------------------------------------------------------ */
/* Packen: Kisten ins Grid legen                                        */
/* ------------------------------------------------------------------ */
const perms3 = d => [[d[0], d[1], d[2]], [d[1], d[0], d[2]], [d[0], d[2], d[1]], [d[2], d[0], d[1]], [d[1], d[2], d[0]], [d[2], d[1], d[0]]];
const newGrids = grids => grids.map(g => ({ ...g, occ: new Int16Array(g.x * g.y * g.z).fill(-1) }));
const crateSizes = grids => [32, 24, 16, 8, 4, 2, 1].filter(s => grids.some(g => fitsGrid(BOXG[s], g)));
// Fracht-Zeile -> Kisten (vorhandene Kisten aus dem Lager, sonst größte passende; Bruchteile belegen eine ganze Kiste)
function cratesOf(l, bis, sizes, von) {
  const out = [];
  if (l.boxes && Object.keys(l.boxes).length) { for (const [s, n] of Object.entries(l.boxes)) for (let i = 0; i < n; i++) out.push({ ware: l.ware, s: Math.max(1, Math.ceil(+s)), bis, von, line: l.id }); return out; }
  let rest = Math.ceil(l.scu - 1e-6);
  for (const s of sizes) while (rest >= s) { out.push({ ware: l.ware, s, bis, von, line: l.id }); rest -= s; }
  if (rest > 0) out.push({ ware: l.ware, s: 1, bis, von, line: l.id });
  return out;
}
// Kisten ins (teils belegte) Grid legen: zuletzt-raus nach hinten, zuerst-raus an die Tür; passt nichts, wird geteilt.
// Stapeln nur auf Kisten, die gleichzeitig oder später raus müssen – so muss nie umgeladen werden und nichts schwebt.
let CRATE_ID = 0;
function placeCrates(G, items, doors, minB, maxB) {
  items = items.slice().sort((a, b) => b.s - a.s || b.bis - a.bis);
  const out = [];
  while (items.length) {
    const it = items.shift();
    const want = maxB > minB ? 1 - (it.bis - minB) / (maxB - minB) : .5;
    let best = null;
    G.forEach((g, gi) => {
      const idx = (x, y, z) => (z * g.y + y) * g.x + x, door = doors[gi] ?? 0;
      for (const [w, l, h] of perms3(BOXG[it.s] || [1, 1, 1]).filter(d => fitsMaxDim(d, g.max)))
        for (let z = 0; z + h <= g.z; z++) for (let y = 0; y + l <= g.y; y++) for (let x = 0; x + w <= g.x; x++) {
          let ok = true;
          for (let a = 0; a < w && ok; a++) for (let b = 0; b < l && ok; b++) for (let c = 0; c < h && ok; c++) if (g.occ[idx(x + a, y + b, z + c)] >= 0) ok = false;
          if (ok && z > 0) for (let a = 0; a < w && ok; a++) for (let b = 0; b < l && ok; b++) { const u = g.occ[idx(x + a, y + b, z - 1)]; if (u < 0 || (G.bisOf[u] ?? 0) < it.bis) ok = false; }
          if (!ok) continue;
          const atDoor = [(y + l / 2) / g.y, (x + w / 2) / g.x, 1 - (y + l / 2) / g.y, 1 - (x + w / 2) / g.x][door];
          const sc = z * 3 + Math.abs(atDoor - want) * 10 + gi * 4 + (x + y) * .001;
          if (!best || sc < best.sc) best = { sc, gi, x, y, z, w, l, h };
        }
    });
    if (best) {
      const g = G[best.gi], idx = (x, y, z) => (z * g.y + y) * g.x + x, id = ++CRATE_ID;
      for (let a = 0; a < best.w; a++) for (let b = 0; b < best.l; b++) for (let c = 0; c < best.h; c++) g.occ[idx(best.x + a, best.y + b, best.z + c)] = id;
      G.bisOf[id] = it.bis;
      out.push({ id, ...best, ...it });
    } else if (SPLIT[it.s]) { SPLIT[it.s].forEach(s => items.push({ ...it, s })); items.sort((a, b) => b.s - a.s || b.bis - a.bis); }
    else out.push({ id: ++CRATE_ID, gi: -1, ...it });
  }
  return out;
}
const removeCrate = (G, c) => { if (c.gi < 0) return; const g = G[c.gi]; for (let i = 0; i < g.occ.length; i++) if (g.occ[i] === c.id) g.occ[i] = -1; };
// Ganze Tour durchspielen: Kisten bleiben liegen, an jedem Stopp raus/rein. states[k] = an Bord beim Abflug von Stopp k
function packTour(I, grids, doors) {
  CRATE_ID = 0;   // Kisten-Nummern passen in Int16Array, also pro Durchlauf neu zählen
  const G = newGrids(grids), sizes = crateSizes(grids), states = [];
  G.bisOf = {};
  const bs = I.lines.map(l => l.dr + 1), minB = Math.min(...bs), maxB = Math.max(...bs);
  let on = [];
  I.T.stops.forEach((st, i) => {
    on.filter(c => c.bis === i + 1).forEach(c => removeCrate(G, c));
    on = on.filter(c => c.bis !== i + 1);
    const items = I.lines.filter(l => l.pu === i && l.dr > i).filter(l => l.scu > 0).flatMap(l => cratesOf(l, l.dr + 1, sizes, i));
    on = on.concat(placeCrates(G, items, doors, minB, maxB));
    states.push(on.slice());
  });
  return states;
}

/* ------------------------------------------------------------------ */
/* Isometrische 3D-Ansicht eines Grids                                  */
/* ------------------------------------------------------------------ */
const shadeHex = (hex, f) => { const n = parseInt(hex.slice(1), 16); return `rgb(${[n >> 16, n >> 8 & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * f))))})`; };
/* Echte SCU-Kisten (gerendert aus den Spieldaten, data/modelle/kiste_<key>_x|z.webp): Bild je Ware + Größe */
const KIMG = {};
function kisteBild(ware, size, lang) {
  if (!KISTEN || !KISTEN.res || S.settings.kistenBilder === false) return null;
  const r = kstRes(ware) || kstRes('uex:' + ware);
  let key = r && r.kisten && r.kisten[String(size)];
  if (!key) {   // Ware ohne eigene Kiste (z. B. Contract-Ware): die häufigste Kiste dieser Größe
    KISTEN._std = KISTEN._std || {};
    if (!(size in KISTEN._std)) { const c = {}; for (const v of Object.values(KISTEN.res)) { const k = v.kisten && v.kisten[String(size)]; if (k) c[k] = (c[k] || 0) + 1; } KISTEN._std[size] = Object.keys(c).sort((a, b) => c[b] - c[a])[0] || null; }
    key = KISTEN._std[size];
  }
  if (!key) return null;
  const url = `data/modelle/kiste_${key}_${lang}.webp`;
  let im = KIMG[url];
  if (!im) { im = KIMG[url] = new Image(); im.src = url; im.onload = () => { (KIMG._warte || []).forEach(f => f()); KIMG._warte = []; }; }
  return im.complete && im.naturalWidth ? { im, wh: (KISTEN.groesse && KISTEN.groesse[key]) || im.naturalWidth } : (KIMG._warte = KIMG._warte || [], null);
}
// Material-Symbol (Stein) für Aufdrucke auf den Kisten
function symBild(mat) {
  const r = kstRes(mat) || kstRes('uex:' + mat); if (!r || !r.symbol) return null;
  const url = 'data/' + r.symbol; let im = KIMG[url];
  if (!im) { im = KIMG[url] = new Image(); im.src = url; im.onload = () => { (KIMG._warte || []).forEach(f => f()); KIMG._warte = []; }; }
  return im.complete && im.naturalWidth ? im : null;
}
function drawIso(cv, g, boxes, o = {}) {
  if (!g) return;
  const R = (((o.rot || 0) % 4) + 4) % 4, W = R % 2 ? g.y : g.x, L = R % 2 ? g.x : g.y, maxLayer = o.layer || g.z;
  const rot = (x, y) => [[x, y], [g.y - 1 - y, x], [g.x - 1 - x, g.y - 1 - y], [y, g.x - 1 - x]][R];
  const rc = (x, y) => [[x, y], [g.y - y, x], [g.x - x, g.y - y], [y, g.x - x]][R];
  const bilder = !!(KISTEN && KISTEN.res && S.settings.kistenBilder !== false && boxes.length);
  const s = Math.max(9, Math.min(30, 280 / Math.max(g.x + g.y, 6))) * (o.zoom || 1), cx = s * .866, cy = s * .5, hz = bilder ? s : s * .82;   // mit Kistenbildern echte Iso-Höhe
  const ox = L * cx + 30, oy = g.z * hz + 28;
  const P = (x, y, z) => [(x - y) * cx, (x + y) * cy - z * hz];
  const width = (W + L) * cx + 60, height = (W + L) * cy + g.z * hz + 56, dpr = window.devicePixelRatio || 1;
  cv.width = width * dpr; cv.height = height * dpr; cv.style.width = width + 'px'; cv.style.height = height + 'px';
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
  const cell = new Map(), key = (x, y, z) => x + ',' + y + ',' + z;
  for (const b of boxes) for (let a = 0; a < b.w; a++) for (let d = 0; d < b.l; d++) for (let e = 0; e < b.h; e++) {
    if (bilder ? b.z >= maxLayer : b.z + e >= maxLayer) continue;   // mit Kistenbildern: ganze Kisten ab der Ebene ausblenden statt anschneiden
    const [rx, ry] = rot(b.x + a, b.y + d); cell.set(key(rx, ry, b.z + e), b);
  }
  const poly = (pts, fill, stroke) => { c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.stroke(); } };
  c.lineWidth = 1;
  for (let x = 0; x < W; x++) for (let y = 0; y < L; y++) poly([P(x, y, 0), P(x + 1, y, 0), P(x + 1, y + 1, 0), P(x, y + 1, 0)], 'rgba(63,212,105,.05)', 'rgba(63,212,105,.18)');
  c.setLineDash([3, 3]); c.strokeStyle = 'rgba(63,212,105,.35)';
  for (const [x, y] of [[0, 0], [W, 0], [0, L]]) { c.beginPath(); c.moveTo(...P(x, y, 0)); c.lineTo(...P(x, y, g.z)); c.stroke(); }
  poly([P(0, 0, g.z), P(W, 0, g.z), P(W, L, g.z), P(0, L, g.z)], null, 'rgba(63,212,105,.35)'); c.setLineDash([]);
  // Tür: Kante im Original-Grid je nach Einstellung (0 vorne = y max, 1 rechts = x max, 2 hinten = y 0, 3 links = x 0)
  const de = [[[0, g.y], [g.x, g.y]], [[g.x, 0], [g.x, g.y]], [[0, 0], [g.x, 0]], [[0, 0], [0, g.y]]][o.door || 0];
  const d1 = P(...rc(...de[0]), 0), d2 = P(...rc(...de[1]), 0), mid = [(d1[0] + d2[0]) / 2, (d1[1] + d2[1]) / 2], cen = P(W / 2, L / 2, 0);
  if (o.tuer !== false) { c.strokeStyle = '#f0b050'; c.lineWidth = 4; c.beginPath(); c.moveTo(...d1); c.lineTo(...d2); c.stroke(); } c.lineWidth = 1;
  const cells = [...cell.entries()].map(([k, b]) => [...k.split(',').map(Number), b]).sort((p, q) => (p[0] + p[1] + p[2]) - (q[0] + q[1] + q[2]) || p[2] - q[2]);
  const same = (x, y, z, b) => cell.get(key(x, y, z)) === b, hit = [];
  // Hervorheben: o.isHl(b) (Ware/Zeile gewählt) oder alt o.hl = Abladestopp; der Rest wird grau
  const H = o.isHl || (o.hl ? (b => b.bis === o.hl) : null), anyH = !!H && boxes.some(H), dimB = b => anyH && !H(b);
  const edge = (a, d) => { c.beginPath(); c.moveTo(...a); c.lineTo(...d); c.stroke(); };
  // Bild-Kisten: je Kiste Mitte + Lage (lange Seite entlang x oder y) im gedrehten Grid
  const bild = new Map();
  if (bilder) for (const b of boxes) {
    const cs = cells.filter(t => t[3] === b); if (!cs.length || cs.length < b.w * b.l * b.h) continue;   // angeschnitten (Ebenen-Regler) → Farbblock
    const xs = cs.map(t => t[0]), ys = cs.map(t => t[1]), zs = cs.map(t => t[2]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs) + 1, y0 = Math.min(...ys), y1 = Math.max(...ys) + 1, z0 = Math.min(...zs), z1 = Math.max(...zs) + 1;
    const kb = kisteBild(b.mat || b.ware, b.s, (x1 - x0) >= (y1 - y0) ? 'x' : 'z');
    if (kb) bild.set(b, { ...kb, c: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], r: [x0, x1, y0, y1, z0, z1], tiefe: x1 + y1 + z0 * .01 });
  }
  if (bilder && boxes.some(b => !bild.has(b)) && KIMG._warte) KIMG._warte.push(() => drawIso(cv, g, boxes, o));   // Bilder laden noch → gleich neu zeichnen
  for (const [x, y, z, b] of cells) {
    if (bild.has(b)) {   // nur Trefferflächen (Hover/Antippen), gemalt wird unten das Bild
      const top = [P(x, y, z + 1), P(x + 1, y, z + 1), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)];
      const fx = [P(x + 1, y, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x + 1, y, z + 1)];
      const fy = [P(x, y + 1, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)];
      if (!same(x, y, z + 1, b)) hit.push([top, b]); if (!same(x + 1, y, z, b)) hit.push([fx, b]); if (!same(x, y + 1, z, b)) hit.push([fy, b]);
      continue;
    }
    const col = dimB(b) ? '#55606c' : (o.col ? o.col(b) : wareCol(b.ware));
    c.globalAlpha = o.alphaOf ? o.alphaOf(b) : (dimB(b) ? .42 : 1);
    const top = [P(x, y, z + 1), P(x + 1, y, z + 1), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)];
    const fx = [P(x + 1, y, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x + 1, y, z + 1)];
    const fy = [P(x, y + 1, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)];
    if (!same(x, y, z + 1, b)) { poly(top, shadeHex(col, 1.08)); hit.push([top, b]); }
    if (!same(x + 1, y, z, b)) { poly(fx, shadeHex(col, .72)); hit.push([fx, b]); }
    if (!same(x, y + 1, z, b)) { poly(fy, shadeHex(col, .55)); hit.push([fy, b]); }
    c.strokeStyle = '#000'; c.lineWidth = 2;
    if (!same(x, y, z + 1, b)) { if (!same(x, y - 1, z, b) || same(x, y - 1, z + 1, b)) edge(top[0], top[1]); if (!same(x - 1, y, z, b) || same(x - 1, y, z + 1, b)) edge(top[0], top[3]); edge(top[1], top[2]); edge(top[3], top[2]); }
    if (!same(x + 1, y, z, b)) { if (!same(x + 1, y, z - 1, b)) edge(fx[0], fx[1]); if (!same(x, y - 1, z, b)) edge(fx[0], fx[3]); }
    if (!same(x, y + 1, z, b)) { if (!same(x, y + 1, z - 1, b)) edge(fy[0], fy[1]); if (!same(x - 1, y, z, b)) edge(fy[0], fy[3]); }
    if (anyH && H(b)) {   // gewählte Kisten: weißer Rand
      c.strokeStyle = '#fff'; c.lineWidth = 2.2;
      if (!same(x, y, z + 1, b)) { if (!same(x, y - 1, z, b)) edge(top[0], top[1]); if (!same(x - 1, y, z, b)) edge(top[0], top[3]); if (!same(x + 1, y, z, b)) edge(top[1], top[2]); if (!same(x, y + 1, z, b)) edge(top[3], top[2]); }
      if (!same(x + 1, y, z, b) && !same(x + 1, y, z - 1, b)) edge(fx[0], fx[1]);
      if (!same(x, y + 1, z, b) && !same(x, y + 1, z - 1, b)) edge(fy[0], fy[1]);
      if (!same(x + 1, y, z, b) && !same(x, y + 1, z, b)) edge(fx[1], fx[2]);
      if (!same(x + 1, y, z, b) && !same(x, y - 1, z, b)) edge(fx[0], fx[3]);
      if (!same(x, y + 1, z, b) && !same(x - 1, y, z, b)) edge(fy[0], fy[3]);
    }
  }
  c.globalAlpha = 1;
  if (bild.size) {
    const f = cx / (1.25 * Math.SQRT1_2 * (KISTEN.ppm || 48));   // Bild-Pixel → Grid-Pixel (1 Feld = 1,25 m)
    for (const [b, k] of [...bild.entries()].sort((a, d) => a[1].tiefe - d[1].tiefe)) {
      const [px, py] = P(...k.c), sz = k.wh * f;
      c.save();
      // Aura: o.auraOf(b) = Farbe je Kiste (z. B. Umlagerung), sonst gewählte Kisten; o.alphaOf(b) = Durchsichtigkeit (z. B. „kommt von“)
      const aura = o.auraOf ? o.auraOf(b) : (anyH && H(b) && !dimB(b) ? (o.aura || '#7fe6ff') : null);
      if (dimB(b)) { c.globalAlpha = .38; c.filter = 'grayscale(1) brightness(.7)'; }
      if (o.alphaOf) c.globalAlpha = o.alphaOf(b);
      if (aura) { c.shadowColor = aura; c.shadowBlur = Math.max(10, s * .9); }
      c.drawImage(k.im, px - sz / 2, py - sz / 2, sz, sz);
      if (aura) { c.shadowBlur = Math.max(6, s * .5); c.drawImage(k.im, px - sz / 2, py - sz / 2, sz, sz); }
      c.shadowBlur = 0;
      // Symbol des Materials als Aufdruck: oben auf dem Deckel und auf den beiden sichtbaren Seiten
      const sy = o.symbole === false ? null : symBild(b.mat || b.ware);
      if (sy) {
        const [mx, my, mz] = k.c, [x0, x1, y0, y1, z0, z1] = k.r, kf = b.s < 1 ? .45 : 1;
        const face = (cxp, cyp, ax, ay, bx, by, d) => { c.save(); c.globalAlpha *= .92; c.transform(ax * d, ay * d, bx * d, by * d, cxp, cyp); c.drawImage(sy, -.5, -.5, 1, 1); c.restore(); };
        const T = P(mx, my, z1), dT = Math.min(x1 - x0, y1 - y0) * .55 * kf;
        face(T[0], T[1], cx, cy, -cx, cy, dT);
        const X = P(x1, my, mz), dX = Math.min(y1 - y0, z1 - z0) * .5 * kf;
        face(X[0], X[1], cx, -cy, 0, hz, dX);
        const Y = P(mx, y1, mz), dY = Math.min(x1 - x0, z1 - z0) * .5 * kf;
        face(Y[0], Y[1], cx, cy, 0, hz, dY);
      }
      c.restore();
    }
  }
  // Beschriftung: Kistengröße groß oben drauf, Abladestopp als Schild an der Seite (bei kleinen Kisten)
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const b of boxes) {
    const tops = cells.filter(([x, y, z, bb]) => bb === b && !same(x, y, z + 1, b)); if (!tops.length) continue;
    const zt = Math.max(...tops.map(t => t[2])), tt = tops.filter(t => t[2] === zt);
    const mx = tt.reduce((a, t) => a + t[0] + .5, 0) / tt.length, my = tt.reduce((a, t) => a + t[1] + .5, 0) / tt.length, big = tt.length >= 2, dim = dimB(b);
    const p = P(mx, my, zt + 1);
    if (!bild.has(b)) { c.font = `800 ${Math.round(s * (big ? .66 : .5))}px Consolas,monospace`; c.fillStyle = dim ? 'rgba(255,255,255,.4)' : 'rgba(0,0,0,.85)'; c.fillText(b.s, p[0], p[1] + 1); }
    if (o.badge === false || b.bis == null) continue;
    // Schild: vorne-unten an der sichtbaren Seite, sonst an der Ecke oben
    const front = cells.filter(([x, y, z, bb]) => bb === b && !cell.has(key(x, y + 1, z)));
    const right = cells.filter(([x, y, z, bb]) => bb === b && !cell.has(key(x + 1, y, z)));
    let q;
    if (front.length) { const f = front.reduce((a, t) => a[0] + a[1] > t[0] + t[1] || (a[0] + a[1] === t[0] + t[1] && a[2] < t[2]) ? a : t); q = P(f[0] + .5, f[1] + 1, f[2] + .5); }
    else if (right.length) { const f = right.reduce((a, t) => a[2] < t[2] ? a : t); q = P(f[0] + 1, f[1] + .5, f[2] + .5); }
    else continue;
    const r = Math.max(6, s * .3);
    c.globalAlpha = dim ? .5 : 1; c.fillStyle = '#000'; c.beginPath(); c.arc(q[0], q[1], r, 0, 7); c.fill();
    c.strokeStyle = '#f0b050'; c.lineWidth = 1.2; c.stroke();
    c.fillStyle = '#f0b050'; c.font = `800 ${Math.round(r * 1.25)}px Consolas,monospace`; c.fillText(b.bis, q[0], q[1] + 1); c.globalAlpha = 1;
  }
  const off = Math.hypot(mid[0] - cen[0], mid[1] - cen[1]) || 1;
  if (o.tuer !== false) c.fillStyle = '#f0b050', c.font = '700 12px Consolas,monospace', c.fillText('▲ TÜR', mid[0] + (mid[0] - cen[0]) / off * 22, mid[1] + (mid[1] - cen[1]) / off * 22 + 6);
  const tip = $('#e2tip') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'e2tip' }));
  const pick = e => {
    const r = cv.getBoundingClientRect(), mx = (e.clientX - r.left) * dpr, my = (e.clientY - r.top) * dpr;
    for (let i = hit.length - 1; i >= 0; i--) {
      c.beginPath(); hit[i][0].forEach(([x, y], j) => j ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath();
      c.save(); c.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr); const inside = c.isPointInPath(mx, my); c.restore();
      if (inside) return hit[i][1];
    }
    return null;
  };
  cv.onmousemove = e => {
    const b = pick(e);
    if (b) { tip.innerHTML = o.tip ? o.tip(b) : `<b>${esc(b.ware)}</b><br>Kiste ${b.s} SCU (${b.w}×${b.l}×${b.h})${b.von != null ? '<br>geladen an Stopp ' + (b.von + 1) : ''}<br>abladen an Stopp ${b.bis}`; tip.style.cssText = `display:block;left:${e.clientX + 14}px;top:${e.clientY + 10}px`; cv.style.cursor = o.onPick ? 'pointer' : ''; return; }
    tip.style.display = 'none'; cv.style.cursor = '';
  };
  if (o.onPick) cv.onclick = e => { tip.style.display = 'none'; o.onPick(pick(e)); };
  cv._pick = pick;   // für Ziehen & Ablegen (Lager-Ansicht)
  cv.onmouseleave = () => tip.style.display = 'none';
}

/* ------------------------------------------------------------------ */
/* Systemkarte (SVG) mit Route und Lupe                                 */
/* ------------------------------------------------------------------ */
const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, at, parent) => { const e = document.createElementNS(SVGNS, tag); for (const k in at) e.setAttribute(k, at[k]); if (parent) parent.appendChild(e); return e; };
function sysMap(svg, sys, route, lupe) {
  const B = sysBodies(sys);
  const st = S.ui.mapView && S.ui.mapView.sys === sys ? S.ui.mapView : null;
  let view;
  const fit = () => { const r = Math.max(5, ...B.map(b => Math.hypot(b.x, b.y)), ...((E2.karte.rings || {})[sys] || []).map(x => x.r2)) * 1.08; view = { x: -r, y: -r, w: 2 * r, h: 2 * r }; apply(); draw(); };
  const apply = () => { svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`); S.ui.mapView = { sys, ...view }; };
  const draw = () => {
    svg.innerHTML = ''; const u = view.w / 120, g = sv('g', {}, svg);
    for (const b of B.filter(b => b.kind === 'planet')) sv('circle', { cx: 0, cy: 0, r: Math.hypot(b.x, b.y), fill: 'none', stroke: '#1d3a2a', 'stroke-width': .25 * u, 'stroke-dasharray': `${u} ${u}` }, g);
    for (let r = 10; r < 90; r += 10) sv('circle', { cx: 0, cy: 0, r, fill: 'none', stroke: '#10221a', 'stroke-width': .15 * u }, g);
    for (const ri of (E2.karte.rings || {})[sys] || []) {   // Asteroidenringe (Nyx: Glaciem-Ring, Keeger-Gürtel)
      sv('circle', { cx: 0, cy: 0, r: (ri.r1 + ri.r2) / 2, fill: 'none', stroke: '#6a5a3a', 'stroke-opacity': .45, 'stroke-width': Math.max(1.6 * u, ri.r2 - ri.r1) }, g);
      sv('text', { x: 0, y: -(ri.r1 + ri.r2) / 2 - 1.4 * u, fill: '#8a7a5a', 'font-size': 1.7 * u, 'text-anchor': 'middle' }, g).textContent = ri.name;
    }
    sv('text', { x: 10.3, y: -.4, fill: '#2f5a42', 'font-size': 1.6 * u }, g).textContent = '10 Gm';
    const defs = sv('defs', {}, svg), mk = sv('marker', { id: 'e2arr', viewBox: '0 0 10 10', refX: 22, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto' }, defs); sv('path', { d: 'M0 0L10 5L0 10z', fill: '#f0b050' }, mk);
    for (let i = 0; i < route.length - 1; i++) {
      const a = route[i].li.body, b = route[i + 1].li.body; if (a === b || (a.x === b.x && a.y === b.y)) continue;
      sv('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#f0b050', 'stroke-width': .5 * u, 'stroke-opacity': route[i + 1].done ? .35 : .85, 'marker-end': 'url(#e2arr)' }, g);
      sv('text', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - u, fill: '#f0b050', 'font-size': 1.9 * u, 'text-anchor': 'middle' }, g).textContent = Math.hypot(a.x - b.x, a.y - b.y).toFixed(1) + ' Gm';
    }
    for (const b of B) {
      const [col, sz0] = KIND[b.kind] || ['#888', .4], sz = b.main ? .8 : sz0, fill = b.kind === 'planet' ? (PCOL[b.name] || col) : col;
      let e;
      if (b.kind === 'moon') continue;
      if (b.kind === 'lpoint') e = sv('rect', { x: b.x - sz * u, y: b.y - sz * u, width: 2 * sz * u, height: 2 * sz * u, fill, transform: `rotate(45 ${b.x} ${b.y})` }, g);
      else if (b.kind === 'jump') { e = sv('circle', { cx: b.x, cy: b.y, r: sz * u, fill: 'none', stroke: fill, 'stroke-width': .35 * u }, g); sv('circle', { cx: b.x, cy: b.y, r: sz * u * .45, fill }, g); }
      else if (b.kind === 'star') { sv('circle', { cx: 0, cy: 0, r: sz * u * 2.2, fill, opacity: .15 }, g); e = sv('circle', { cx: 0, cy: 0, r: sz * u, fill }, g); }
      else e = sv('circle', { cx: b.x, cy: b.y, r: sz * u, fill, stroke: '#000', 'stroke-width': .15 * u }, g);
      const moons = B.filter(m => m.parent === b.id && m.kind === 'moon').length;
      sv('title', {}, e).textContent = `${b.name}${moons ? ' · ' + moons + ' Monde' : ''} · ${Math.hypot(b.x, b.y).toFixed(2)} Gm vom Stern`;
      if (b.kind === 'planet') { e.style.cursor = 'pointer'; e.addEventListener('click', () => drawLupe(b)); }
      const host = b.kind === 'station' && B.find(p => p.id === b.parent && (p.kind === 'planet' || p.kind === 'moon'));
      const lpHost = b.kind === 'station' && B.find(p => p.id === b.parent && p.kind === 'lpoint' && b.name.startsWith(p.name));   // „ARC-L1 Wide Forest Station“: L-Punkt ist schon beschriftet
      if (b.kind === 'station' && (b.main || !host) && !lpHost) {   // Haupt- und Service-Stationen beschriften (Stationen am Mond nur in der Lupe)
        const hm = host ? B.filter(m => m.parent === host.id && m.kind === 'moon').length : 0;
        sv('text', { x: b.x + (sz + .6) * u, y: b.y + (host ? (hm ? 4.6 : 2.6) : .6) * u, fill: b.main ? '#8af0ff' : '#5ad2e8', 'font-size': (b.main ? 2 : 1.5) * u, 'font-weight': b.main ? 700 : 400 }, g).textContent = b.name.replace("People's Service Station", 'PSS');
      }
      if (['planet', 'jump', 'star'].includes(b.kind)) {
        sv('text', { x: b.x + (sz + .6) * u, y: b.y + .6 * u, fill: b.kind === 'jump' ? '#c88aff' : '#d8e8e0', 'font-size': (b.kind === 'planet' ? 2.3 : 1.8) * u }, g).textContent = b.name;
        if (moons) sv('text', { x: b.x + (sz + .6) * u, y: b.y + 2.6 * u, fill: '#7f9a8c', 'font-size': 1.6 * u }, g).textContent = moons + ' Monde';
      }
    }
    // Stopp-Nummern (mehrere Stopps am selben Ort nebeneinander)
    const at = {};
    for (const r of route) {
      const b = r.li.body, k = b.id || b.name, n = at[k] = (at[k] || 0) + 1;
      const x = b.x - 1.6 * u + (n - 1) * 2.7 * u, y = b.y - 2.2 * u;
      sv('circle', { cx: x, cy: y, r: 1.25 * u, fill: r.done ? '#5a6a60' : '#f0b050' }, g);
      sv('text', { x, y: y + .45 * u, fill: '#201', 'font-size': 1.5 * u, 'text-anchor': 'middle', 'font-weight': 700 }, g).textContent = r.n;
    }
  };
  const drawLupe = p => {
    if (!lupe) return; lupe.innerHTML = '';
    const kids = B.filter(b => b.parent === p.id && b.kind !== 'lpoint');
    const r = Math.max(.05, ...kids.map(b => Math.hypot(b.x - p.x, b.y - p.y))) * 1.3, u = r / 60;
    lupe.setAttribute('viewBox', `${-r} ${-r} ${2 * r} ${2 * r}`); lupe.style.display = 'block';
    sv('circle', { cx: 0, cy: 0, r: 2.4 * u, fill: PCOL[p.name] || '#7fd0ff' }, lupe);
    sv('text', { x: 3 * u, y: u, fill: '#fff', 'font-size': 4 * u }, lupe).textContent = p.name;
    for (const b of kids) {
      const x = b.x - p.x, y = b.y - p.y;
      sv('circle', { cx: 0, cy: 0, r: Math.hypot(x, y), fill: 'none', stroke: '#1d3a2a', 'stroke-width': .3 * u, 'stroke-dasharray': `${u} ${u}` }, lupe);
      sv('circle', { cx: x, cy: y, r: 1.3 * u, fill: (KIND[b.kind] || ['#888'])[0] }, lupe);
      sv('text', { x: x + 2 * u, y: y + u, fill: '#cde', 'font-size': 3.4 * u }, lupe).textContent = `${b.name} · ${(Math.hypot(x, y) * 1000).toFixed(0)} Mm`;
    }
  };
  const zoom = (f, cx, cy) => { cx ??= view.x + view.w / 2; cy ??= view.y + view.h / 2; view = { x: cx - (cx - view.x) * f, y: cy - (cy - view.y) * f, w: view.w * f, h: view.h * f }; apply(); draw(); };
  let drag = null;
  svg.onpointerdown = e => { drag = { x: e.clientX, y: e.clientY, v: { ...view } }; svg.setPointerCapture(e.pointerId); };
  svg.onpointermove = e => { if (!drag) return; const k = view.w / svg.clientWidth; view = { ...view, x: drag.v.x - (e.clientX - drag.x) * k, y: drag.v.y - (e.clientY - drag.y) * k }; apply(); };
  svg.onpointerup = () => { drag = null; };
  svg.onwheel = e => { e.preventDefault(); const r = svg.getBoundingClientRect(); zoom(e.deltaY > 0 ? 1.2 : 1 / 1.2, view.x + (e.clientX - r.left) / r.width * view.w, view.y + (e.clientY - r.top) / r.height * view.h); };
  if (st) { view = { x: st.x, y: st.y, w: st.w, h: st.h }; apply(); draw(); } else fit();
  if (lupe) { const first = route[0] && route[0].li.body; const p = first && (first.kind === 'planet' ? first : B.find(b => b.id === first.parent)); if (p) drawLupe(p); else lupe.style.display = 'none'; }
  return { zoom, fit };
}
