'use strict';
/* Pliskin Industrie – Katalog: alle Blueprints nach Kategorien, mit Bild, Status (erspielbar?) und Werten
   (Basis, Q0, Q500, Q1000 und frei per Regler). Wird in „Datenbank → Blueprints“ und in „Bauteil zum Plan“ benutzt.
   Daten: data/katalog.json (katalog_export.py: Rezepte, Werte, Missionen, Bilder – alles aus den Spieldaten).
   Bilder: data/modelle/ – selbst berechnet aus den Spieldaten (werkzeuge/modell_*.py + Bildrechner), je Skin und je ganzem Set. */

let K = null, K_LOADING = null;
function kInit() {
  if (K) return Promise.resolve(K);
  if (!K_LOADING) K_LOADING = Promise.all([fetch('data/katalog.json').then(r => r.json()), typeof wInit === 'function' ? wInit() : null]).then(([j]) => { K = j; return K; })
    .catch(() => { K = { items: {}, version: '' }; return K; });
  return K_LOADING;
}
const KG = [['w', '🔫 Waffen'], ['a', '🛡 Rüstung'], ['t', '🔧 Werkzeuge'], ['s', '🚀 Schiffsteile'], ['x', '📦 Sonstiges']];
const KST = { start: '★ Start-Blueprint', miss: '🎯 Mission', event: '⏳ nur Event', none: '⛔ nicht erspielbar', nocraft: '⛔ nicht craftbar' };
const KST_HELP = {
  start: 'Hat jeder von Anfang an.', miss: 'Gibt es als Belohnung aus Missionen (siehe Links).',
  event: 'Hängt an einem Missions-Pool, für den es derzeit keine aktive Mission gibt – meist nur während eines Events.',
  none: 'Hängt in Patch ' + '4.10.2' + ' an keiner Mission – derzeit nicht erspielbar (Blueprint ist im Spiel, aber nicht zu bekommen).',
  nocraft: 'Gibt es im Spiel (Shop, Beute, Belohnung oder Event), aber in Patch 4.10.2 ohne Blueprint – kann nicht gecraftet werden. Steht hier, damit du siehst, was es gibt.' };
const KLASSE = { Light: 'Leicht', Medium: 'Mittel', Heavy: 'Schwer' };
const kOf = id => (K && K.items[id]) || kGuess(id);
// Fallback, falls ein Blueprint in katalog.json fehlt
function kGuess(id) {
  const b = BP[id] || {};
  const g = /^FPSWeapons/.test(b.category) && b.type === 'WeaponPersonal' ? 'w' : /^FPSArmours/.test(b.category) ? 'a' : /^Vehicle/.test(b.category) ? 's' : 'x';
  return { g, c: b.type_de || b.type || 'Sonstiges', d: '', r: '', mk: b.maker, sz: b.size, gr: b.grade ? 'ABCD'[b.grade - 1] : '', st: (b.pools || []).length ? 'miss' : 'none', s: [] };
}
const kName = id => (BP[id] && BP[id].name) || (K && K.items[id] && K.items[id].n) || id;
// alle Einträge: Blueprints + nicht craftbare Teile aus den Spieldaten (K.nc)
const K_HIDE = new Set([]);   // Typen, die im Katalog ausgeblendet werden (Tankstutzen sind wieder drin: Missions-Belohnung)
const K_HIDE_ID = new Set(['BP_CRAFT_TOAG_LaserGatling_S2']);   // Thlilye (Mirai-Pulse-Waffe): in 4.10.2 nicht erspielbar → vorerst raus (Wunsch Lony Pliskin 22.10.)
const kAll = () => ((K && K.nc && K.nc.length) ? R.blueprints.concat(K.nc) : R.blueprints).filter(b => !K_HIDE.has(b.type) && !K_HIDE_ID.has(b.id));
const kCraft = id => !!BP[id];
let K_AX = null;
function kArmorIndex() {   // wie armorIndex() in app.js, aber inkl. nicht craftbarer Teile
  if (K_AX) return K_AX;
  const g = {};
  for (const b of kAll()) {
    const w = ARMOR_PW[b.type]; if (!w) continue;
    const m = (b.name || '').match(new RegExp('^(.*?)\\s+' + w + '(?:\\s+(.*))?$')); if (!m) continue;
    const a = m[1].trim(), set = (m[2] || '').trim().replace(/^Base$/i, '') || 'Standard';
    ((g[a] = g[a] || {})[set] = g[a][set] || {})[b.type] = b.id;
  }
  const body = sets => Object.values(sets).some(p => p.Char_Armor_Torso || p.Char_Armor_Arms || p.Char_Armor_Legs);
  // reine Helm-Reihen wie „Morozov-SH-S Helmet Crusader Edition“: Helmform der Rüstung „Morozov-SH“ -> fehlenden Helm im gleichen Skin ergänzen
  for (const [a, sets] of Object.entries(g)) {
    if (body(sets)) continue;
    const base = Object.keys(g).filter(x => x !== a && a.startsWith(x + '-') && body(g[x])).sort((x, y) => y.length - x.length)[0];
    if (base) for (const [s, p] of Object.entries(sets)) if (p.Char_Armor_Helmet && g[base][s] && !g[base][s].Char_Armor_Helmet) g[base][s].Char_Armor_Helmet = p.Char_Armor_Helmet;
  }
  return K_AX = Object.fromEntries(Object.entries(g).filter(([, sets]) => body(sets)));
}
const kBase = n => String(n).replace(/\s*["“„”'][^"“„”']+["“„”']\s*/g, ' ').replace(/\s+/g, ' ').trim();   // Waffen-Skins zusammenfassen
const kImg = (k, cls = '') => k && k.img ? `<img class="${cls}" src="data/${esc(k.img)}" loading="lazy" alt="">` : `<div class="kno ${cls}">Bild folgt</div>`;
// Set-Bild (ganzes Set auf einer Figur): Unteranzug laut Einstellung neutral (n) oder passend (m)
const kSetImg = (armor, set) => { const x = K && K.sets && K.sets[armor + '|' + set]; if (!x) return null; return { img: (S.settings.suit === 'm' && x.m) || x.n, mine: 1 }; };
const kCredit = k => k && k.img && k.mine ? `<div class="ksrc">Bild: eigene Berechnung aus den Spieldaten · Patch ${esc((K && K.version || '').split('-')[0] || '?')}</div>`
  : !k || !k.img ? '<div class="ksrc">Bild wird noch berechnet</div>'
  : `<div class="ksrc">Bild: ${k.src ? `<a href="${esc(k.src)}" target="_blank" rel="noopener">${esc(k.by || 'unknown')}</a>` : esc(k.by || 'unknown')} · ${esc(k.lic || 'unknown')} · ${esc(k.from || 'starcitizen.tools')}${k.imgOf ? ' · zeigt ' + esc(k.imgOf) : ''}</div>`;
const kBadges = (id, st) => `${isOwned(id) ? '<span class="kb own">✓ hab ich</span>' : ''}<span class="kb ${st}">${KST[st]}</span>`;

/* ---------- Werte und Qualität ---------- */
// [Bezeichnung, Einheit, Nachkommastellen, Qualitäts-Eigenschaften, kleiner ist besser, additiv]
const KSTAT = {
  dmg: ['Schaden je Schuss', '', 1, ['Weapon_Damage']], pel: ['Projektile je Schuss', '', 0], rpm: ['Feuerrate', ' /min', 0, ['Weapon_FireRate']],
  dps: ['Schaden pro Sekunde', '', 0, ['Weapon_Damage', 'Weapon_FireRate']], mag: ['Magazin', '', 0], rng: ['Reichweite', ' m', 0], spd: ['Geschoss-Tempo', ' m/s', 0],
  rec: ['Rückstoß', ' %', 0, ['Weapon_Recoil_Kick'], 1], dtyp: ['Schadens-Art', '', 0],
  red: ['Schadens-Reduktion', ' %', 1, ['Armor_DamageMitigation']], tmin: ['Kälteschutz bis', ' °C', 0, ['Armor_TemperatureMin'], 1],
  tmax: ['Hitzeschutz bis', ' °C', 0, ['Armor_TemperatureMax']], rad: ['Strahlungs-Speicher', '', 0], radd: ['Strahlungs-Abbau', ' /s', 1, ['Armor_RadiationDissipation']],
  inv: ['Stauraum', ' SCU', 3], mass: ['Gewicht', ' kg', 1],
  cool: ['Kühlleistung', '', 0, ['ItemResource_CoolantGeneration']], pow: ['Energie (Segmente)', '', 0, ['ItemResource_PowerGeneration'], 0, 1],
  shp: ['Schild-HP', '', 0, ['Shield_MaxHealth']], sreg: ['Schild-Regeneration', ' /s', 0], qspd: ['Quantum-Tempo', ' Gm/s', 0, ['Quantum_Speed']],
  qfuel: ['Quantum-Verbrauch', '', 2, ['Quantum_FuelRequirement'], 1], qspool: ['Hochfahren', ' s', 1], qcd: ['Abkühlen', ' s', 1],
  aimmin: ['Zielhilfe ab', ' m', 0, ['Radar_MinAimAssistDistance']], aimmax: ['Zielhilfe bis', ' m', 0, ['Radar_MaxAimAssistDistance']],
  mpow: ['Laserleistung', '', 0, ['Weapon_Damage']], mrng: ['Optimale Reichweite', ' m', 0],
  tforce: ['Zugkraft', '', 0, ['Weapon_Tractor_Force']], tmaxd: ['Max. Reichweite', ' m', 0, ['Weapon_Tractor_MaxDist']],
  tfull: ['Volle Kraft bis', ' m', 0, ['Weapon_Tractor_FullStrengthDist']], tvol: ['Max. Volumen', '', 0, ['Weapon_Tractor_MaxVolume']],
  seff: ['Abtrage-Effizienz', ' %', 0, ['Weapon_HullScraping_Efficiency']], srad: ['Abtrage-Radius', ' m', 1, ['Weapon_HullScraping_Radius']], sspd: ['Abtrage-Tempo', '', 2, ['Weapon_HullScraping_Speed']],
  hp: ['Haltbarkeit', '', 0, ['Health_MaxHealth']], pwr: ['Strombedarf', '', 1] };
// Faktor einer Eigenschaft bei Qualität q: je Rezept-Teil der passende Abschnitt (Q0–500 / 501–1000 …), Teile werden multipliziert (Energie: addiert)
function kFactor(bp, props, q, add) {
  let f = add ? 0 : 1;
  for (const sl of slotsOf(bp)) for (const p of props) {
    const ms = (sl.mods || []).filter(m => m.prop === p); if (!ms.length) continue;
    const m = ms.find(x => q >= x.q0 && q <= x.q1) || ms.reduce((a, x) => Math.abs(q - (x.q0 + x.q1) / 2) < Math.abs(q - (a.q0 + a.q1) / 2) ? x : a);
    const v = modAt(m, q); f = add ? f + v : f * v;
  }
  return f;
}
const kHasQ = (bp, props) => !!props && slotsOf(bp).some(sl => (sl.mods || []).some(m => props.includes(m.prop)));
function kVal(bp, key, base, q) {
  const d = KSTAT[key]; if (!d || !d[3] || typeof base !== 'number') return base;
  return d[5] ? base + kFactor(bp, d[3], q, true) : base * kFactor(bp, d[3], q, false);
}
const kFmt = (key, v) => { const d = KSTAT[key] || ['', '', 1]; return typeof v === 'number' ? F(v, d[2]) + d[1] : esc(v ?? '–'); };
function kStatTable(id, q) {
  const bp = BP[id], k = kOf(id), rows = (k.s || []).filter(([key]) => KSTAT[key]);
  if (!rows.length) return '<div class="hint">Für dieses Teil liegen keine Werte vor.</div>';
  const cell = (key, base, qq, cls) => {
    const v = kVal(bp, key, base, qq); if (typeof v !== 'number' || typeof base !== 'number') return `<td class="${cls}">${kFmt(key, v)}</td>`;
    const lower = KSTAT[key][4], better = lower ? v < base - 1e-9 : v > base + 1e-9, worse = lower ? v > base + 1e-9 : v < base - 1e-9;
    return `<td class="${cls} ${better ? 'kup' : worse ? 'kdn' : ''}">${kFmt(key, v)}</td>`;
  };
  return `<table class="ptab ktab"><tr><th class="l">Wert</th><th>Basis</th><th>Q 0</th><th>Q 500</th><th>Q 1000</th><th class="kq">Q ${q}</th></tr>
    ${rows.map(([key, base]) => { const qd = kHasQ(bp, KSTAT[key][3]);
      return `<tr><td class="l">${esc(KSTAT[key][0])}</td><td>${kFmt(key, base)}</td>${qd ? cell(key, base, 0, '') + cell(key, base, 500, '') + cell(key, base, 1000, '') + cell(key, base, q, 'kq')
        : `<td colspan="4" class="dim" style="text-align:center">ändert sich nicht mit der Qualität</td>`}</tr>`; }).join('')}</table>`;
}

/* ---------- Ansicht ---------- */
// ctx: { el, plan (optional: fester Ziel-Plan), modal (bool), F (Filter), sel (gewählte Karte), q }
function kNewCtx(el, plan, preset) {
  return { el, plan, modal: !!plan, sel: null, pick: null, q: plan ? S.settings.defaultQ : (S.settings.defaultQ || 500), n: 1,
    F: { g: 'w', c: new Set(), d: new Set(), r: new Set(), sz: new Set(), gr: new Set(), mk: new Set(), part: 'set', own: 'all', play: 'all', text: preset || '', ship: null, more: false } };
}
let KCTX = null;
function renderCatalog(el, ctx) {
  if (!K) { el.innerHTML = '<div class="empty">Lade Katalog …</div>'; kInit().then(() => renderCatalog(el, ctx)); return; }
  if (!ctx) { if (!KCTX) KCTX = kNewCtx(el); ctx = KCTX; ctx.el = el; }
  const narrow = window.MOBILE || el.clientWidth < 1000;
  ctx.narrow = narrow;
  if (narrow && ctx.sel) { el.innerHTML = `<div class="kwrap one"><div class="kdet">${kDetail(ctx)}</div></div>`; kBindDetail(ctx); return; }
  el.innerHTML = `<div class="kwrap ${narrow ? 'one' : ''}">
    <div class="kflt">${kFilters(ctx)}</div>
    <div class="klst">${kList(ctx)}</div>
    ${narrow ? '' : `<div class="kdet">${ctx.sel ? kDetail(ctx) : '<div class="kempty">← Etwas antippen: Bild, Werte mit Qualitäts-Regler, Skins, Status und „Zum Plan“.</div>'}</div>`}</div>`;
  kBindFilters(ctx); kBindList(ctx); if (!narrow && ctx.sel) kBindDetail(ctx);
}
const kTop = ctx => { try { [ctx.el.closest('.box'), $('#scr'), $('#m-view'), document.scrollingElement].forEach(x => { if (x) x.scrollTop = 0; }); } catch (e) { /* egal */ } };
const kRe = ctx => { const sc = ctx.el.querySelector('.klst'), t = sc ? sc.scrollTop : 0; renderCatalog(ctx.el, ctx); const n = ctx.el.querySelector('.klst'); if (n) n.scrollTop = t; };

/* Blueprints einer Gruppe, gefiltert nach Status und Text (Basis für Filter-Knöpfe + Liste) */
function kPool(ctx, g) {
  const F = ctx.F, inPlan = new Set(S.plans.flatMap(p => p.items.filter(i => i.bp).map(i => i.bp)));
  const words = F.text.toLowerCase().split(/\s+/).filter(Boolean);
  const fits = F.ship && g === 's' ? shipFits(F.ship) : null;
  return kAll().filter(b => {
    const k = kOf(b.id); if (k.g !== g) return false;
    if (F.own === 'own' && !isOwned(b.id)) return false;
    if (F.own === 'miss' && isOwned(b.id)) return false;
    if (F.own === 'plan' && !inPlan.has(b.id)) return false;
    if (F.play === 'yes' && !['miss', 'start'].includes(k.st)) return false;   // erspielbar: Mission oder Start-Blueprint
    if (F.play === 'no' && ['miss', 'start'].includes(k.st)) return false;     // nicht erspielbar: nur Event oder (noch) gar nicht
    if (fits && !fits(b)) return false;
    if (words.length) { const h = (b.name + ' ' + (k.c || '') + ' ' + (k.d || '') + ' ' + (k.r || '') + ' ' + (k.mk || '') + ' s' + (k.sz ?? '')).toLowerCase(); if (!words.every(w => h.includes(w))) return false; }
    return true;
  });
}
const KPARTS = [['set', 'Ganze Sets'], ['Char_Armor_Helmet', 'Helme'], ['Char_Armor_Torso', 'Torso'], ['Char_Armor_Arms', 'Arme'], ['Char_Armor_Legs', 'Beine'], ['Char_Armor_Backpack', 'Rucksäcke'], ['Char_Armor_Undersuit', 'Unteranzüge']];
function kFilters(ctx) {
  const F = ctx.F, chip = (k, v, l, n) => `<span data-kf="${k}" data-v="${esc(v)}" class="${F[k].has(k === 'sz' ? +v : v) ? 'on' : ''}">${esc(l)}${n != null ? `<small>${n}</small>` : ''}</span>`;
  const pool = kPool(ctx, F.g);
  // Zähler: bei Waffen je Grundwaffe (Skins zählen nicht extra)
  const cnt = (key, list) => { const c = {}, seen = new Set(); list.forEach(b => { const v = kOf(b.id)[key]; if (v == null || v === '') return; if (F.g === 'w') { const u = v + '|' + kBase(b.name); if (seen.has(u)) return; seen.add(u); } c[v] = (c[v] || 0) + 1; }); return c; };
  const chips = (key, label, list, order) => {
    const c = cnt(key, list); let keys = Object.keys(c);
    keys = order ? order.filter(o => keys.includes(String(o))).map(String) : keys.sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
    [...F[key]].forEach(v => { if (!keys.includes(String(v))) F[key].delete(v); });
    if (key === 'mk' && keys.length > 14 && !F.mk.size && !F.showMk) return `<div class="flbl">Hersteller</div><div class="fchips"><span data-kmk="1">${keys.length} Hersteller zeigen ▾</span></div>`;   // Knopf ohne Treffer fällt weg
    return keys.length > 1 || F[key].size ? `<div class="flbl">${label}</div><div class="fchips">${keys.map(v => chip(key, v, key === 'sz' ? 'S' + v : (key === 'd' && F.g === 'a' ? KLASSE[v] || v : v), c[v])).join('')}</div>` : '';
  };
  let h = `<div class="fchips kgrp">${KG.map(([g, l]) => `<span data-kg="${g}" class="${F.g === g ? 'on' : ''}">${l}</span>`).join('')}</div>
    <div class="search" style="margin:8px 0 0"><input id="kf-q" placeholder="Name, Hersteller …" value="${esc(F.text)}"></div>
    <div class="fchips" style="margin-top:8px">${[['all', 'Alle'], ['own', 'Hab ich'], ['miss', 'Fehlen'], ['plan', 'In Plänen']].map(([k, l]) => `<span data-ko="${k}" class="${F.own === k ? 'on' : ''}">${l}</span>`).join('')}</div>
    <div class="fchips" style="margin-top:6px">${[['all', 'Alle'], ['yes', '🎯 Erspielbar'], ['no', '⛔ Nicht erspielbar']].map(([k, l]) => `<span data-kpl="${k}" class="${F.play === k ? 'on' : ''}" title="${k === 'no' ? 'Nur bei Events oder derzeit gar nicht zu bekommen – kommt evtl. später' : k === 'yes' ? 'Über Missionen erspielbar oder Start-Blueprint' : ''}">${l}</span>`).join('')}</div>`;
  if (ctx.narrow && !F.more) return h + `<div class="row2" style="margin-top:6px"><button class="k sm" id="kf-more">Filter ▾${F.c.size + F.d.size + F.r.size + F.sz.size + F.gr.size ? ' (' + (F.c.size + F.d.size + F.r.size + F.sz.size + F.gr.size) + ')' : ''}</button></div>`;
  if (F.g === 'w') h += chips('c', 'Waffen-Art', pool) + chips('d', 'Schadens-Art', pool, ['Ballistisch', 'Laser', 'Plasma', 'Elektron', 'Energie']) + chips('mk', 'Hersteller', pool);
  if (F.g === 'a') {
    const list = F.part === 'set' ? pool.filter(b => ['Char_Armor_Torso', 'Char_Armor_Arms', 'Char_Armor_Legs'].includes(b.type)) : pool.filter(b => b.type === F.part);
    h += `<div class="flbl">Anzeigen</div><div class="fchips">${KPARTS.map(([v, l]) => `<span data-kp="${v}" class="${F.part === v ? 'on' : ''}">${l}</span>`).join('')}</div>`
      + chips('d', 'Klasse', list, ['Light', 'Medium', 'Heavy']) + chips('r', 'Einsatz', list);
  }
  if (F.g === 's') {
    h += `<div class="flbl">Schiff (optional)</div><div class="search" style="margin:0"><input id="kf-ship" placeholder="z. B. „Zeus ES“, „Golem“" autocomplete="off" value=""></div>
      <div class="fchips" id="kf-shiphits" style="margin-top:6px"></div>${F.ship ? `<div class="fslots"><b>${esc(F.ship.name)}</b> <button class="k sm" id="kf-noship">✕</button><br>${F.ship.slots.map(s => `<span>${esc((PICK_TYPES.find(([t]) => t === s.type) || [0, s.type])[1])} S${s.size}${s.n > 1 ? ' ×' + s.n : ''}</span>`).join(' ')}</div>` : ''}`
      + chips('c', 'Komponente', pool) + (F.ship ? '' : chips('sz', 'Größe', pool, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])) + chips('d', 'Klasse', pool) + chips('gr', 'Grade', pool, ['A', 'B', 'C', 'D'])
      + (F.c.size === 1 && [...F.c][0] === 'Waffe' || pool.every(b => kOf(b.id).c === 'Waffe') ? chips('r', 'Waffen-Art', pool.filter(b => kOf(b.id).c === 'Waffe')) : '');
  }
  if (F.g === 'x' || F.g === 't') h += chips('c', 'Art', pool);
  if (ctx.narrow) h += `<div class="row2"><button class="k sm" id="kf-more">Filter ▴ zuklappen</button></div>`;
  return h;
}
function kBindFilters(ctx) {
  const el = ctx.el, F = ctx.F, re = () => { ctx.lim = 0; kRe(ctx); };
  $$('[data-kg]', el).forEach(c => c.onclick = () => { F.g = c.dataset.kg; ['c', 'd', 'r', 'sz', 'gr', 'mk'].forEach(k => F[k].clear()); ctx.sel = null; re(); });
  $$('[data-kmk]', el).forEach(c => c.onclick = () => { F.showMk = true; re(); });
  $$('[data-ko]', el).forEach(c => c.onclick = () => { F.own = c.dataset.ko; re(); });
  $$('[data-kp]', el).forEach(c => c.onclick = () => { F.part = c.dataset.kp; F.d.clear(); F.r.clear(); re(); });
  $$('[data-kf]', el).forEach(c => c.onclick = () => { const s = F[c.dataset.kf], v = c.dataset.kf === 'sz' ? +c.dataset.v : c.dataset.v; s.has(v) ? s.delete(v) : s.add(v); re(); });
  $$('[data-kpl]', el).forEach(c => c.onclick = () => { F.play = c.dataset.kpl; re(); });
  const mo = $('#kf-more', el); if (mo) mo.onclick = () => { F.more = !F.more; re(); };
  const q = $('#kf-q', el);
  if (q) q.oninput = () => { F.text = q.value; clearTimeout(q.t); q.t = setTimeout(() => { re(); const n = $('#kf-q', ctx.el); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); };
  const ns = $('#kf-noship', el); if (ns) ns.onclick = () => { F.ship = null; F.c.clear(); re(); };
  const si = $('#kf-ship', el);
  if (si) si.oninput = async () => {
    const ships = await loadShips(), w = si.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const hits = w.length ? ships.filter(s => w.every(x => s.name.toLowerCase().includes(x))).slice(0, 10) : [];
    $('#kf-shiphits', el).innerHTML = hits.map(s => `<span data-kship="${esc(s.id)}">${esc(s.name)}</span>`).join('') || (w.length ? '<span class="off">kein Schiff gefunden</span>' : '');
    $$('[data-kship]', el).forEach(c => c.onclick = () => { F.ship = ships.find(s => s.id === c.dataset.kship); F.sz.clear(); re(); });
  };
}
/* Liste: Karten, nach Kategorie gruppiert; Waffen-Skins und Rüstungs-Sets je eine Karte */
function kEntries(ctx) {
  const F = ctx.F, ok = b => { const k = kOf(b.id);
    return (!F.c.size || F.c.has(k.c)) && (!F.d.size || F.d.has(k.d)) && (!F.r.size || F.r.has(k.r)) && (!F.sz.size || F.sz.has(k.sz)) && (!F.gr.size || F.gr.has(k.gr)) && (!F.mk.size || F.mk.has(k.mk)); };
  const pool = kPool(ctx, F.g).filter(ok), out = [];
  const setOrder = (a, b) => (b === 'Standard') - (a === 'Standard') || a.localeCompare(b, 'de', { numeric: true });
  if (F.g === 'a' && F.part === 'set') {   // je Rüstung eine Karte (Standard-Farbe), Skins = Sets
    const AX = kArmorIndex(), ids = new Set(pool.map(b => b.id));
    for (const [armor, sets] of Object.entries(AX)) {
      const names = Object.keys(sets).filter(n => Object.values(sets[n]).some(id => ids.has(id))).sort(setOrder);   // auch Skins, die es nur als Helm oder Beine gibt
      if (!names.length) continue;
      const P0 = sets[names[0]], main = P0.Char_Armor_Torso || P0.Char_Armor_Arms || P0.Char_Armor_Legs || Object.values(P0)[0], k = kOf(main);
      out.push({ key: 'arm:' + armor, kind: 'set', title: armor, sub: [KLASSE[k.d] || k.d, k.r, names.length > 1 ? names.length + ' Skins' : ''].filter(Boolean).join(' · '),
        cat: (KLASSE[k.d] || k.d || 'Sonstige') + ' Rüstung', ids: names.flatMap(n => Object.values(sets[n])), armor, sets, names,
        img: kSetImg(armor, names[0]) || k });
    }
  } else if (F.g === 'a') {   // Einzelteile: je Rüstung + Teil eine Karte, Skins = Sets
    const w = ARMOR_PW[F.part], g = {};
    pool.filter(b => b.type === F.part).forEach(b => {
      const m = w && (b.name || '').match(new RegExp('^(.*?)\\s+' + w + '(?:\\s+(.*))?$'));
      const base = m ? m[1].trim() + ' ' + w : b.name, skin = m ? ((m[2] || '').trim().replace(/^Base$/i, '') || 'Standard') : 'Standard';
      (g[base] = g[base] || []).push({ id: b.id, label: skin });
    });
    for (const [base, sk] of Object.entries(g)) {
      sk.sort((a, b) => setOrder(a.label, b.label)); const k = kOf(sk[0].id);
      out.push({ key: 'p:' + base, kind: 'w', title: base, sub: [KLASSE[k.d] || k.d, k.r, sk.length > 1 ? sk.length + ' Skins' : ''].filter(Boolean).join(' · '),
        cat: KPARTS.find(p => p[0] === F.part)[1], ids: sk.map(x => x.id), skins: sk, img: k });
    }
  } else if (F.g === 't') {   // Werkzeuge: je Gerät (Art) eine Karte, Varianten als Skins
    const g = {}; pool.forEach(b => (g[kOf(b.id).c] = g[kOf(b.id).c] || []).push(b.id));
    for (const [art, ids] of Object.entries(g)) {
      const sk = ids.map(i => ({ id: i, label: kName(i).replace(/\s*(Multi-Tool|Medical Device|Tractor Beam)$/, '') })).sort((a, b) => a.label.length - b.label.length || a.label.localeCompare(b.label, 'de')), k = kOf(sk[0].id);
      out.push({ key: 't:' + art, kind: 'w', title: kName(sk[0].id), sub: [art, k.mk, ids.length > 1 ? ids.length + ' Varianten' : ''].filter(Boolean).join(' · '), cat: 'Werkzeuge', ids: sk.map(x => x.id), skins: sk, img: k });
    }
  } else if (F.g === 'w') {   // je Grundwaffe eine Karte, Skins = Varianten
    const g = {}; pool.forEach(b => (g[kBase(b.name)] = g[kBase(b.name)] || []).push(b.id));
    for (const [base, ids] of Object.entries(g)) {
      const sk = ids.map(i => ({ id: i, label: (kName(i).match(/["“„]([^"“„”]+)["”“]/) || [0, 'Standard'])[1] })).sort((a, b) => setOrder(a.label, b.label)), k = kOf(sk[0].id);
      out.push({ key: 'w:' + base, kind: 'w', title: base, sub: [k.mk, k.d, ids.length > 1 ? ids.length + ' Skins' : ''].filter(Boolean).join(' · '), cat: k.c || 'Sonstige', ids: sk.map(x => x.id), skins: sk, img: k });
    }
  } else pool.forEach(b => { const k = kOf(b.id); out.push({ key: b.id, kind: 'one', title: b.name.replace(/^(Mil|Civ|Ind|Sth|Cmp|Com)\/\d\/[A-D]\s+/, ''), sub: [k.sz != null ? 'S' + k.sz : '', k.gr ? 'Grade ' + k.gr : '', k.d, k.r || k.mk].filter(Boolean).join(' · '), cat: k.c || 'Sonstige', ids: [b.id], img: k }); });
  // Status einer Karte = bester Status ihrer Teile
  const rank = ['start', 'miss', 'event', 'none', 'nocraft'];
  out.forEach(e => { e.own = e.ids.some(isOwned); e.st = rank.find(s => e.ids.some(i => kOf(i).st === s)) || 'none'; });
  const catOrder = F.g === 'a' && F.part === 'set' ? ['Schwer Rüstung', 'Mittel Rüstung', 'Leicht Rüstung'] : null;
  return out.sort((a, b) => (catOrder ? catOrder.indexOf(a.cat) - catOrder.indexOf(b.cat) : a.cat.localeCompare(b.cat, 'de')) || a.title.localeCompare(b.title, 'de', { numeric: true }));
}
function kList(ctx) {
  const E = kEntries(ctx), lim = ctx.lim || 120; ctx.E = E;
  if (!E.length) return '<div class="empty">Nichts gefunden – Filter lockern.</div>';
  let h = `<div class="flbl" style="margin-top:0">${E.length} Einträge</div>`, cat = null, grid = false;
  E.slice(0, lim).forEach(e => {
    if (e.cat !== cat) { if (grid) h += '</div>'; cat = e.cat; h += `<h4 class="kcat">${esc(cat.replace('Schwer Rüstung', 'Schwere Rüstung').replace('Mittel Rüstung', 'Mittlere Rüstung').replace('Leicht Rüstung', 'Leichte Rüstung'))} <small>· ${E.filter(x => x.cat === cat).length}</small></h4><div class="kgrid">`; grid = true; }
    h += `<div class="kcard ${(e.st === 'none' || e.st === 'nocraft') && !e.own ? 'dead' : ''} ${ctx.sel === e.key ? 'sel' : ''}" data-kk="${esc(e.key)}"><div class="kbd">${e.own ? '<span class="kb own">✓ hab ich</span>' : ''}<span class="kb ${e.st}">${KST[e.st]}</span></div>
      <div class="kim">${kImg(e.img)}</div><div class="knm">${esc(e.title)}</div><div class="ksub">${esc(e.sub)}</div></div>`;
  });
  if (grid) h += '</div>';
  if (E.length > lim) h += `<div class="row2"><button class="k sm" id="kl-more">Weitere ${Math.min(120, E.length - lim)} zeigen (${E.length - lim} übrig)</button></div>`;
  return h;
}
function kBindList(ctx) {
  $$('[data-kk]', ctx.el).forEach(c => c.onclick = () => { ctx.sel = c.dataset.kk; ctx.pick = null; ctx.part = null; ctx.helm = 0; kRe(ctx); if (ctx.narrow) kTop(ctx); });
  const m = $('#kl-more', ctx.el); if (m) m.onclick = () => { ctx.lim = (ctx.lim || 120) + 120; kRe(ctx); };
}
/* Detail */
function kDetail(ctx) {
  const e = (ctx.E || kEntries(ctx)).find(x => x.key === ctx.sel) || kEntries(ctx).find(x => x.key === ctx.sel);
  if (!e) { ctx.sel = null; return '<div class="kempty">Nicht mehr in der Liste.</div>'; }
  ctx.e = e;
  const back = ctx.narrow ? '<button class="k sm" id="kd-back">← zurück zur Liste</button>' : '';
  let id, h = back;
  if (e.kind === 'set') {
    const sn = ctx.pick && e.names.includes(ctx.pick) ? ctx.pick : e.names[0]; ctx.pick = sn;
    const KS = (K.sets || {})[e.armor + '|' + sn] || {}, hs = KS.h || [], hi = hs[ctx.helm] && hs[ctx.helm].n ? ctx.helm : 0;   // Helmformen (z. B. Morozov-SH / -SH-C / -SH-S)
    const P = hi ? Object.assign({}, e.sets[sn], { Char_Armor_Helmet: hs[hi].id }) : e.sets[sn]; e.parts = P; e.set = sn; e.setIds = Object.values(P);
    id = ctx.part && e.setIds.includes(ctx.part) ? ctx.part : (P.Char_Armor_Torso || P.Char_Armor_Arms || e.setIds[0]); ctx.part = id;
    const hImg = y => ({ img: (S.settings.suit === 'm' && y.m) || y.n, mine: 1 });
    const hero = (hi ? hImg(hs[hi]) : kSetImg(e.armor, sn)) || kOf(id), fill = KS.fill || [];
    const helmTxt = hs.length > 1 ? `<div class="flbl">Helmform · ${hs.length} – gleicher Skin, andere Helm-Form</div><div class="kskins">${hs.map((y, i) => y.n ? `<div data-khelm="${i}" class="${i === hi ? 'on' : ''}">${kImg(hImg(y), 'xs')}<span>${esc(y.f)}${isOwned(y.id) ? ' ✓' : ''}</span></div>` : '').join('')}</div>` : '';
    const fillTxt = fill.length ? `<div class="hint" style="margin-top:2px">${fill.map(t => (SET_PARTS.find(x => x[0] === t) || [0, t])[1]).join(', ')} gibt es in diesem Skin nicht – im Bild vom Standard-Set ergänzt.</div>` : '';
    h += `<div class="khero">${kImg(hero)}</div>${kCredit(hero)}${fillTxt}
      <div class="ktitle">${esc(e.armor)}${sn === 'Standard' ? '' : ' · ' + esc(sn)}</div><div class="dim">${esc(e.sub)}</div>
      ${e.names.length > 1 ? `<div class="flbl">Skin / Farbe · ${e.names.length}</div><div class="kskins">${e.names.map(n => { const own = Object.values(e.sets[n]).filter(isOwned).length;
        return `<div data-kskin="${esc(n)}" class="${n === sn ? 'on' : ''}">${kImg(kSetImg(e.armor, n), 'xs')}<span>${esc(n)}${own ? ' ✓' + own : ''}</span></div>`; }).join('')}</div>` : ''}${helmTxt}
      <div class="flbl">Teile – antippen zeigt die Werte</div><table class="ptab kparts">${SET_PARTS.map(([t, l]) => {
        const pid = P[t];
        if (pid) return `<tr class="${pid === id ? 'on' : ''}" data-kpart="${pid}"><td class="l">${kCraft(pid) ? `<label><input type="checkbox" data-kchk="${pid}" checked> ${l}</label>` : l}</td><td class="l">${esc(kName(pid))}</td><td class="l">${kBadges(pid, kOf(pid).st)}</td></tr>`;
        if (!SET_OPT.includes(t)) return `<tr><td class="l dim">${l}</td><td class="l dim" colspan="2">gibt es in diesem Set nicht</td></tr>`;
        const same = b => (b.name || '').endsWith(' ' + sn);
        const cls = kOf(e.setIds[0]).d;   // nur gleiche Rüstungsklasse anbieten (Unteranzug: alle)
        const opts = R.blueprints.filter(b => b.type === t && (ctx.F.own !== 'own' || isOwned(b.id)) && (t === 'Char_Armor_Undersuit' || !cls || !kOf(b.id).d || kOf(b.id).d === cls)).sort((a, b) => same(b) - same(a) || a.name.localeCompare(b.name));
        return `<tr><td class="l">${l} <span class="dim">· wahlweise</span></td><td class="l" colspan="2"><select data-kopt="${t}" style="width:100%"><option value="">— keiner —</option>${opts.map(b => `<option value="${b.id}">${esc(b.name)}${isOwned(b.id) ? '  ✓' : ''}</option>`).join('')}</select></td></tr>`;
      }).join('')}</table>`;
  } else if (e.kind === 'w') {
    id = ctx.pick && e.ids.includes(ctx.pick) ? ctx.pick : e.ids[0]; ctx.pick = id;
    const k = kOf(id);
    h += `<div class="khero">${kImg(k)}</div>${kCredit(k)}<div class="ktitle">${esc(kName(id))}</div><div class="dim">${esc([k.c, k.d, k.mk].filter(Boolean).join(' · '))}</div>
      ${e.skins.length > 1 ? `<div class="flbl">Skin / Farbe · ${e.skins.length}</div><div class="kskins">${e.skins.map(x => `<div data-kskin="${x.id}" class="${x.id === id ? 'on' : ''}">${kImg(kOf(x.id), 'xs')}<span>${esc(x.label)}${isOwned(x.id) ? ' ✓' : ''}</span></div>`).join('')}</div>` : ''}`;
  } else {
    id = e.ids[0]; const k = kOf(id);
    h += `<div class="khero">${kImg(k)}</div>${kCredit(k)}<div class="ktitle">${esc(e.title)}</div><div class="dim">${esc([k.c, e.sub].filter(Boolean).join(' · '))}</div>`;
  }
  ctx.id = id;
  const k = kOf(id), b = BP[id] || {};
  const own = isOwned(id), ownSrc = own && S.owned[id].src === 'log' ? 'laut Log' : own && S.owned[id].src === 'bild' ? 'per Erfassung' : 'von Hand';
  const setOpen = e.kind === 'set' ? e.setIds.filter(x => kCraft(x) && !isOwned(x)).length : 0;
  const ownRow = kCraft(id) ? `<div class="row2 kown" style="margin-top:6px">${own ? `<span class="tag ok">✓ hab ich · ${ownSrc}</span><button class="k sm x" id="kd-unown">Blueprint entfernen</button>`
    : `<button class="k sm pri" id="kd-own">✓ Blueprint hab ich</button>`}${setOpen ? `<button class="k sm" id="kd-ownset">✓ ganzes Set hab ich (${setOpen})</button>` : ''}</div>` : '';
  h += `${ownRow}<div class="row2" style="margin-top:6px">${kBadges(id, k.st)}</div><div class="hint" style="margin-top:2px">${KST_HELP[k.st]}${(k.ev || []).length ? ' Event: ' + k.ev.map(esc).join(', ') + '.' : ''}</div>
    ${(b.pools || []).filter(p => W && W.pools[p]).map(p => scLinks(p, 3)).join('')}
    ${!kCraft(id) ? `<div class="hint" style="margin-top:8px">Kein Blueprint → keine Rezept- und Qualitätswerte.</div>` : `<div class="flbl">Werte${e.kind === 'set' ? ' · ' + esc(kName(id)) : ''} · Basis und mit Material-Qualität</div>
    <div class="kqrow">Qualität <input type="range" id="kd-q" min="0" max="1000" step="10" value="${ctx.q}"><b id="kd-qv">${ctx.q}</b></div>
    <div id="kd-tab">${kStatTable(id, ctx.q)}</div>
    <div class="hint">Qualität = Material-Qualität beim Craften, für alle Rezept-Teile gleich angenommen. Faktoren aus dem Rezept (Spieldaten); mehrere Teile mit derselben Wirkung werden multipliziert (Annahme). Werte: Spieldaten, Patch ${esc(K.version || "?")}.</div>
    <div class="flbl">Rezept</div><div class="krez">${slotsOf(b).map(sl => `<div><b>${esc(sl.name)}</b>: ${sl.options.map(o => `${fmtAmt(o.qty, o.unit)} ${esc(resName(o.id))}${o.minQ ? ' ≥Q' + o.minQ : ''}`).join(' <span class="dim">oder</span> ')}</div>`).join('') || '<span class="dim">kein Rezept hinterlegt</span>'}</div>
    <div class="kadd">${ctx.plan ? `<span class="dim">→ Plan „${esc(ctx.plan.name)}“</span>` : `<select id="kd-plan">${S.plans.map(p => `<option value="${p.id}" ${p.id === S.ui.plan ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}<option value="_new">+ Neuer Plan …</option></select>`}
      <label>Anzahl <input id="kd-n" type="number" min="1" value="${ctx.n}" style="width:70px"></label><span class="dim">ab Q <b id="kd-qa">${ctx.q}</b> (Regler)</span>
      <button class="k pri" id="kd-add">${e.kind === 'set' ? '+ Set zum Plan' : '+ Zum Plan'}</button>${ctx.modal ? '' : ' <button class="k sm" id="kd-more">Rezept-Details / hab ich</button>'}</div>`}`;
  if (e.kind === 'set' && !kCraft(id) && e.setIds.some(kCraft)) h = h.replace('<div class="hint" style="margin-top:8px">Kein Blueprint', '<div class="hint" style="margin-top:8px">Dieses Teil: kein Blueprint');
  return h;
}
function kBindDetail(ctx) {
  const el = ctx.el, e = ctx.e; if (!e) return;
  const bk = $('#kd-back', el); if (bk) bk.onclick = () => { ctx.sel = null; kRe(ctx); kTop(ctx); };
  $$('[data-kskin]', el).forEach(d => d.onclick = () => { ctx.pick = d.dataset.kskin; ctx.helm = 0; kRe(ctx); });
  $$('[data-khelm]', el).forEach(d => d.onclick = () => { ctx.helm = +d.dataset.khelm; ctx.part = null; kRe(ctx); });
  $$('[data-kpart]', el).forEach(r => r.onclick = ev => { if (ev.target.closest('input,select,label')) return; ctx.part = r.dataset.kpart; kRe(ctx); });
  const q = $('#kd-q', el);
  if (q) q.oninput = () => { ctx.q = +q.value; $('#kd-qv', el).textContent = ctx.q; $('#kd-qa', el).textContent = ctx.q; $('#kd-tab', el).innerHTML = kStatTable(ctx.id, ctx.q); };
  const n = $('#kd-n', el); if (n) n.oninput = () => { ctx.n = Math.max(1, Math.round(num(n.value)) || 1); };
  const mo = $('#kd-more', el); if (mo) mo.onclick = () => openBpDetail(ctx.id);
  const setOwn = (ids, an) => {   // Blueprints von Hand hinzufügen / entfernen (Log-Sync fügt geloggte wieder hinzu)
    ids.forEach(x => { if (an) S.owned[x] = { src: 'hand', ts: now() }; else delete S.owned[x]; });
    hist((an ? 'Blueprint von Hand hinzugefügt: ' : 'Blueprint entfernt: ') + ids.map(kName).join(', '));
    save(); toast(an ? '✓ ' + (ids.length > 1 ? ids.length + ' Blueprints' : kName(ids[0])) + ' – hab ich' : 'Blueprint entfernt'); if (ctx.modal) render(); else { kRe(ctx); const l = $('#lcd-bp'); if (l) l.textContent = Object.keys(S.owned).length; }
  };
  const ow = $('#kd-own', el); if (ow) ow.onclick = () => setOwn([ctx.id], true);
  const uo = $('#kd-unown', el); if (uo) uo.onclick = () => {
    const log = S.owned[ctx.id] && S.owned[ctx.id].src === 'log';
    if (log && !confirm('Laut Game.log hast du diesen Blueprint. Trotzdem entfernen? (Beim nächsten Log-Sync kommt er wieder.)')) return;
    setOwn([ctx.id], false);
  };
  const os = $('#kd-ownset', el); if (os) os.onclick = () => setOwn(e.setIds.filter(x => kCraft(x) && !isOwned(x)), true);
  const addB = $('#kd-add', el); if (!addB) return;
  addB.onclick = async () => {
    let plan = ctx.plan;
    if (!plan) {
      const v = $('#kd-plan', el) ? $('#kd-plan', el).value : '_new';
      if (v === '_new' || !S.plans.length) { plan = { id: uid(), name: 'Plan ' + (S.plans.length + 1), items: [] }; S.plans.push(plan); }
      else plan = S.plans.find(p => p.id === v);
    }
    const ids = e.kind === 'set' ? [...$$('[data-kchk]', el).filter(c => c.checked).map(c => c.dataset.kchk), ...$$('[data-kopt]', el).map(s => s.value).filter(Boolean)] : [ctx.id];
    if (!ids.length) { toast('Nichts ausgewählt'); return; }
    ids.forEach(id => { const ex = plan.items.find(x => x.bp === id && x.minQ === ctx.q); if (ex) ex.qty += ctx.n; else plan.items.push({ id: uid(), bp: id, qty: ctx.n, minQ: ctx.q, built: 0, pick: {} }); });
    hist(`${e.kind === 'set' ? 'Rüstungs-Set ' + e.title + ': ' + ids.length + ' Teile' : ctx.n + ' × ' + kName(ctx.id)} (ab Q${ctx.q}) → Plan ${plan.name}`);
    S.ui.plan = plan.id; save(); toast(`${e.kind === 'set' ? ids.length + ' Teile' : ctx.n + ' × ' + kName(ctx.id)} → ${plan.name}`);
    if (ctx.modal) render(); else kRe(ctx);
  };
}

/* Bauteil zum Plan: Katalog im großen Fenster */
function openBpPicker(plan, preset) {
  openModal(`<h3>Bauteil zum Plan „${esc(plan.name)}“</h3><div id="kp"></div><div class="foot"><button class="k" id="kp-x">Fertig</button></div>`, box => {
    box.classList.add('wide');
    const ctx = kNewCtx($('#kp', box), plan, preset);
    if (preset) ctx.F.g = (() => { const w = preset.toLowerCase(); const b = R.blueprints.find(x => x.name.toLowerCase().includes(w)); return b ? kOf(b.id).g : 'w'; })();
    $('#kp-x', box).onclick = closeModal;
    renderCatalog(ctx.el, ctx);
  });
}
