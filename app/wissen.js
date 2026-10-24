'use strict';
/* Pliskin Industrie – Datenbank (Wissen zum Nachschlagen): Material-Atlas, Raffinerien, Raffinerie-Verfahren,
   Missionen → Blueprints, Blueprints.
   Daten: data/wissen.json – selbst aus den Spieldateien gelesen (werkzeuge/wissen_export.py, je Patch).
   Raffinerie-Boni stehen nicht in den Spieldateien (kommen vom Server): eigene Einträge (S.refBonus, am Terminal abgelesen)
   gehen vor, sonst – wenn erlaubt – Werte aus data/scmdb.json (SCMDB, optional). */

let W = null, W_LOADING = null, WX = null;
function wInit() {
  if (W) return Promise.resolve(W);
  const leer = { materials: {}, refineries: [], pools: {}, version: '' };
  if (!W_LOADING) W_LOADING = Promise.all([
    fetch('data/wissen.json').then(r => r.ok ? r.json() : null).catch(() => null),
    Promise.resolve(call('scmdb')).catch(() => null)   // optionale SCMDB-Ergänzung (nur auf Knopfdruck geholt, Einstellungen)
  ]).then(([own, ext]) => { W = own || ext || leer; WX = own ? ext : null; return W; });
  return W_LOADING;
}
/* Raffinerie-Boni je Raffinerie: eigene Einträge > SCMDB (falls erlaubt). src je Material: 'eigen' | 'scmdb' */
const refKey = n => norm2(String(n).replace(/\s*\((Stanton|Pyro|Nyx)\)$/, ''));
function extBonus(name, sys) {
  if (!WX || !S.settings.extBonus) return {};
  const k = refKey(name), hit = (WX.refineries || []).find(r => refKey(r[0]) === k && (!sys || !r[1] || r[1] === sys)) || (WX.refineries || []).find(r => refKey(r[0]) === k);
  return hit ? hit[2] : {};
}
function refList() {
  if (!W) return [];
  return W.refineries.map(([name, sys, p0]) => {
    const own = S.refBonus[name] || {}, ext = extBonus(name, sys), p = Object.assign({}, p0, ext, own), src = {};
    Object.keys(p).forEach(k => { src[k] = k in own ? 'eigen' : k in ext ? 'scmdb' : 'spiel'; });
    return { name, sys, p, src };
  });
}
const wWait = el => { if (W) return false; el.innerHTML = '<div class="empty">Lade Wissens-Daten …</div>'; wInit().then(render); return true; };
const SCMDB = key => 'https://scmdb.net/?m=' + encodeURIComponent(key);
const KINDL = { ship: 'Schiff', roc: 'ROC', fps: 'Hand' };
const LOCT = { planet: 'Planet', moon: 'Mond', belt: 'Gürtel', lagrange: 'L-Punkt', cluster: 'Asteroiden', cave: 'Höhle', event: 'Event', special: 'Sonderort' };
const SYSTEMS = ['Stanton', 'Pyro', 'Nyx'];

/* Material im Lager/Rezept (RES-Id) -> Eintrag in den Wissens-Daten */
const wBase = n => String(n || '').replace(/\s*\((Ore|Raw)\)/g, '').trim();
function wMat(id) {
  if (!W) return null;
  const n = wBase(resName(id));
  return W.materials[n] || W.materials[{ Quantanium: 'Quantainium', Aluminium: 'Aluminum', Ice: 'Pressurized Ice' }[n]] || null;
}
/* Qualität: Anteil der Funde mit Q >= q (Normalverteilung, abgeschnitten – wie in den Spieldaten) */
function erf(x) { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x);
  return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); }
const ncdf = (x, mu, sd) => 0.5 * (1 + erf((x - mu) / (sd * Math.SQRT2)));
function qChance(m, kind, sys, q) {
  const d = m && m.dist && m.dist[kind] && m.dist[kind][sys]; if (!d) return 0;
  if (q <= d.min) return 1;
  if (q > d.max) return 0;
  const lo = ncdf(d.min, d.mean, d.stddev), hi = ncdf(d.max, d.mean, d.stddev);
  return Math.max(0, (hi - ncdf(q, d.mean, d.stddev)) / ((hi - lo) || 1));
}
const mainKind = m => m ? (m.where.ship ? 'ship' : m.where.roc ? 'roc' : 'fps') : 'ship';
/* Fundorte sortiert nach „Chance je Stein, das Material in mind. Q zu enthalten“ */
function wSpots(m, q, kind) {
  if (!m) return [];
  const out = [];
  for (const k of Object.keys(m.where)) {
    if (kind && kind !== 'all' && k !== kind) continue;
    for (const [loc, sys, type, pct, mn, mx] of m.where[k]) {
      const qc = qChance(m, k, sys, q);
      out.push({ loc, sys, type, kind: k, pct, mn, mx, qc, hit: pct * qc });
    }
  }
  return out.sort((a, b) => b.hit - a.hit || b.pct - a.pct);
}
function wRefs(m) {
  if (!W || !m) return [];
  return refList().map(({ name, sys, p, src }) => ({ name, sys, b: p[m.key] ?? null, src: src[m.key] }))
    .sort((a, b) => (b.b ?? -99) - (a.b ?? -99) || a.name.localeCompare(b.name));
}
const shortLoc = n => String(n).replace(/ (Station)$/, '').replace(/^(\w{3}-L\d) .*/, '$1');
const sgn = v => (v > 0 ? '+' : '') + v;
const bcls = v => v > 0 ? 'green' : v < 0 ? 'bad' : 'dim';
const isFavLoc = n => S.favs.some(f => norm2(f.loc) === norm2(n) || norm2(n).startsWith(norm2(f.loc)) || norm2(f.loc).startsWith(norm2(shortLoc(n))));
const isHomeLoc = n => !!S.settings.home && (norm2(S.settings.home) === norm2(n) || norm2(n).startsWith(norm2(S.settings.home)));
const norm2 = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const locMark = n => isHomeLoc(n) ? ' <span class="tag warn">⌂</span>' : isFavLoc(n) ? ' <span class="tag">☆</span>' : '';
const pctTxt = p => p >= 10 ? F(p, 0) + ' %' : p >= 1 ? F(p, 1) + ' %' : p > 0 ? F(p, 2) + ' %' : '0 %';

/* Missions-Links eines Blueprint-Pools (für Blueprint-Fenster und To-do) */
function scLinks(pool, max = 4) {
  const p = W && W.pools[pool]; if (!p) return '';
  const c = p.c.slice(0, max);
  return `<div class="wlinks">${c.map(x => `<a class="wlink" href="${SCMDB(x[3])}" target="_blank" rel="noopener">${esc(x[0])}${x[2] ? ' · ' + esc(x[2]) : ''} ↗</a>`).join('')}${p.c.length > max ? `<span class="dim" style="font-size:12px">+${p.c.length - max} weitere Varianten</span>` : ''}</div>`;
}

/* ------------------------------------------------------------------ */
/* DATENBANK                                                            */
/* ------------------------------------------------------------------ */
const DB_TABS = [['atlas', 'Material-Atlas'], ['trip', '⛏ Mining-Ausflug'], ['ref', 'Raffinerien'], ['own', '✎ Eigene Daten'], ['meth', 'Raffinerie-Verfahren'], ['miss', 'Missionen → Blueprints'], ['bps', 'Blueprints']];
function renderDb() {
  const el = $('#db'); if (wWait(el)) return;
  const tab = DB_TABS.some(t => t[0] === S.ui.dbTab) ? S.ui.dbTab : 'atlas';
  let h = `<div class="subkeys">${DB_TABS.map(([k, l]) => `<div class="key ${tab === k ? 'on' : ''}" data-dbt="${k}">${l}</div>`).join('')}</div>`;
  if (tab === 'bps') { el.innerHTML = h + '<div id="bp"></div>'; renderBlueprints(); }
  else el.innerHTML = h + ({ atlas: dbAtlas, trip: dbTrip, ref: dbRef, own: dbOwn, meth: dbMeth, miss: dbMiss })[tab]();
  $$('[data-dbt]', el).forEach(k => k.onclick = () => { S.ui.dbTab = k.dataset.dbt; save(); renderDb(); if ($('#scr')) $('#scr').scrollTop = 0; });
  ({ atlas: bindAtlas, trip: bindTrip, ref: bindRef, own: bindOwn, miss: bindMiss })[tab]?.(el);
}
const dbSource = () => `<div class="hint">Quelle: ${esc(W.source || '?')} · Patch ${esc(W.version || '?')} · erzeugt ${esc(W.fetched || '?')}. Wird bei jedem neuen Patch neu aus den Spieldateien gelesen.${WX && S.settings.extBonus ? ' Raffinerie-Boni ohne eigenen Eintrag: SCMDB.' : ''}</div>`;

/* Material-Atlas */
function atlasMats() {
  const need = new Set(Object.keys(CALC.missing).map(id => (wMat(id) || {}).key).filter(Boolean));
  const grp = { ship: [], roc: [], fps: [] };
  Object.values(W.materials).forEach(m => grp[mainKind(m)].push(m));
  Object.values(grp).forEach(l => l.sort((a, b) => (need.has(b.key) - need.has(a.key)) || a.key.localeCompare(b.key)));
  return { grp, need };
}
function dbAtlas() {
  const { grp, need } = atlasMats();
  const sel = W.materials[S.ui.atlasMat] || W.materials[[...need][0]] || W.materials.Gold || Object.values(W.materials)[0];
  if (!sel) return '<div class="empty">Keine Wissens-Daten vorhanden.</div>';
  S.ui.atlasMat = sel.key;
  const q = S.ui.atlasQ || 900, kinds = Object.keys(sel.where), kind = kinds.includes(S.ui.atlasKind) ? S.ui.atlasKind : 'all';
  const all = wSpots(sel, q, kind), rows = S.ui.atlasAll ? all : all.slice(0, 15);
  const top = all[0];
  const picker = Object.entries(grp).filter(([, l]) => l.length).map(([k, l]) => `<div class="wpick"><span class="wpl">${KINDL[k]}-Mining</span>${l.map(m => `<span class="${m.key === sel.key ? 'on' : ''}" data-am="${esc(m.key)}">${need.has(m.key) ? '★ ' : ''}${esc(m.key)}</span>`).join('')}</div>`).join('');
  const sysRows = kinds.map(k => SYSTEMS.filter(s => (sel.where[k] || []).some(r => r[1] === s)).map(s => {
    const c = qChance(sel, k, s, q) * 100;
    return `<tr><td class="name">${s}${kinds.length > 1 ? ` <span class="dim">· ${KINDL[k]}</span>` : ''}</td><td class="l" style="min-width:140px">${segBar(c)}</td><td><b>${pctTxt(c)}</b></td>
      <td class="l dim" style="font-size:12px">${[700, 800, 900, 950].map(t => `Q${t}: ${pctTxt(qChance(sel, k, s, t) * 100)}`).join(' · ')}</td></tr>`;
  }).join('')).join('');
  const refs = mainKind(sel) === 'ship' ? wRefs(sel) : [];
  return `<div class="win tight"><span class="pill">Material-Atlas</span><span class="sub">Wo finde ich was – und wo am ehesten in Top-Qualität? ★ = brauchst du für einen Plan</span>${picker}</div>
  <div class="win tight"><span class="pill">${esc(sel.key)}</span><span class="sub">${esc(kinds.map(k => KINDL[k]).join(' / '))}-Mining · Seltenheit ${esc(sel.rarity || '–')} · ${all.length} Fundorte</span>
    <div class="row2"><span class="dim">Ziel-Qualität:</span>${[600, 700, 800, 900, 950].map(t => `<button class="k sm ${t === q ? 'pri' : ''}" data-aq="${t}">Q ≥ ${t}</button>`).join('')}
      ${kinds.length > 1 ? `<span style="width:12px"></span>${['all', ...kinds].map(k => `<button class="k sm ${k === kind ? 'pri' : ''}" data-ak="${k}">${k === 'all' ? 'alle' : KINDL[k]}</button>`).join('')}` : ''}</div>
    ${top ? `<div class="wbest">Beste Chance: <b>${esc(top.loc)}</b> (${esc(top.sys)}) – etwa <b>${pctTxt(top.hit)}</b> der Steine dort enthalten ${esc(sel.key)} in Q ≥ ${q}${top.hit > 0 ? ` · grob jeder ${Math.max(1, Math.round(100 / top.hit))}. Stein` : ''}.</div>` : ''}
    <div class="cols2 wcols"><div><div class="scroll"><table class="ptab"><tr><th class="l">Ort</th><th class="l">System</th><th class="l">Art</th><th class="l">Chance je Stein auf Q ≥ ${q}</th><th title="Anteil der Steine dort, die das Material überhaupt enthalten">Steine mit ${esc(sel.key)}</th><th title="So viel Prozent des Steins sind das Material">Anteil im Stein</th></tr>
      ${rows.map(r => `<tr><td class="name">${esc(r.loc)}${locMark(r.loc)}</td><td class="l dim">${esc(r.sys)}</td><td class="l dim">${esc(LOCT[r.type] || r.type || '')}${kinds.length > 1 ? ' · ' + KINDL[r.kind] : ''}</td>
        <td class="l" style="min-width:150px"><div class="wbar"><i style="width:${Math.min(100, r.hit / Math.max(top.hit, 0.001) * 100)}%"></i></div><b>${pctTxt(r.hit)}</b></td><td>${pctTxt(r.pct)}</td><td class="dim">${r.mn}–${r.mx} %</td></tr>`).join('')}</table></div>
      ${all.length > 15 ? `<div class="row2"><button class="k sm" id="at-all">${S.ui.atlasAll ? 'Nur die besten 15' : 'Alle ' + all.length + ' Fundorte zeigen'}</button></div>` : ''}
      <div class="hint"><b>Chance je Stein</b> = Steine mit ${esc(sel.key)} × Anteil der Funde mit Q ≥ ${q} im System. Danach ist sortiert.<br><b>Steine mit …</b> sagt nur, wie oft das Material dort vorkommt – über die Qualität sagt es nichts.</div></div>
    <div><table class="ptab"><tr><th class="l" colspan="4">Qualität je System · Anteil der Funde mit Q ≥ ${q}</th></tr>${sysRows}</table>
      <div class="hint">Laut Spieldaten hängt die Qualität nur vom <b>System</b> und von der <b>Seltenheit</b> ab, nicht vom Mond oder Gürtel. Pyro ist etwas besser, Stanton und Nyx sind gleich.${mainKind(sel) === 'ship' ? ' Schiffs-Erze haben immer mindestens Q 501.' : ''}</div>
      ${refs.length ? `<table class="ptab" style="margin-top:10px"><tr><th class="l" colspan="3">Beste Raffinerien für ${esc(sel.key)}</th></tr>${refs.filter(r => r.b != null).slice(0, 5).map(r => `<tr><td class="name">${esc(r.name)}${locMark(r.name)}</td><td class="l dim">${esc(r.sys)}</td><td class="${bcls(r.b)}"><b>${sgn(r.b)} %</b></td></tr>`).join('')}</table>
        <div class="row2"><button class="k sm" id="at-ref">Alle Raffinerien</button></div>` : `<div class="hint">${esc(sel.key)} wird nicht raffiniert – Hand- und ROC-Mineralien verkauft oder verbaut man direkt.</div>`}</div></div>
    ${dbSource()}</div>`;
}
function bindAtlas(el) {
  $$('[data-am]', el).forEach(c => c.onclick = () => { S.ui.atlasMat = c.dataset.am; S.ui.atlasAll = false; S.ui.atlasKind = 'all'; save(); renderDb(); });
  $$('[data-aq]', el).forEach(c => c.onclick = () => { S.ui.atlasQ = +c.dataset.aq; save(); renderDb(); });
  $$('[data-ak]', el).forEach(c => c.onclick = () => { S.ui.atlasKind = c.dataset.ak; save(); renderDb(); });
  const a = $('#at-all', el); if (a) a.onclick = () => { S.ui.atlasAll = !S.ui.atlasAll; renderDb(); };
  const r = $('#at-ref', el); if (r) r.onclick = () => { S.ui.dbTab = 'ref'; S.ui.refMat = S.ui.atlasMat; save(); renderDb(); };
}
/* aus anderen Seiten direkt in den Atlas springen */
function openAtlas(id, q) {
  const m = typeof id === 'string' && W && W.materials[id] ? W.materials[id] : wMat(id);
  if (m) S.ui.atlasMat = m.key;
  if (q) S.ui.atlasQ = [600, 700, 800, 900, 950].reduce((a, t) => Math.abs(t - q) < Math.abs(a - q) ? t : a, 900);
  S.ui.dbTab = 'atlas'; S.ui.atlasAll = false;
  if (window.MOBILE && typeof mGo === 'function') mGo('db'); else switchTab('db');
}

/* Raffinerien */
const refOres = () => Object.keys(W.materials).filter(k => W.materials[k].where.ship).sort();
const srcMark = s => s === 'eigen' ? ' <span class="tag" title="Selbst eingetragen">✎</span>' : s === 'scmdb' ? ' <span class="dim" title="Wert von SCMDB (scmdb.net, CC BY-SA 4.0)">ˢ</span>' : '';
function dbRef() {
  const mats = refOres(), RL = refList();
  const sel = mats.includes(S.ui.refMat) ? S.ui.refMat : (mats.includes('Gold') ? 'Gold' : mats[0]);
  S.ui.refMat = sel;
  const m = W.materials[sel], list = wRefs(m), known = RL.filter(r => Object.keys(r.p).length);
  const same = {}; known.forEach(r => { const k = JSON.stringify(r.p); (same[k] = same[k] || []).push(r.name); });
  let h = `<div class="win tight"><span class="pill">Raffinerien</span><span class="sub">${RL.length} Raffinerien laut Spieldaten · jede gibt pro Erz einen Bonus oder Abzug auf den Ertrag · ⌂ = Home, ☆ = Favorit</span>
    <div class="chips2">${mats.map(k => `<span data-rm="${esc(k)}" class="${k === sel ? 'on' : ''}">${esc(k)}</span>`).join('')}</div>
    <div class="row2"><button class="k sm ${S.ui.refAll ? 'pri' : ''}" id="rf-all">${S.ui.refAll ? 'Zurück zur Liste' : 'Ganze Tabelle (alle Erze)'}</button></div></div>`;
  if (S.ui.refAll) {
    h += `<div class="win tight"><span class="pill">Alle ${RL.length} Raffinerien × Erz</span><span class="sub">Ertrags-Bonus in % · ✎ = selbst eingetragen · ˢ = von SCMDB</span><div class="scroll"><table class="ptab wmx"><tr><th class="l">Raffinerie</th>${mats.map(k => `<th>${esc(k.slice(0, 6))}</th>`).join('')}<th></th></tr>
      ${RL.map(r => `<tr><td class="name">${esc(shortLoc(r.name))}${locMark(r.name)} <span class="dim">${esc(r.sys || '')}</span></td>${mats.map(k => { const v = r.p[k]; return `<td class="${v == null ? 'dim' : bcls(v)}">${v == null ? '·' : sgn(v) + (r.src[k] === 'eigen' ? '✎' : '')}</td>`; }).join('')}<td><button class="k sm" data-rfe="${esc(r.name)}">✎</button></td></tr>`).join('')}</table></div></div>`;
  } else {
    h += `<div class="cols2"><div class="win tight"><span class="pill">${esc(sel)} · beste zuerst</span><table class="ptab">
      ${list.map(r => `<tr><td class="name">${esc(r.name)}${locMark(r.name)}</td><td class="l dim">${esc(r.sys || '')}</td><td class="${r.b == null ? 'dim' : bcls(r.b)}" style="font-size:18px"><b>${r.b == null ? '?' : sgn(r.b) + ' %'}</b>${srcMark(r.src)}</td><td><button class="k sm" data-rfe="${esc(r.name)}" title="Boni dieser Raffinerie eintragen">✎</button></td></tr>`).join('')}</table></div>
      <div class="win tight"><span class="pill">Gut zu wissen</span><div style="font-size:15px;line-height:1.5">
        <p>Der Bonus gilt auf den Ertrag: +9 % heißt, aus derselben Menge Erz kommt 9 % mehr fertiges Material raus.</p>
        <p><b>Woher die Werte kommen:</b> Welche Stationen eine Raffinerie haben, steht in den Spieldaten. Die Boni selbst schickt der Spiel-Server – sie stehen in keiner Datei.
          Den echten Wert zeigt das Raffinerie-Terminal. Trag ihn mit ✎ ein, dann gilt dein Wert.${WX ? (S.settings.extBonus ? ' Fehlende Werte ergänzt Pliskin von SCMDB (ˢ, abschaltbar in den Einstellungen).' : ' Ergänzung von SCMDB ist in den Einstellungen aus.') : ''}</p>
        ${Object.values(same).some(g => g.length > 2) ? `<p>Viele Stationen haben <b>dieselben Werte</b>: ${Object.values(same).filter(g => g.length > 2).map(g => esc(g.slice(0, 3).map(shortLoc).join(', ')) + (g.length > 3 ? ` und ${g.length - 3} weitere` : '')).join('; ')}.</p>` : ''}
        <p class="dim">Das Terminal im Spiel ist immer das letzte Wort.</p></div></div></div>`;
  }
  return h + `<div class="win tight">${dbSource()}</div>`;
}
function bindRef(el) {
  $$('[data-rm]', el).forEach(c => c.onclick = () => { S.ui.refMat = c.dataset.rm; save(); renderDb(); });
  $('#rf-all', el).onclick = () => { S.ui.refAll = !S.ui.refAll; save(); renderDb(); };
  $$('[data-rfe]', el).forEach(b => b.onclick = () => openRefBonus(b.dataset.rfe));
}
/* Boni einer Raffinerie eintragen (am Terminal abgelesen) */
function openRefBonus(name) {
  const r = refList().find(x => x.name === name); if (!r) return;
  const own = S.refBonus[name] || {}, ext = extBonus(name, r.sys);
  openModal(`<h3>Raffinerie-Boni: ${esc(name)}</h3>
    <div class="hint">Am Raffinerie-Terminal im Spiel ablesen und hier eintragen (z. B. 9 oder -4). Leer = kein eigener Wert${WX && S.settings.extBonus ? ' (grau = SCMDB-Wert)' : ''}.</div>
    <div class="rfgrid">${refOres().map(k => `<label>${esc(k)}<input type="number" step="1" data-m="${esc(k)}" value="${own[k] ?? ''}" placeholder="${ext[k] ?? ''}"></label>`).join('')}</div>
    <div class="foot"><button class="k x" id="rb-del">Eigene Werte löschen</button><button class="k" id="rb-x">Abbrechen</button><button class="k pri" id="rb-ok">Speichern</button></div>`, box => {
    $('#rb-x', box).onclick = closeModal;
    $('#rb-del', box).onclick = () => { delete S.refBonus[name]; save(); closeModal(); renderDb(); toast('Eigene Werte gelöscht'); };
    $('#rb-ok', box).onclick = () => {
      const o = {};
      $$('input[data-m]', box).forEach(i => { if (i.value.trim() !== '' && !isNaN(+i.value)) o[i.dataset.m] = Math.round(+i.value); });
      if (Object.keys(o).length) S.refBonus[name] = o; else delete S.refBonus[name];
      save(); closeModal(); renderDb(); toast('Raffinerie-Boni gespeichert');
    };
  });
}

/* Raffinerie-Verfahren: Tempo und Ertrag aus den Spieldaten (RefiningProcess), Namen + Kosten aus dem Spieltext */
const METHODS = [
  ['Dinyx Solventation', 0, 2, 0, '★ Standard: billig und viel Ertrag – wenn du warten kannst'],
  ['Ferron Exchange', 1, 2, 1, '★ viel Ertrag, deutlich schneller'],
  ['Pyrometric Chromalysis', 2, 2, 2, '★ eilig + wertvolles Erz (z. B. Quantainium)'],
  ['Thermonatic Deposition', 0, 1, 0, 'billig, aber weniger Ertrag'],
  ['Electrostarolysis', 1, 1, 1, 'Mittelweg in allem'],
  ['Gaskin Process', 2, 1, 2, 'schnell, teuer, mittlerer Ertrag'],
  ['Kazen Winnowing', 0, 0, 0, 'lohnt sich kaum'],
  ['Cormack Method', 1, 0, 1, 'lohnt sich kaum'],
  ['XCR Reaction', 2, 0, 2, 'nur wenn Zeit wirklich alles ist']];
function dbMeth() {
  const SP = ['langsam', 'mittel', 'schnell'], YI = ['wenig', 'mittel', 'viel'], CO = ['niedrig', 'mittel', 'hoch'];
  const cell = (s, y) => { const m = METHODS.find(x => x[1] === s && x[2] === y); return `<td><div class="wcell ${y === 2 ? 'best' : ''}">${esc(m[0])}</div></td>`; };
  return `<div class="cols2"><div class="win tight"><span class="pill">Die 9 Verfahren</span><div class="scroll"><table class="ptab">
    <tr><th class="l">Verfahren</th><th class="l">Tempo</th><th class="l">Ertrag</th><th class="l">Kosten</th><th class="l">Wann?</th></tr>
    ${METHODS.map(m => `<tr><td class="name">${esc(m[0])}</td><td class="l">${SP[m[1]]}</td><td class="l ${m[2] === 2 ? 'green' : m[2] === 0 ? 'bad' : ''}">${YI[m[2]]}</td><td class="l ${m[3] === 2 ? 'bad' : m[3] === 0 ? 'green' : ''}">${CO[m[3]]}</td><td class="l dim">${esc(m[4])}</td></tr>`).join('')}</table></div>
    <div class="hint">Tempo und Ertrag stammen aus den Spieldaten (3 Tempo-Stufen × 3 Ertrags-Stufen = 9 Verfahren), Namen und Kosten aus dem Spieltext. Genaue Prozente und Zeiten rechnet der Server erst am Terminal aus – die stehen nicht in den Dateien.</div></div>
  <div class="win tight"><span class="pill">Auf einen Blick</span><table class="ptab wgrid"><tr><th></th><th>wenig Ertrag</th><th>mittel</th><th>viel Ertrag</th></tr>
    ${[0, 1, 2].map(s => `<tr><td class="l name">${SP[s]}<div class="dim" style="font-size:12px">Kosten ${CO[s]}</div></td>${cell(s, 0)}${cell(s, 1)}${cell(s, 2)}</tr>`).join('')}</table>
    <div class="hint"><b>Faustregel:</b> immer die rechte Spalte (viel Ertrag). Wie lange du warten kannst, entscheidet die Zeile. Schnell kostet mehr Geld.</div></div></div>`;
}

/* Missionen -> Blueprints */
function poolBps(pool) { return (R.blueprints || []).filter(b => (b.pools || []).includes(pool)); }
function dbMiss() {
  const inPlan = new Set(S.plans.flatMap(p => p.items.filter(i => i.bp).map(i => i.bp)));
  const f = S.ui.missF || 'plan', q = (S.ui.missQ || '').toLowerCase();
  let pools = Object.keys(W.pools).map(p => {
    const bps = poolBps(p), miss = bps.filter(b => !isOwned(b.id)), mp = miss.filter(b => inPlan.has(b.id));
    return { p, bps, miss, mp, c: W.pools[p].c, n: W.pools[p].n };
  });
  if (f === 'plan') pools = pools.filter(x => x.mp.length);
  if (f === 'miss') pools = pools.filter(x => x.miss.length);
  if (q) pools = pools.filter(x => (poolName(x.p) + ' ' + x.c.map(c => c[0] + ' ' + c[1]).join(' ') + ' ' + x.bps.map(b => b.name).join(' ')).toLowerCase().includes(q));
  pools.sort((a, b) => b.mp.length - a.mp.length || b.miss.length - a.miss.length || a.p.localeCompare(b.p));
  const shown = pools.slice(0, 60);
  return `<div class="win tight"><span class="pill">Missionen → Blueprints</span><span class="sub">${Object.keys(W.pools).length} Missions-Pools mit Blueprint-Belohnung · Links öffnen die Mission auf scmdb.net</span>
    <div class="search"><input id="ms-q" placeholder="Suchen: Auftraggeber, Mission oder Blueprint …" value="${esc(S.ui.missQ || '')}"></div>
    <div class="chips2">${[['plan', 'Bringt BP für meine Pläne'], ['miss', 'Bringt fehlende BP'], ['all', 'Alle']].map(([k, l]) => `<span data-mf="${k}" class="${f === k ? 'on' : ''}">${l}</span>`).join('')}</div>
    ${shown.map(x => `<div class="wpool"><div class="wph"><b>${esc(poolName(x.p))}</b>
        ${x.mp.length ? `<span class="tag warn">${x.mp.length} für deine Pläne</span>` : ''}<span class="tag ${x.miss.length ? 'bad' : 'ok'}">${x.miss.length ? x.miss.length + ' fehlen' : 'alle da'}</span><span class="dim" style="font-size:12px">${x.bps.length} BP im Pool · ${x.n} Missions-Varianten</span></div>
      <div class="wbps">${x.bps.map(b => `<span class="${isOwned(b.id) ? 'own' : inPlan.has(b.id) ? 'plan' : ''}" data-bp="${b.id}">${isOwned(b.id) ? '✓ ' : inPlan.has(b.id) ? '★ ' : ''}${esc(b.name)}</span>`).join('')}</div>
      ${scLinks(x.p, 5)}</div>`).join('') || '<div class="empty">Nichts gefunden.</div>'}
    ${pools.length > shown.length ? `<div class="hint">${pools.length - shown.length} weitere – Suche eingrenzen.</div>` : ''}
    <div class="hint">★ = in deinen Plänen, ✓ = hast du schon. Chance auf den Blueprint und Ruf-Stufe stehen in SCMDB bei der Mission.</div>${dbSource()}</div>`;
}
function bindMiss(el) {
  const q = $('#ms-q', el);
  q.oninput = () => { S.ui.missQ = q.value; clearTimeout(q.t); q.t = setTimeout(() => { renderDb(); const n = $('#ms-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
  $$('[data-mf]', el).forEach(c => c.onclick = () => { S.ui.missF = c.dataset.mf; save(); renderDb(); });
  $$('[data-bp]', el).forEach(c => c.onclick = () => openBpDetail(c.dataset.bp));
}

/* ------------------------------------------------------------------ */
/* MINING-AUSFLUG: mehrere Materialien anhaken → wo bekomme ich möglichst viele davon zusammen, wie weit ab Home   */
/* ------------------------------------------------------------------ */
const TRIP_Q = [0, 600, 700, 800, 900, 950];
const tBon = v => `<span class="${bcls(Math.round(v * 10))}">${v > 0 ? '+' : ''}${F(v, 1)} %</span>`;
const tGm = g => g < 0.5 ? 'direkt dort' : F(g, g < 10 ? 1 : 0) + ' Gm';
const TRIP_RING = { 'Glaciem Ring': 15, 'Keeger Belt': 48, 'Aaron Halo': 20.5 };   // Ringe um den Stern (Radius in Gm; Aaron Halo: GoTo-Punkte in aaronhalo.socpak, 19,6–21,4)
// Fundort / Raffinerie (SCMDB-Name) -> Punkt auf unserer Karte; null = Lage steht nicht in den Daten
function tripPos(name, sys) {
  if (!E2.ready) return null;
  if (TRIP_RING[name]) return { sys, ring: TRIP_RING[name] };
  if (/^Lagrange\b/.test(name)) return { sys, lp: true };   // Lagrange-Felder (A–G, Occupied) gibt es an jedem L-Punkt -> nächster L-Punkt
  let m = name.match(/^(\w+) Gateway \((\w+)\)$/);
  if (m) { const b = sysBodies(m[2]).find(x => x.kind === 'jump' && norm(x.name) === norm('Sprungpunkt ' + m[1])); return b ? { sys: m[2], body: b } : null; }
  const n = (name.match(/^([A-Z]{3}-L\d)\b/) || name.match(/\(([^)]+)\)/) || [])[1] || name.replace(/ Asteroid Belt$/, '');
  const b = sysBodies(sys).find(x => x.kind !== 'star' && norm(x.name) === norm(n));
  return b ? { sys, body: b } : null;
}
// Entfernung Punkt -> Punkt (Gm, Luftlinie, zwischen Systemen über Sprungpunkte)
function tripDist(A, T) {
  if (!A || !T) return null;
  const d = (p, t) => t.ring != null ? Math.abs(Math.hypot(p.x, p.y) - t.ring)
    : t.lp ? Math.min(...sysBodies(t.sys).filter(x => x.kind === 'lpoint').map(x => Math.hypot(p.x - x.x, p.y - x.y)))
    : Math.hypot(p.x - t.body.x, p.y - t.body.y);
  if (A.sys === T.sys) return d(A.body, T);
  const ja = sysBodies(A.sys).find(x => x.kind === 'jump' && norm(x.name) === norm('Sprungpunkt ' + T.sys));
  const jb = sysBodies(T.sys).find(x => x.kind === 'jump' && norm(x.name) === norm('Sprungpunkt ' + A.sys));
  return ja && jb ? Math.hypot(A.body.x - ja.x, A.body.y - ja.y) + d(jb, T) : null;
}
// Gewählte Materialien: Standard = was den Plänen fehlt (mit deren Mindest-Qualität)
function tripMissing() {
  const out = {};
  Object.entries(CALC.missing).forEach(([id, v]) => { const m = wMat(id); if (m && v.need > 1e-6) out[m.key] = Math.max(out[m.key] || 0, v.minQ || 0); });
  return out;
}
function tripSel() {
  if (!S.ui.trip || typeof S.ui.trip !== 'object') S.ui.trip = { mats: tripMissing() };
  const t = S.ui.trip; t.mats = Object.fromEntries(Object.entries(t.mats || {}).filter(([k]) => W.materials[k]));
  if (t.ship === undefined || (t.ship && !S.fleet.some(f => f.id === t.ship)))   // Standard: ein Mining-Schiff aus der Flotte
    t.ship = (S.fleet.find(f => /prospector|mole|golem|arrastra|orion|roc/i.test(fleetName(f) + ' ' + f.ship)) || S.fleet[0] || {}).id || null;
  return t;
}
function openTrip(fromTodo) {
  if (fromTodo) {   // aus dem To-do: genau das, was dort fehlt (bei Plan-Filter nur dessen Anteil)
    const T = todoModel(), mats = {};
    T.mats.forEach(x => { if (x.m) mats[x.m.key] = Math.max(mats[x.m.key] || 0, x.minQ || 0); });
    S.ui.trip = { ...(S.ui.trip || {}), mats, kind: null };
  }
  S.ui.dbTab = 'trip';
  if (window.MOBILE && typeof mGo === 'function') mGo('db'); else switchTab('db');
}
function tripCalc(t) {
  const keys = Object.keys(t.mats), mats = keys.map(k => W.materials[k]);
  const kinds = ['ship', 'roc', 'fps'].filter(k => mats.some(m => m.where[k]));
  const kind = kinds.includes(t.kind) ? t.kind : kinds.sort((a, b) => mats.filter(m => m.where[b]).length - mats.filter(m => m.where[a]).length)[0];
  const use = mats.filter(m => m.where[kind]);
  const best = {};   // beste Chance je Material irgendwo (für „wie gut ist dieser Ort für X“)
  use.forEach(m => best[m.key] = Math.max(0.0001, ...m.where[kind].map(r => r[3] * qChance(m, kind, r[1], t.mats[m.key]))));
  const locs = {};
  use.forEach(m => m.where[kind].forEach(([loc, sys, type, pct]) => {
    const hit = pct * qChance(m, kind, sys, t.mats[m.key]);
    const L = locs[loc] = locs[loc] || { loc, sys, type, mats: [] };
    L.mats.push({ key: m.key, hit, pct, rel: hit / best[m.key] });
  }));
  const f = S.fleet.find(x => x.id === t.ship) || null;
  const home = S.settings.home ? locInfo(S.settings.home) : null;
  const shipOres = use.filter(m => kind === 'ship').map(m => m.key);
  const refs = refList().map(({ name, sys, p }) => ({ name, sys, pos: tripPos(name, sys), b: shipOres.length ? shipOres.reduce((a, k) => a + (p[k] ?? 0), 0) / shipOres.length : 0 }));
  const list = Object.values(locs).map(L => {
    L.mats.sort((a, b) => b.rel - a.rel);
    L.score = L.mats.reduce((a, x) => a + Math.min(1, x.rel), 0);
    L.any = 1 - L.mats.reduce((a, x) => a * (1 - x.hit / 100), 1);   // Anteil Steine, die mind. eins davon in Wunsch-Q bringen (geschätzt)
    L.pos = tripPos(L.loc, L.sys);
    L.gm = home && L.pos ? tripDist(home, L.pos) : null;
    L.fly = f && L.gm != null ? qtTime(f, L.gm) : null;
    if (shipOres.length) {
      const near = L.pos ? refs.filter(r => r.pos).map(r => ({ ...r, gm: tripDist(r.pos.body ? { sys: r.pos.sys, body: r.pos.body } : null, L.pos) })).filter(r => r.gm != null).sort((a, b) => a.gm - b.gm)[0] : null;
      const sysBest = refs.filter(r => r.sys === L.sys).sort((a, b) => b.b - a.b)[0];
      L.ref = { near, sysBest };
    }
    return L;
  });
  const sort = t.sort === 'near' ? (a, b) => (b.mats.length - a.mats.length) || ((a.gm ?? 1e9) - (b.gm ?? 1e9)) || b.score - a.score
    : (a, b) => b.score - a.score || b.any - a.any;
  list.sort(sort);
  const bestRef = shipOres.length ? refs.slice().sort((a, b) => b.b - a.b)[0] : null;
  return { keys, mats, kinds, kind, use, other: mats.filter(m => !m.where[kind]), list, f, home, bestRef, shipOres };
}
function dbTrip() {
  if (!E2.ready) { e2Init().then(render); return '<div class="empty">Lade Kartendaten …</div>'; }
  const t = tripSel(), C = tripCalc(t), need = tripMissing();
  const { grp } = atlasMats();
  const picker = Object.entries(grp).filter(([, l]) => l.length).map(([k, l]) => `<div class="wpick"><span class="wpl">${KINDL[k]}-Mining</span>${l.map(m => `<span class="${t.mats[m.key] != null ? 'on' : ''}" data-tm="${esc(m.key)}">${need[m.key] != null ? '★ ' : ''}${esc(m.key)}</span>`).join('')}</div>`).join('');
  const selRows = C.keys.map(k => `<div class="wtsel"><b>${esc(k)}</b><span class="dim wtk">${KINDL[mainKind(W.materials[k])]}</span>
      <select data-tq="${esc(k)}">${[...new Set([...TRIP_Q, t.mats[k] || 0])].sort((a, b) => a - b).map(q => `<option value="${q}" ${q === (t.mats[k] || 0) ? 'selected' : ''}>${q ? 'Q ≥ ' + q : 'Qualität egal'}</option>`).join('')}</select>
      <button class="k sm" data-tx="${esc(k)}" title="Entfernen">✕</button></div>`).join('');
  const ships = S.fleet.length ? `<select id="tr-ship"><option value="">– kein Schiff –</option>${S.fleet.map(f => `<option value="${f.id}" ${f.id === t.ship ? 'selected' : ''}>${esc(fleetName(f))}</option>`).join('')}</select>` : '<span class="dim">Unter „Schiffe“ eins anlegen, dann gibt es Flugzeiten.</span>';
  let h = `<div class="win tight"><span class="pill">⛏ Mining-Ausflug</span><span class="sub">Mehrere Materialien anhaken – Pliskin sucht die Orte, wo du möglichst viele davon in deiner Wunsch-Qualität zusammen findest. ★ = fehlt für einen Plan</span>
    ${S.ui.tripPick || !Object.keys(t.mats).length ? picker : ''}
    <div class="row2">${Object.keys(t.mats).length ? `<button class="k sm ${S.ui.tripPick ? 'pri' : ''}" id="tr-pick">${S.ui.tripPick ? 'Material-Auswahl zuklappen' : '+ Material hinzufügen / abwählen'}</button>` : ''}<button class="k sm" id="tr-miss">★ Fehlendes aus den Plänen übernehmen</button><button class="k sm" id="tr-clear">Auswahl leeren</button></div></div>`;
  if (!C.keys.length) return h + `<div class="win tight"><div class="empty">Noch nichts gewählt – oben Materialien antippen.</div></div>`;
  const R = C.list.slice(0, S.ui.tripAll ? 99 : 10);
  const range = C.f ? fleetRange(C.f) : null;
  h += `<div class="win tight"><span class="pill">Auswahl · ${C.keys.length}</span><span class="sub">Ziel-Qualität je Material (aus dem Plan vorbelegt)</span>
    <div class="wtsels">${selRows}</div>
    <div class="row2">${C.kinds.length > 1 ? `<span class="dim">Abbau mit:</span>${C.kinds.map(k => `<button class="k sm ${k === C.kind ? 'pri' : ''}" data-tk="${k}">${KINDL[k]}</button>`).join('')}<span style="width:12px"></span>` : ''}
      <span class="dim">Sortieren:</span>${[['mix', 'Beste Mischung'], ['near', 'Am nächsten']].map(([k, l]) => `<button class="k sm ${(t.sort || 'mix') === k ? 'pri' : ''}" data-ts="${k}">${l}</button>`).join('')}</div>
    <div class="row2"><span class="dim">Schiff für Flugzeit:</span>${ships}<span class="dim">Start: ${C.home ? '⌂ ' + esc(S.settings.home) : '<a href="#" id="tr-home">Home-Station festlegen</a>'}</span></div>
    ${C.other.length ? `<div class="hint">Nicht mit ${KINDL[C.kind]}-Mining abbaubar: <b>${C.other.map(m => esc(m.key)).join(', ')}</b> – dafür oben auf ${C.kinds.filter(k => k !== C.kind).map(k => KINDL[k]).join(' / ')} umschalten.</div>` : ''}
    ${C.bestRef && C.bestRef.b ? `<div class="wbest">Beste Raffinerie für diese Mischung: <b>${esc(C.bestRef.name)}</b>${locMark(C.bestRef.name)} (${esc(C.bestRef.sys)}) – im Schnitt <b>${tBon(C.bestRef.b)}</b> Ertrag.</div>` : ''}</div>`;
  h += `<div class="win tight"><span class="pill">Beste Orte</span><span class="sub">${C.use.length} Materialien · ${C.list.length} Orte</span>
    ${R.map((L, i) => `<div class="wtrip"><div class="wth"><span class="wtn">${i + 1}</span><b>${esc(L.loc)}</b>${locMark(L.loc)} <span class="dim">${esc(L.sys)} · ${esc(LOCT[L.type] || L.type || '')}</span>
        <span class="tag ${L.mats.length === C.use.length ? 'ok' : ''}">${L.mats.length} von ${C.use.length}</span>
        <span class="wtd">${L.gm != null ? `${tGm(L.gm)}${L.fly != null ? ' · ~' + fmtFly(L.fly) : ''}${range && L.gm * 2 > range ? ' · <span class="bad">⛽ hin+zurück reicht nicht</span>' : ''}` : `<span class="dim">${C.home ? 'Lage nicht in den Daten' : ''}</span>`}</span></div>
      <div class="wtm">${L.mats.map(x => `<span title="${esc(x.key)}: ${pctTxt(x.pct)} der Steine enthalten es, ${pctTxt(x.hit)} in Wunsch-Qualität"><i style="width:${Math.round(Math.min(1, x.rel) * 100)}%"></i><em>${esc(x.key)} <b>${pctTxt(x.hit)}</b></em></span>`).join('')}</div>
      <div class="dim wtx">${(e => e && e.hit < 5 ? `Engpass: <b>${esc(e.key)}</b> – grob jeder ${e.hit > 0 ? Math.max(1, Math.round(100 / e.hit)) : '∞'}. Stein in Wunsch-Qualität · ` : '')(L.mats.reduce((a, x) => !a || x.hit < a.hit ? x : a, null))}${L.mats.length < C.use.length ? `fehlt hier: ${C.use.filter(m => !L.mats.some(x => x.key === m.key)).map(m => esc(m.key)).join(', ')}` : 'alles da'}${L.ref ? ' · Raffinerie: ' + [L.ref.near ? `nächste <b>${esc(shortLoc(L.ref.near.name))}</b> (${tGm(L.ref.near.gm)}, ${tBon(L.ref.near.b)})` : '',
        L.ref.sysBest && (!L.ref.near || L.ref.sysBest.name !== L.ref.near.name) ? `beste in ${esc(L.sys)} <b>${esc(shortLoc(L.ref.sysBest.name))}</b> ${tBon(L.ref.sysBest.b)}` : ''].filter(Boolean).join(' · ') : ''}</div></div>`).join('')}
    ${C.list.length > 10 ? `<div class="row2"><button class="k sm" id="tr-all">${S.ui.tripAll ? 'Nur die besten 10' : 'Alle ' + C.list.length + ' Orte zeigen'}</button></div>` : ''}
    <div class="hint"><b>Balken</b> = wie gut der Ort für das Material ist, verglichen mit dem besten Ort dafür (voll = bester Ort). Die Zahl ist die Chance je Stein auf deine Wunsch-Qualität.<br>
      <b>Beste Mischung</b> zählt die Balken zusammen. <b>Am nächsten</b> nimmt erst die Orte mit den meisten Materialien, dann die kürzeste Strecke ab Home.<br>
      Entfernung = Luftlinie ab Home (zwischen Systemen über das Sprungtor), Flugzeit geschätzt ohne Sprungtunnel. Für Gürtel, L-Punkte und Asteroiden-Felder ohne festen Kartenpunkt steht keine Entfernung.</div>${dbSource()}</div>`;
  return h;
}
function bindTrip(el) {
  const t = S.ui.trip; if (!t) return;
  const re = () => { save(); renderDb(); };
  $$('[data-tm]', el).forEach(c => c.onclick = () => { const k = c.dataset.tm; if (t.mats[k] != null) delete t.mats[k]; else t.mats[k] = tripMissing()[k] ?? (S.ui.atlasQ || 900); re(); });
  $$('[data-tx]', el).forEach(c => c.onclick = () => { delete t.mats[c.dataset.tx]; re(); });
  $$('[data-tq]', el).forEach(s => s.onchange = () => { t.mats[s.dataset.tq] = +s.value; re(); });
  $$('[data-tk]', el).forEach(c => c.onclick = () => { t.kind = c.dataset.tk; re(); });
  $$('[data-ts]', el).forEach(c => c.onclick = () => { t.sort = c.dataset.ts; re(); });
  const g = (id, fn) => { const x = $('#' + id, el); if (x) x.onclick = fn; };
  g('tr-miss', () => { t.mats = tripMissing(); t.kind = null; re(); });
  g('tr-clear', () => { t.mats = {}; re(); });
  g('tr-pick', () => { S.ui.tripPick = !S.ui.tripPick; renderDb(); });
  g('tr-all', () => { S.ui.tripAll = !S.ui.tripAll; renderDb(); });
  g('tr-home', e => { e.preventDefault(); goTab('orte'); });
  const sh = $('#tr-ship', el); if (sh) sh.onchange = () => { t.ship = sh.value || null; re(); };
}
