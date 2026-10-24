'use strict';
/* Pliskin Industrie (früher Hysec Industrie) – Programmlogik: Pläne, Blueprints, Lager, Log-Sync, Einstellungen.
   Weitere Teile: etappe2.js (Schiffe, Contracts, Tour), verkauf.js, wissen.js (Datenbank), heute.js (To-do), hilfe.js (Hilfe, Demo) */
const APP_VERSION = '1.0.0';
// Demo-Modus: Testdaten statt eigener Daten, nichts wird gespeichert (gilt nur für dieses Browser-Fenster)
let DEMO = false; try { DEMO = sessionStorage.getItem('pliskin-demo') === '1'; } catch (e) { /* egal */ }

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Zahl aus Eingabe lesen: "0,5", "0.5", "1.000,5" und "500.000" (deutsche Tausenderpunkte) gehen alle
const num = v => {
  let s = String(v ?? '').trim().replace(/\s/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^[1-9]\d{0,2}(\.\d{3}){2,}$/.test(s) || /^[1-9]\d{0,2}\.\d{3}$/.test(s) && s.length > 5) s = s.replace(/\./g, '');
  const n = parseFloat(s); return isFinite(n) ? n : 0;
};
// Zahl fuer ein Eingabefeld (ohne Tausenderpunkte, mit Komma)
const FI = (n, d = 6) => String(Math.round((n || 0) * 10 ** d) / 10 ** d).replace('.', ',');
const F = (n, d = 2) => (Math.round((n || 0) * 10 ** d) / 10 ** d).toLocaleString('de-DE', { maximumFractionDigits: d });
const N = n => Math.round(n || 0).toLocaleString('de-DE');
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const now = () => new Date().toISOString();
const fmtTime = iso => { if (!iso) return '–'; const d = new Date(iso); return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); };
const BOX_SIZES = [32, 24, 16, 8, 4, 2, 1];
/* Mengen-Einheiten wie im Spiel (Beschriftungen aus global.ini: cSCU, mSCU, µSCU).
   Intern wird immer in SCU gerechnet. */
const UNITS = { 'SCU': 1, 'cSCU': 0.01, 'mSCU': 0.001, 'µSCU': 0.000001 };
const toSCU = (v, u) => Math.round(num(v) * (UNITS[u] || 1) * 1e6) / 1e6;
const fromSCU = (scu, u) => scu / (UNITS[u] || 1);
const unitSelect = (id, sel) => `<select id="${id}" style="width:86px">${Object.keys(UNITS).map(u => `<option ${u === sel ? 'selected' : ''}>${u}</option>`).join('')}</select>`;
const unitDigits = u => ({ 'SCU': 3, 'cSCU': 1, 'mSCU': 0, 'µSCU': 0 }[u] ?? 3);

/* ------------------------------------------------------------------ */
/* Daten                                                                */
/* ------------------------------------------------------------------ */
const DEFAULT_STORE = () => ({
  version: 1,
  settings: { theme: 'scholo', lang: 'de', updHint: true, calm: false, defaultQ: 500, goldQ: 900, staleDays: 7, autoSync: true,
              logDir: '', confirmBook: true, inUnit: 'cSCU', showUnit: 'auto', smallUnit: 'cSCU',
              sellQ: 500, sellTrade: true, home: '', suit: 'n', extBonus: true, uexOn: true },
              // suit: Unteranzug auf Set-Bildern (n neutral, m passend); Verkauf automatisch: Material unter sellQ, Handelsware ohne Qualitaet (sellTrade);
              // extBonus: Raffinerie-Boni von SCMDB ergänzen (eigene Einträge gehen vor); uexOn: Preise von UEX holen (eigene Preise gehen vor)
  owned: {},            // blueprintId -> {src:'log'|'hand', ts}
  syncLog: [],          // [{ts, source, files, added:[names]}]
  plans: [],            // [{id, name, items:[{id, bp, qty, minQ, built, pick:{slot:index}} | Material-Ziel {id, kind:'mat', mat, amount, minQ, qty:0}]}]
  stacks: [],           // [{id, mat, amount, unit, q, loc, boxes:{size:count}, note, keep, auto}] auto = Verkauf folgt der Einstellung, sonst keep von Hand
  history: [],          // [{ts, text}]
  favs: [],             // [{loc, name, kind}]
  fleet: [],            // eigene Schiffe [{id, ship (aus schiffe.json), name, doors:{gridIndex: 0..3}, grids?}]
  contracts: [],        // [{id, giver, reward, deadline, note, status:'offen'|'tour'|'erledigt', lines:[{id, ware, scu, from, to}]}]
  moves: [],            // Umlagerungen [{id, stack, amount, to, status}]
  tour: null,           // Contracts-Tour {ship, stops:[{id, loc, done}], sig, manual}
  stour: null,          // Lager-Tour (Verkauf + Umlagerung), gleicher Aufbau + round
  sales: [],            // Verkäufe [{id, stack, amount, term, round, status:'tour'|'erledigt', price}]
  locMap: {},           // Ort -> {sys, body}, wenn die Karte ihn nicht selbst findet
  refBonus: {},         // eigene Raffinerie-Boni (am Terminal abgelesen): Raffinerie -> {Material: Prozent}
  myPrices: [],         // eigene Preise (im Spiel gesehen): [{id, ware, loc, sell, buy, ts}] – gelten vor UEX
  ui: { plan: null, open: {}, todoFilter: 'all', bpFilter: 'all', bpType: '', bpSearch: '', lagerTab: 'bestand', locFilter: '', tourKind: 'lager', sale: null,
        todoTab: 'next', dbTab: 'atlas', atlasQ: 900 }
});

let S = DEFAULT_STORE();
let R = { blueprints: [], resources: {} };
let U = { commodities: [], prices: [], terminals: [] };
let BP = {}, BPN = {}, FITN = null, ARMORS = null, RES = {}, CALC = null;
let dataDir = '';

/* Bruecke zum Python-Teil; ohne Programm (z. B. im Browser) gibt es einen Testmodus */
const fallback = {
  async load() {
    const recipes = await fetch('data/rezepte.json').then(r => r.json()).catch(() => ({}));
    let store = null; try { store = JSON.parse(localStorage.getItem('hysec') || 'null'); } catch (e) { /* leer */ }
    return { store, recipes, version: 'Browser-Test', dataDir: 'Browser-Speicher' };
  },
  async save(s) { try { localStorage.setItem('hysec', JSON.stringify(s)); } catch (e) { /* voll */ } return true; },
  async sync_logs() { return { ok: false, error: 'Im Browser-Testmodus nicht möglich – bitte Log-Dateien reinziehen.' }; },
  async default_live_dir() { return ''; },
  async pick_folder() { return null; },
  async uex() { return { ts: 0, commodities: [], prices: [], terminals: [], error: 'Browser-Testmodus' }; },
  async scmdb() { return fetch('data/scmdb.json').then(r => r.ok ? r.json() : null).catch(() => null); },
  async scmdb_sync() { return { ok: false, info: 'Browser-Testmodus' }; },
  async export_backup(s) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(s, null, 1)], { type: 'application/json' })); a.download = 'hysec-sicherung.json'; a.click(); return 'Download'; },
  async import_backup() {
    return new Promise(res => {
      const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json';
      i.onchange = async () => { try { res(JSON.parse(await i.files[0].text())); } catch (e) { res(false); } };
      i.click();
    });
  },
  async open_data_dir() { return false; }
};
/* Betriebsart: 'server' = Daten auf dem Pi, 'app' = Programmfenster mit eigenen Daten, 'test' = nur Browser.
   LOCAL = laeuft in der Hysec-App auf einem PC und darf dort Dateien lesen (Game-Logs). */
let MODE = 'test', LOGSRC = '', LOCAL = false;
const SERVER_CALLS = new Set(['load', 'save', 'rev', 'sync_logs', 'uex', 'scmdb', 'scmdb_sync', 'default_live_dir', 'app_info', 'prog_get', 'prog_set', 'updates', 'update_install',
  'erfassung_stand', 'erfassung_liste', 'erfassung_setzen', 'erfassung_fertig', 'erfassung_lernen', 'erfassung_ausloesen']);
const LOCAL_CALLS = new Set(['sync_logs', 'pick_folder', 'default_live_dir', 'export_backup', 'import_backup', 'open_data_dir']);
const localUI = () => LOCAL || MODE === 'test';
async function call(name, ...a) {
  const pw = window.pywebview && window.pywebview.api;
  if (pw && (MODE === 'app' || LOCAL_CALLS.has(name)) && pw[name]) return pw[name](...a);
  if (MODE === 'server' && SERVER_CALLS.has(name)) {
    const r = await fetch('/api/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a) });
    return r.json();
  }
  return fallback[name](...a);
}

let saveTimer = null, saving = false, saveAgain = false, BASE = null;   // BASE = letzter mit dem Server abgeglichener Stand (für das Zusammenführen)
// Zwei Geräte gleichzeitig: Drei-Wege-Zusammenführung (gemeinsamer Stand BASE, eigener Stand, Stand vom Server).
// Listen mit IDs (Lager, Pläne, Contracts …) je Eintrag; Gelöschtes bleibt gelöscht; Listen ohne ID werden vereint; gleiches Feld auf beiden Seiten geändert -> eigene Änderung gewinnt.
const jclone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
const jsame = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function merge3(base, mine, theirs) {
  if (jsame(mine, base)) return jclone(theirs);
  if (jsame(theirs, base) || jsame(mine, theirs)) return jclone(mine);
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  if (isObj(mine) && isObj(theirs)) {
    const b0 = isObj(base) ? base : {}, out = {};
    for (const k of new Set([...Object.keys(theirs), ...Object.keys(mine)])) {
      if (!(k in mine)) { if (k in b0 && jsame(theirs[k], b0[k])) continue; out[k] = jclone(theirs[k]); continue; }   // bei mir gelöscht
      if (!(k in theirs)) { if (k in b0 && jsame(mine[k], b0[k])) continue; out[k] = jclone(mine[k]); continue; }   // dort gelöscht
      out[k] = merge3(b0[k], mine[k], theirs[k]);
    }
    return out;
  }
  if (Array.isArray(mine) && Array.isArray(theirs)) {
    const B = Array.isArray(base) ? base : [], hasId = a => a.length && a.every(x => x && typeof x === 'object' && x.id != null);
    if ((hasId(mine) || !mine.length) && (hasId(theirs) || !theirs.length) && (mine.length || theirs.length)) {
      const BM = new Map(B.filter(x => x && x.id != null).map(x => [x.id, x])), MM = new Map(mine.map(x => [x.id, x])), TM = new Map(theirs.map(x => [x.id, x])), out = [];
      for (const t of theirs) { const b = BM.get(t.id), m = MM.get(t.id); if (!m) { if (b && jsame(t, b)) continue; out.push(jclone(t)); } else out.push(merge3(b, m, t)); }
      for (const m of mine) if (!TM.has(m.id)) { const b = BM.get(m.id); if (b && jsame(m, b)) continue; out.push(jclone(m)); }
      return out;
    }
    // ohne IDs (Historie, Namenslisten): vereinen, bei mir Gelöschtes weglassen
    const key = x => JSON.stringify(x), bk = new Set(B.map(key)), mk = new Set(mine.map(key)), tk = new Set(theirs.map(key));
    const out = theirs.filter(x => !(bk.has(key(x)) && !mk.has(key(x)))).concat(mine.filter(x => !tk.has(key(x)) && !bk.has(key(x))));
    if (out.every(x => x && typeof x === 'object' && x.ts)) out.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    return out;
  }
  return jclone(mine);
}
const setBase = () => { BASE = jclone(Object.assign({}, S, { ui: undefined })); };
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(doSave, 350); }
// Immer nur ein Speichern gleichzeitig: sonst schickt das zweite noch die alte Revision mit,
// der Server meldet „Konflikt“ und die eigene letzte Änderung ginge verloren (langsames Netz am Handy)
async function doSave() {
  saveTimer = null;
  if (DEMO) return;   // Demo: nichts speichern
  if (saving) { saveAgain = true; return; }
  saving = true;
  try {
    const sent = jclone(Object.assign({}, S, { ui: undefined }));
    const r = await call('save', S);
    if (r && r.conflict) {   // anderes Gerät war schneller: beide Änderungen zusammenführen und erneut speichern
      const theirs = r.store || {}, mine = jclone(Object.assign({}, S, { ui: undefined }));
      const merged = BASE ? merge3(BASE, mine, Object.assign({}, theirs, { ui: undefined })) : theirs;
      merged._rev = theirs._rev; loadStore(merged); BASE = jclone(Object.assign({}, theirs, { ui: undefined }));
      toast('Auf einem anderen Gerät geändert – Änderungen zusammengeführt'); render(); saveAgain = true;
    } else if (r && r.rev) { S._rev = r.rev; sent._rev = r.rev; BASE = sent; }
  } catch (e) { setComm('SPEICHERN FEHLGESCHLAGEN – SERVER ERREICHBAR?'); const w = $('#ind-warn'); w && w.classList.add('on'); }
  finally { saving = false; if (saveAgain) { saveAgain = false; doSave(); } }
}
function loadStore(st) {
  const ui = S && S.ui;
  S = Object.assign(DEFAULT_STORE(), st || {});
  S.settings = Object.assign(DEFAULT_STORE().settings, S.settings || {});
  S.ui = Object.assign(DEFAULT_STORE().ui, ui || S.ui || {});
}
/* Wenn das Fenster wieder nach vorne kommt: neuere Daten von anderen Geraeten holen */
async function checkRemote() {
  if (MODE === 'test' || DEMO || saving || saveTimer || Date.now() - (checkRemote.t || 0) < 1500) return;   // Fokus + Sichtbar kommen oft zusammen
  checkRemote.t = Date.now();
  try {
    const rv = await call('rev');
    if (rv > (S._rev || 0)) { const d = await call('load'); loadStore(d.store); setBase(); render(); toast('Neuer Stand geladen'); }
  } catch (e) { /* offline */ }
}
function hist(text) { S.history.unshift({ ts: now(), text }); S.history = S.history.slice(0, 500); }

/* ------------------------------------------------------------------ */
/* Rezepte                                                              */
/* ------------------------------------------------------------------ */
function indexRecipes() {
  BP = {}; BPN = {}; FITN = null; ARMORS = null; RES = R.resources || {};
  for (const b of R.blueprints || []) {
    BP[b.id] = b;
    const k = (b.name || '').trim().toLowerCase();
    (BPN[k] = BPN[k] || []).push(b.id);
  }
}
const resName = id => (RES[id] && RES[id].name) || (String(id).startsWith('uex:') ? id.slice(4) : String(id).replace(/_/g, ' '));
const resUnit = id => (RES[id] && RES[id].item) ? 'Stk' : 'SCU';
const cap = s => String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

/* Rezept in Material-Slots zerlegen */
function slotsOf(bp) {
  const out = [];
  const top = bp && bp.tiers && bp.tiers[0] && bp.tiers[0].cost;
  const walk = node => {
    if (!node) return;
    if (node.kind === 'select') {
      const opts = node.options || [];
      const matLevel = opts.length && opts.every(o => o.kind === 'res' || o.kind === 'item');
      if (matLevel) {
        if ((node.count || 1) >= opts.length && opts.length > 1) opts.forEach((o, i) => out.push({ key: (node.slot || 'S') + '#' + i, name: node.slot_loc || cap(node.slot), options: [o], mods: node.mods || [] }));
        else out.push({ key: node.slot || 'S' + out.length, name: node.slot_loc || cap(node.slot), options: opts, mods: node.mods || [] });
      } else {
        const n = Math.min(node.count || opts.length, opts.length);
        opts.slice(0, n).forEach(walk);
      }
    } else if (node.kind === 'res' || node.kind === 'item') {
      out.push({ key: 'M' + out.length, name: 'Material', options: [node], mods: [] });
    }
  };
  walk(top);
  return out;
}
const itemName = it => it.kind === 'mat' ? resName(it.mat) + ' (Material-Ziel)' : ((BP[it.bp] || {}).name || it.bp);
const craftTime = bp => (bp && bp.tiers && bp.tiers[0] && bp.tiers[0].time) || 0;
const fmtDur = s => s >= 3600 ? Math.floor(s / 3600) + ' h ' + Math.round((s % 3600) / 60) + ' min' : Math.round(s / 60) + ' min';
const isOwned = id => !!S.owned[id];
const poolRaw = p => p.replace(/^BP_(MISSIONREWARD|REWARDS?)_/i, '').replace(/_/g, ' ');
/* Missionen je Blueprint-Pool (data/missionen.json aus Game2.dcb): {pool: [{who, what, sys, lvl, rank, chance}]} */
let MISS = {};
const missWhat = w => String(w || '').replace(/^RG /, '').replace(/\bRank\d+\b/g, '').replace(/\s+/g, ' ').trim();
// Kurzform für Listen: „Foxwell Enforcement · Patrol (Pyro)“
const poolName = p => {
  const m = MISS[p]; if (!m || !m.length) return poolRaw(p);
  const g = [...new Set(m.map(e => `${e.who} · ${missWhat(e.what)}${e.sys ? ' (' + e.sys + ')' : ''}`))];
  return g.slice(0, 2).join(', ') + (g.length > 2 ? ' …' : '');
};
// Langform für die Blueprint-Ansicht: je Auftraggeber/Mission/System der niedrigste Rang und die Stufen
function poolDetail(p) {
  const m = MISS[p];
  if (!m || !m.length) return `<div>${esc(poolRaw(p))} <span class="dim">– nicht in den Missionsdaten (Event/Sonderquelle?) · <a href="https://scmdb.net/" target="_blank" rel="noopener">SCMDB</a></span></div>`;
  const grp = {};
  for (const e of m) { const k = `${e.who}|${missWhat(e.what)}|${e.sys || ''}`; (grp[k] = grp[k] || []).push(e); }
  return Object.entries(grp).map(([k, es]) => {
    const [who, what, sys] = k.split('|'), ranks = es.map(e => e.rank).filter(r => r != null), lv = [...new Set(es.map(e => e.lvl).filter(Boolean))];
    const ch = Math.min(...es.map(e => e.chance ?? 1));
    return `<div><b>${esc(who)}</b> · ${esc(what)}${sys ? ' · ' + esc(sys) : ''}${ranks.length ? ` <span class="tag">ab Rang ${Math.min(...ranks)}</span>` : ''}${lv.length ? ` <span class="dim">${esc(lv[0])}${lv.length > 1 ? ' – ' + esc(lv[lv.length - 1]) : ''}</span>` : ''}${ch < 1 ? ` <span class="dim">· Chance ${Math.round(ch * 100)} %</span>` : ''}</div>`;
  }).join('');
}
const PROP_DE = { Health_MaxHealth: 'Haltbarkeit', Weapon_Damage: 'Schaden', Weapon_FireRate: 'Feuerrate' };
function modAt(m, q) {
  const t = Math.max(0, Math.min(1, (q - m.q0) / ((m.q1 - m.q0) || 1)));
  return m.m0 + (m.m1 - m.m0) * t;
}

/* ------------------------------------------------------------------ */
/* Berechnung: Bedarf, Lager-Zuteilung, To-do                           */
/* ------------------------------------------------------------------ */
/* Mischen wie im Spiel: Die Qualität eines Bauteils ergibt sich aus dem nach Menge gewichteten Durchschnitt der Zutaten.
   Beste zuerst, dann mit schlechterer auffüllen – aber nur so weit, wie der Durchschnitt die Ziel-Qualität hält.
   list = [{id, left, q}] absteigend nach q (left wird verringert). → {have, avg, takes:[{id, take, q}]} */
function mischen(list, need, ziel) {
  let A = 0, Sq = 0; const takes = [];
  for (const s of list) {
    if (A >= need - 1e-9) break;
    if (s.left <= 1e-9) continue;
    let x = Math.min(s.left, need - A);
    if (s.q < ziel) x = Math.min(x, Math.max(0, (Sq - ziel * A) / (ziel - s.q)));   // bis der Schnitt genau auf dem Ziel liegt
    if (x <= 1e-9) break;                                                            // alle weiteren sind noch schlechter
    s.left -= x; A += x; Sq += s.q * x; takes.push({ id: s.id, take: x, q: s.q });
  }
  return { have: A, avg: A > 0 ? Sq / A : null, takes };
}
function compute() {
  // Lager-Pool je Material, beste Qualität zuerst (Crafting mischt, siehe mischen())
  const pool = {};
  for (const st of S.stacks) {
    (pool[st.mat] = pool[st.mat] || []).push({ id: st.id, left: st.amount, q: st.q ?? 0 });
  }
  Object.values(pool).forEach(l => l.sort((a, b) => b.q - a.q));
  const reservedBy = {};               // stackId -> Menge verplant
  const resPlan = {};                  // planId -> {stackId: Menge} (fürs Zusammenholen)
  const missPlan = {};                 // planId -> {mat: fehlende Menge}
  const items = {};                    // itemId -> Ergebnis
  const missing = {};                  // mat -> {need, minQ, plans}
  const missions = {};                 // bpId -> {plans}
  const craft = [];
  const plans = {};

  for (const plan of S.plans) {
    let sumNeed = 0, sumHave = 0, done = 0, total = 0, blocked = 0, mats = new Set();
    for (const it of plan.items) {
      if (it.kind === 'mat') {          // Material-Ziel: nur sammeln, kein Bauteil, kein Blueprint noetig
        const need = it.amount || 0, minQ = it.minQ || 0, unit = resUnit(it.mat);
        let have = 0;
        for (const s of (pool[it.mat] || []).slice().reverse()) {
          if (have >= need - 1e-9) break;
          if (s.q < minQ || s.left <= 1e-9) continue;
          const take = Math.min(s.left, need - have);
          s.left -= take; have += take;
          reservedBy[s.id] = (reservedBy[s.id] || 0) + take; (resPlan[plan.id] = resPlan[plan.id] || {})[s.id] = (resPlan[plan.id][s.id] || 0) + take;
        }
        if (need - have > 1e-6) {
          (missPlan[plan.id] = missPlan[plan.id] || {})[it.mat] = (missPlan[plan.id][it.mat] || 0) + need - have;
          const m = missing[it.mat] = missing[it.mat] || { need: 0, minQ: 0, plans: new Set(), unit };
          m.need += need - have; m.minQ = Math.max(m.minQ, minQ); m.plans.add(plan.name); mats.add(it.mat);
        }
        const reqs = [{ slot: { name: 'Material-Ziel', key: 'goal', options: [{ id: it.mat }] }, pick: 0, mat: it.mat, unit, per: need, need, have, minQ }];
        items[it.id] = { reqs, pct: need > 0 ? Math.min(100, have / need * 100) : 100, canBuild: 0, owned: true, rem: need - have > 1e-6 ? 1 : 0, goal: true, have, need };
        sumNeed += need; sumHave += Math.min(have, need);
        continue;
      }
      const bp = BP[it.bp];
      const rem = Math.max(0, (it.qty || 0) - (it.built || 0));
      total += it.qty || 0; done += Math.min(it.built || 0, it.qty || 0);
      const reqs = [];
      for (const sl of slotsOf(bp)) {
        const pick = Math.min((it.pick || {})[sl.key] || 0, sl.options.length - 1);
        const o = sl.options[pick];
        const per = o.qty || 0, need = per * rem, minQ = Math.max(it.minQ || 0, o.minQ || 0);   // minQ = Ziel-Qualität (Durchschnitt)
        const mix = mischen(pool[o.id] || [], need, minQ), have = mix.have;
        for (const tk of mix.takes) { reservedBy[tk.id] = (reservedBy[tk.id] || 0) + tk.take; (resPlan[plan.id] = resPlan[plan.id] || {})[tk.id] = (resPlan[plan.id][tk.id] || 0) + tk.take; }
        reqs.push({ slot: sl, pick, mat: o.id, unit: o.unit || resUnit(o.id), per, need, have, minQ, avg: mix.avg });
        if (need - have > 1e-6) {
          (missPlan[plan.id] = missPlan[plan.id] || {})[o.id] = (missPlan[plan.id][o.id] || 0) + need - have;
          const m = missing[o.id] = missing[o.id] || { need: 0, minQ: 0, plans: new Set(), unit: o.unit || resUnit(o.id) };
          m.need += need - have; m.minQ = Math.max(m.minQ, minQ); m.plans.add(plan.name); mats.add(o.id);
        }
      }
      const needT = reqs.reduce((a, r) => a + r.need, 0), haveT = reqs.reduce((a, r) => a + Math.min(r.have, r.need), 0);
      const pct = rem === 0 ? 100 : (needT > 0 ? haveT / needT * 100 : (reqs.length ? 100 : 0));
      const canBuild = rem === 0 ? 0 : (reqs.length ? Math.min(rem, ...reqs.map(r => r.per > 0 ? Math.floor((r.have + 1e-9) / r.per) : rem)) : 0);
      const owned = isOwned(it.bp);
      if (!owned && rem > 0) { (missions[it.bp] = missions[it.bp] || { plans: new Set() }).plans.add(plan.name); blocked++; }
      if (owned && canBuild > 0) craft.push({ plan, it, n: canBuild });
      items[it.id] = { reqs, pct, canBuild, owned, rem };
      sumNeed += needT; sumHave += haveT;
    }
    const pct = plan.items.length ? (total ? (done / total) * 100 * 0.5 + (sumNeed ? sumHave / sumNeed : 1) * 100 * 0.5 : 0) : 0;
    plans[plan.id] = { pct: Math.round(sumNeed ? sumHave / sumNeed * 100 : (plan.items.length ? 100 : 0)), done, total, blocked, mats: mats.size, progress: Math.round(pct) };
  }
  CALC = { items, missing, missions, craft, plans, reservedBy, resPlan, missPlan };
  return CALC;
}

/* ------------------------------------------------------------------ */
/* UEX: Waren, Preise, Orte                                             */
/* ------------------------------------------------------------------ */
let UEXIDX = { byName: {}, best: {}, terms: {} };
function indexUex() {
  UEXIDX = { byName: {}, best: {}, terms: {} };
  for (const t of U.terminals || []) UEXIDX.terms[t.id] = t;
  for (const c of U.commodities || []) UEXIDX.byName[c.name.toLowerCase()] = c;
  for (const p of U.prices || []) {
    if (!p.sell) continue;
    const b = UEXIDX.best[p.c];
    if (!b || p.sell > b.sell) UEXIDX.best[p.c] = p;
  }
}
/* Orte + Waren aus den Spieldaten (data/orte.json, werkzeuge/wissen_export.py): Ausstattung je Ort, alle Waren */
let ORTE = { orte: [], waren: [] }, ORTIDX = {};
const nrm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/* Kisten + Material-Symbole aus den Spieldaten (data/kisten.json, Bilder data/modelle/sym_*.webp + kiste_*.webp) */
let KISTEN = null, KISTIDX = {};
function loadKisten() {
  return fetch('data/kisten.json').then(r => r.json()).then(j => {
    KISTEN = j; KISTIDX = {};
    for (const [id, v] of Object.entries(j.res || {})) { KISTIDX[id.toLowerCase()] = v; if (v.name && !KISTIDX[v.name.toLowerCase()]) KISTIDX[v.name.toLowerCase()] = v; }
  }).catch(() => { KISTEN = { res: {} }; });
}
// Eintrag zu einem Material (Lager-ID wie „Iron“, „Pressurized_Ice“ oder „uex:Iron (Ore)“)
function kstRes(mat) {
  if (!KISTEN || !mat) return null;
  const id = String(mat).replace(/^uex:/, ''), n = resName(mat);
  return KISTIDX[id.toLowerCase()] || KISTIDX[n.toLowerCase()] || KISTIDX[id.toLowerCase().replace(/\s*\((ore|raw)\)$/, '')] || KISTIDX['ore_' + id.toLowerCase()] || null;
}
const matSym = (mat, cls = 'msym') => { const r = kstRes(mat); return r && r.symbol ? `<img class="${cls}" src="data/${r.symbol}" alt="" loading="lazy">` : `<span class="${cls} leer"></span>`; };
function loadOrte() {
  return fetch('data/orte.json').then(r => r.json()).then(j => { ORTE = j; ORTIDX = {}; (j.orte || []).forEach(o => { ORTIDX[nrm(o.name)] = o; }); })
    .catch(() => { /* ohne Ortsdaten: UEX-Orte reichen */ });
}
// System eines Ortes: Spieldaten, sonst UEX-Terminal
function locSystem(loc) {
  const o = ORTIDX[nrm(loc)]; if (o && o.system) return o.system;
  const t = (U.terminals || []).find(x => nrm(x.name) === nrm(loc)); return t ? t.system || '' : '';
}
/* Alle bekannten Preise einer Ware: eigene (im Spiel abgelesen) gehen vor UEX am selben Ort */
const daysAgo = ts => ts ? Math.floor((Date.now() / 1000 - ts) / 86400) : null;
function priceList(mat) {
  const name = resName(mat).toLowerCase(), out = [], mine = new Set();
  for (const p of S.myPrices || []) {
    if (String(p.ware).toLowerCase() !== name) continue;
    out.push({ term: p.loc, sys: locSystem(p.loc), sell: p.sell || 0, buy: p.buy || 0, age: daysAgo(p.ts), src: 'eigen' }); mine.add(nrm(p.loc));
  }
  const c = S.settings.uexOn ? UEXIDX.byName[name] : null;
  if (c) for (const p of U.prices || []) {
    if (p.c !== c.id) continue;
    const t = UEXIDX.terms[p.t] || {};
    if (mine.has(nrm(t.name))) continue;
    out.push({ term: t.name || '?', sys: t.system || '', sell: p.sell || 0, buy: p.buy || 0, age: daysAgo(p.age), boxes: p.boxes, src: 'uex' });
  }
  return out;
}
function bestPrice(mat) {
  const b = priceList(mat).filter(p => p.sell > 0).sort((a, b) => b.sell - a.sell)[0];
  return b ? { sell: b.sell, term: b.term, age: b.age, boxes: b.boxes, src: b.src } : null;
}
// Verkauf freigegeben? „auto“ = folgt der Einstellung (Material unter Q-Grenze, Handelsware ohne Qualität), sonst von Hand gesetzt
const autoSell = q => q == null ? !!S.settings.sellTrade : q < S.settings.sellQ;
const stackSell = s => s.unit !== 'Stk' && (s.auto ? autoSell(s.q) : !s.keep);
function setStackSell(s, on) { s.auto = false; s.keep = !on; }
const sellTag = s => s.unit === 'Stk' ? '' : `<span class="vk ${stackSell(s) ? 'sell' : 'keep'}">${stackSell(s) ? '💰 Verkauf' : '🔒 Behalten'} <i>${s.auto ? 'auto' : 'von Hand'}</i></span>`;
function materialChoices(q) {
  q = q.toLowerCase();
  const out = [], seen = new Set();
  for (const r of Object.values(RES)) {
    const n = r.name || r.id;
    if (!q || n.toLowerCase().includes(q)) { out.push({ label: n, value: r.id, hint: r.item ? 'Stück · Crafting' : 'SCU · Crafting' }); seen.add(n.toLowerCase()); }
  }
  for (const c of U.commodities || []) {
    if (seen.has(c.name.toLowerCase())) continue;
    if (!q || c.name.toLowerCase().includes(q)) { out.push({ label: c.name, value: 'uex:' + c.name, hint: c.kind || 'Ware' }); seen.add(c.name.toLowerCase()); }
  }
  for (const w of ORTE.waren || []) {   // Waren aus den Spieldaten (auch ohne UEX)
    if (seen.has(w.name.toLowerCase())) continue;
    if (!q || w.name.toLowerCase().includes(q)) { out.push({ label: w.name, value: 'uex:' + w.name, hint: 'Ware' }); seen.add(w.name.toLowerCase()); }
  }
  return out.sort((a, b) => (a.label.toLowerCase().startsWith(q) ? 0 : 1) - (b.label.toLowerCase().startsWith(q) ? 0 : 1) || a.label.localeCompare(b.label)).slice(0, 40);
}
function locationChoices(q) {
  q = q.toLowerCase();
  const out = [], seen = new Set();
  const add = (label, hint) => { const k = label.toLowerCase(); if (seen.has(k)) return; if (!q || k.includes(q)) { out.push({ label, value: label, hint }); seen.add(k); } };
  if ((S.settings.home || '').trim()) add(S.settings.home.trim(), '⌂ Home-Station');
  S.favs.forEach(f => add(f.loc, '☆ Favorit' + (f.kind ? ' · ' + f.kind : '')));
  S.stacks.forEach(s => s.loc && add(s.loc, 'benutzt'));
  (ORTE.orte || []).forEach(o => add(o.name, [o.parent !== o.system ? o.parent : '', o.system].filter(Boolean).join(' · ')));
  (U.terminals || []).forEach(t => add(t.name, [t.station || t.city || t.outpost, t.moon || t.planet, t.system].filter(Boolean).join(' · ')));
  return out.slice(0, 40);
}

/* ------------------------------------------------------------------ */
/* Kleine Bausteine                                                     */
/* ------------------------------------------------------------------ */
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2600); }
function setComm(t) { $('#comm').textContent = t; }
function openModal(html, mount) { $('#modal-box').innerHTML = html; $('#modal').classList.add('on'); if (mount) mount($('#modal-box')); }
function closeModal() { $('#modal').classList.remove('on'); $('#modal-box').innerHTML = ''; $('#modal-box').classList.remove('wide'); }
function ask(text, okLabel = 'OK', danger = false) {
  return new Promise(res => {
    openModal(`<h3>Bestätigen</h3><div>${text}</div><div class="foot"><button class="k" data-a="0">Abbrechen</button><button class="k ${danger ? 'x' : 'pri'}" data-a="1">${esc(okLabel)}</button></div>`,
      box => $$('button', box).forEach(b => b.onclick = () => { closeModal(); res(b.dataset.a === '1'); }));
  });
}
function attachAC(input, source, onPick) {
  const wrap = input.parentElement; wrap.classList.add('ac');
  const list = document.createElement('div'); list.className = 'ac-list'; wrap.appendChild(list);
  let items = [], sel = -1;
  const show = () => {
    items = source(input.value.trim()); sel = -1;
    list.innerHTML = items.map((it, i) => `<div class="ac-item" data-i="${i}">${esc(it.label)}<small>${esc(it.hint || '')}</small></div>`).join('');
    list.classList.toggle('on', items.length > 0);
  };
  const pick = i => { const it = items[i]; if (!it) return; input.value = it.label; input.dataset.value = it.value; list.classList.remove('on'); onPick && onPick(it); };
  input.addEventListener('input', () => { delete input.dataset.value; show(); });
  input.addEventListener('focus', show);
  input.addEventListener('blur', () => setTimeout(() => list.classList.remove('on'), 150));
  input.addEventListener('keydown', e => {
    if (!list.classList.contains('on')) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; $$('.ac-item', list).forEach((x, i) => x.classList.toggle('sel', i === sel)); }
    if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); pick(sel); }
  });
  list.addEventListener('mousedown', e => { const el = e.target.closest('.ac-item'); if (el) pick(+el.dataset.i); });
  // Ort-Felder: ⌂ Home und Favoriten als Knöpfe direkt darunter
  if (source === locationChoices) {
    const opts = [(S.settings.home || '').trim() && { l: S.settings.home.trim(), h: 1 }, ...S.favs.map(f => ({ l: f.loc }))]
      .filter(Boolean).filter((o, i, a) => a.findIndex(x => x.l.toLowerCase() === o.l.toLowerCase()) === i).slice(0, 8);
    if (opts.length) {
      const ch = document.createElement('div'); ch.className = 'locchips';
      ch.innerHTML = opts.map((o, i) => `<span data-i="${i}" class="${o.h ? 'home' : ''}" title="${esc(o.l)}">${o.h ? '⌂' : '☆'} ${esc(o.l)}</span>`).join('');
      ch.addEventListener('mousedown', e => {
        const s = e.target.closest('[data-i]'); if (!s) return; e.preventDefault();
        const o = opts[+s.dataset.i]; input.value = o.l; input.dataset.value = o.l; list.classList.remove('on');
        input.dispatchEvent(new Event('change')); onPick && onPick({ label: o.l, value: o.l });
      });
      wrap.appendChild(ch);
    }
  }
}
const segBar = (pct, cls = '') => `<span class="mbar ${cls}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></span>`;
const qTag = q => q == null || q === '' ? '<span class="dim">–</span>' : `<span class="tag ${q >= S.settings.goldQ ? 'qhi' : 'q'}">Q ${q}</span>`;
const crates = boxes => {
  const e = Object.entries(boxes || {}).filter(([, c]) => c > 0).sort((a, b) => b[0] - a[0]);
  if (!e.length) return '<span class="dim">–</span>';
  return '<span class="crates">' + e.map(([s, c]) => `<span class="crate s${s === '0.125' ? 0 : s}"><i class="g"></i>${s === '0.125' ? '⅛' : s}${c > 1 ? `<span class="x">×${c}</span>` : ''}</span>`).join('') + '</span>';
};
function fmtAmt(a, unit) {
  if (unit === 'Stk') return N(a) + ' Stk';
  let u = S.settings.showUnit || 'auto';
  if (u === 'auto') u = Math.abs(a) >= 1 || a === 0 ? 'SCU' : (S.settings.smallUnit || 'cSCU');
  return F(fromSCU(a, u), unitDigits(u)) + ' ' + u;
}

/* ------------------------------------------------------------------ */
/* Kopfzeile                                                            */
/* ------------------------------------------------------------------ */
function renderHeader() {
  const scu = S.stacks.filter(s => s.unit !== 'Stk').reduce((a, s) => a + s.amount, 0);
  $('#lcd-plans').textContent = S.plans.length;
  $('#lcd-scu').textContent = scu >= 1000 ? Math.round(scu) : F(scu, 1).replace(',', '.');
  $('#lcd-bp').textContent = Object.keys(S.owned).length;
  $('#lcd-open').textContent = Object.keys(CALC.missions).length + Object.keys(CALC.missing).length;
  const last = S.syncLog[0];
  $('#sync-time').textContent = last ? 'zuletzt ' + fmtTime(last.ts).split(' ')[1] : '–';
  $('#ind-auto').classList.toggle('on', !!last && !last.error);
  $('#ind-uex').classList.toggle('on', !!U.ts && !U.stale);
  $('#ind-warn').classList.toggle('on', !!(U.error || (last && last.error)));
  $('#footer').textContent = `Pliskin Industrie ${APP_VERSION}${DEMO ? ' · DEMO' : ''} · Rezepte: Data.p4k · Patch ${R.patch || '?'} · Wissen: Spieldaten · Preise: ${S.settings.uexOn ? 'UEX Corp + eigene' : 'eigene'}${U.ts ? ' (Stand ' + fmtTime(new Date(U.ts * 1000).toISOString()) + (U.stale ? ', offline' : '') + ')' : ' (nicht geladen)'} · Blueprints: Game-Logs · Daten: ${dataDir}`;
}

/* ------------------------------------------------------------------ */
/* PLÄNE                                                                */
/* ------------------------------------------------------------------ */
function curPlan() { return S.plans.find(p => p.id === S.ui.plan) || S.plans[0] || null; }

function renderPlans() {
  const el = $('#plan'); const plan = curPlan();
  if (plan) S.ui.plan = plan.id;
  const owned = Object.keys(S.owned).length, totalBp = (R.blueprints || []).length;
  const avg = S.plans.length ? Math.round(S.plans.reduce((a, p) => a + CALC.plans[p.id].pct, 0) / S.plans.length) : 0;
  const uexAge = U.ts ? Math.floor((Date.now() / 1000 - U.ts) / 3600) : null;
  const nM = Object.keys(CALC.missions).length, nA = Object.keys(CALC.missing).length, nC = CALC.craft.length;
  // Radar-Punkte: feste Positionen je Eintrag (gleiche Daten -> gleiches Bild)
  const blips = []; let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const blip = c => { const a = rnd() * 6.283, r = 12 + rnd() * 36; blips.push(`<i class="b ${c}" style="left:${50 + Math.cos(a) * r}%;top:${50 + Math.sin(a) * r}%"></i>`); };
  for (let i = 0; i < Math.min(nM, 12); i++) blip('r');
  for (let i = 0; i < Math.min(nA, 12); i++) blip('a');
  for (let i = 0; i < Math.min(nC, 12); i++) blip('g');

  const types = {};
  if (plan) plan.items.forEach(it => { if (it.kind === 'mat') return; const t = (BP[it.bp] || {}).type_de || '?'; types[t] = (types[t] || 0) + (it.qty || 0); });
  const pc = plan ? CALC.plans[plan.id] : null;
  const inWork = plan ? plan.items.filter(it => CALC.items[it.id].rem > 0 && CALC.items[it.id].owned && !CALC.items[it.id].goal).length : 0;

  let h = `<div class="mfds">
    <div class="vdu"><div class="vh">SYSTEMSTATUS</div>
      <div class="gauge"><span>BLUEPRINTS</span><b class="seg" style="--v:${totalBp ? owned / totalBp * 100 : 0}%"></b><em>${owned}/${totalBp}</em></div>
      <div class="gauge"><span>LAGER</span><b class="seg ok" style="--v:${Math.min(100, S.stacks.length * 4)}%"></b><em>${S.stacks.length} Posten</em></div>
      <div class="gauge"><span>PLÄNE</span><b class="seg" style="--v:${avg}%"></b><em>${avg} %</em></div>
      <div class="gauge"><span>UEX-PREISE</span><b class="seg ${uexAge != null && uexAge < 24 ? 'ok' : ''}" style="--v:${uexAge == null ? 0 : Math.max(10, 100 - uexAge * 4)}%"></b><em>${uexAge == null ? 'fehlt' : uexAge + ' h alt'}</em></div>
    </div>
    <div class="vdu"><div class="vh">ZIEL · ${esc(plan ? plan.name.toUpperCase() : 'KEIN PLAN')}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px 14px;min-height:62px;align-content:center;font:13px var(--vdu)">
        ${Object.entries(types).map(([t, n]) => `<span style="color:#f0d040">${n}× <span style="color:var(--data)">${esc(t.toUpperCase())}</span></span>`).join('') || '<span class="dim">Noch keine Bauteile – rechts „+ Bauteil“</span>'}
      </div>
      <div class="vl"><span class="g">FERTIG ${pc ? pc.done : 0}/${pc ? pc.total : 0}</span><span class="a">IN ARBEIT ${inWork}</span><span class="r">BLOCKIERT ${pc ? pc.blocked : 0}</span></div>
    </div>
    <div class="vdu radarbox"><div class="vh">TO-DO RADAR</div><div class="radar">${blips.join('')}</div>
      <div class="vl"><span class="r">● ${nM} MISSION</span><span class="a">● ${nA} ABBAU</span><span class="g">● ${nC} CRAFT</span></div></div>
  </div>
  <div class="pcols"><div class="win tight"><span class="pill">Crafting-Pläne</span>`;

  for (const p of S.plans) {
    const c = CALC.plans[p.id];
    h += `<div class="prow ${p.id === S.ui.plan ? 'sel' : ''} ${c.total && c.done >= c.total ? 'done' : ''}" data-plan="${p.id}">
      <div class="pn">${esc(p.name)}</div>
      <div class="pm"><span>${p.items.reduce((a, i) => a + (i.qty || 0), 0)} Teile</span>${segBar(c.pct)}<span>${c.pct} %</span></div>
      <div class="pm">${c.blocked ? `<span class="bad">${c.blocked} BP fehlt</span>` : ''}${c.blocked && c.mats ? ' · ' : ''}${c.mats ? `<span class="warn">${c.mats} Mat. abbauen</span>` : ''}${!c.blocked && !c.mats && p.items.length ? '<span class="green">alles da</span>' : ''}</div>
      <div class="acts"><button class="k sm" data-pa="up">▲</button><button class="k sm" data-pa="down">▼</button><button class="k sm" data-pa="ren">Umbenennen</button><button class="k sm" data-pa="copy">Kopieren</button><button class="k sm x" data-pa="del">×</button></div>
    </div>`;
  }
  if (!S.plans.length) h += `<div class="empty">Noch kein Plan.<br>Leg z. B. „Centaurus Kampf-Ausbau“ an.</div>`;
  h += `<div class="row2"><button class="k pri" id="plan-new">+ Neuer Plan</button><button class="k" id="plan-fit">Fitting einfügen</button></div>
    <div class="hint">Reihenfolge = Vorrang: Obere Pläne bekommen Lagerbestand zuerst.</div></div><div>`;

  if (plan) {
    h += `<div class="win tight"><span class="pill">${esc(plan.name)}</span><span class="sub">${plan.items.reduce((a, i) => a + (i.qty || 0), 0)} Teile</span>
      <div class="scroll"><table class="ptab itab"><tr><th class="l">Typ</th><th class="l">Bauteil</th><th>Anz.</th><th title="Ziel-Qualität: Durchschnitt der Zutaten (Material wird gemischt, beste zuerst)">Ziel-Q</th><th class="l">Blueprint</th><th class="l">Material</th><th>gebaut</th><th class="l">Status</th><th></th></tr>`;
    for (const it of plan.items) {
      if (it.kind === 'mat') {
        const c = CALC.items[it.id], miss = c.need - c.have;
        h += `<tr><td class="l dim">Material-Ziel</td><td class="name">⛏ ${esc(resName(it.mat))}</td><td>${fmtAmt(it.amount, c.reqs[0].unit)}</td>
          <td><input type="number" min="0" max="1000" step="50" value="${it.minQ}" data-ia="q" data-it="${it.id}" style="width:64px;padding:2px 4px;font-size:13px"></td>
          <td class="l dim">–</td><td class="l">${segBar(c.pct)} ${fmtAmt(c.have, c.reqs[0].unit)}</td><td class="dim">–</td>
          <td class="l">${miss > 1e-6 ? `<span class="tag warn">⛏ fehlt ${fmtAmt(miss, c.reqs[0].unit)}</span>` : '<span class="tag ok">✓ gesammelt</span>'}</td>
          <td><button class="k sm" data-ia="goal" data-it="${it.id}">Ändern</button> <button class="k sm x" data-ia="del" data-it="${it.id}">×</button></td></tr>`;
        continue;
      }
      const bp = BP[it.bp] || { name: it.bp + ' (unbekannt)' }; const c = CALC.items[it.id];
      const open = !!S.ui.open[it.id];
      let status;
      if (c.rem === 0) status = '<span class="tag ok">✓ fertig</span>';
      else if (!c.owned) status = '<span class="tag bad">🎯 Mission</span>';
      else if (c.canBuild > 0) status = `<span class="tag ok">baubar ${c.canBuild}×</span>`;
      else status = '<span class="tag warn">⛏ abbauen</span>';
      h += `<tr class="${open ? 'open' : ''}"><td class="l dim">${esc(bp.type_de || '')}${bp.size ? ' S' + bp.size : ''}</td>
        <td class="name clickrow" data-ia="toggle" data-it="${it.id}">${open ? '▾' : '▸'} ${esc(bp.name)}</td>
        <td><button class="k sm" data-ia="minus" data-it="${it.id}">−</button> ${it.qty} <button class="k sm" data-ia="plus" data-it="${it.id}">+</button></td>
        <td><input type="number" min="0" max="1000" step="50" value="${it.minQ}" data-ia="q" data-it="${it.id}" style="width:64px;padding:2px 4px;font-size:13px"></td>
        <td class="l ${c.owned ? 'ok' : 'bad'}">${c.owned ? '✓' : '✗ fehlt'}</td>
        <td class="l">${segBar(c.pct)} ${Math.round(c.pct)} %</td>
        <td>${it.built || 0}/${it.qty}</td><td class="l">${status}</td>
        <td><button class="k sm" data-ia="built" data-it="${it.id}" title="1 Stück gebaut – Material abbuchen">1 gebaut</button> <button class="k sm x" data-ia="del" data-it="${it.id}">×</button></td></tr>`;
      if (open) {
        h += `<tr class="exp"><td></td><td colspan="8"><table class="mtab"><tr><th class="l">Slot</th><th class="l">Material</th><th>pro Stück</th><th>× ${c.rem} gesamt</th><th>im Lager</th><th>fehlt</th></tr>`;
        for (const r of c.reqs) {
          const miss = r.need - r.have;
          const sel = r.slot.options.length > 1 ? `<select data-ia="pick" data-it="${it.id}" data-slot="${esc(r.slot.key)}">${r.slot.options.map((o, i) => `<option value="${i}" ${i === r.pick ? 'selected' : ''}>${esc(resName(o.id))}</option>`).join('')}</select>` : esc(resName(r.mat));
          h += `<tr><td class="l dim">${esc(r.slot.name)}</td><td class="name">${sel} <span class="dim" title="Ziel-Qualität (Durchschnitt) · Ø der reservierten Lagerposten">Ziel Q${r.minQ}${r.avg != null ? ' · Ø ' + Math.round(r.avg) : ''}</span></td><td>${fmtAmt(r.per, r.unit)}</td><td class="tot">${fmtAmt(r.need, r.unit)}</td><td>${fmtAmt(r.have, r.unit)}</td><td class="${miss > 1e-6 ? 'miss' : 'done'}">${miss > 1e-6 ? fmtAmt(miss, r.unit) : '✓'}</td></tr>`;
        }
        h += `</table><div class="hint" style="margin:4px 0 0">Herstellzeit ${fmtDur(craftTime(bp))} pro Stück${bp.pools && bp.pools.length ? ' · Blueprint aus: ' + esc(bp.pools.slice(0, 3).map(poolName).join(', ')) + (bp.pools.length > 3 ? ' …' : '') : ''}</div></td></tr>`;
      }
    }
    if (!plan.items.length) h += `<tr><td colspan="9" class="empty">Leer. „+ Bauteil“, „+ Material“ oder „+ Fitting / Liste“.</td></tr>`;
    h += `</table></div><div class="row2"><button class="k pri" id="it-add">+ Bauteil</button><button class="k" id="it-goal">+ Material</button><button class="k" id="it-list">+ Fitting / Liste</button><div class="grow"></div><span class="dim" style="font-size:13px">Klick auf ▸ zeigt Material pro Stück und gesamt</span></div></div>`;

    // To-do dieses Plans
    const pm = {}, pmis = [], pcr = [];
    for (const it of plan.items) {
      const c = CALC.items[it.id];
      if (!c.owned && c.rem > 0) pmis.push(BP[it.bp]);
      if (c.owned && c.canBuild > 0) pcr.push({ bp: BP[it.bp], n: c.canBuild });
      for (const r of c.reqs) if (r.need - r.have > 1e-6) { const m = pm[r.mat] = pm[r.mat] || { miss: 0, q: 0, unit: r.unit }; m.miss += r.need - r.have; m.q = Math.max(m.q, r.minQ); }
    }
    h += `<div class="pipe"></div><div class="win tight"><span class="pill">To-do dieses Plans</span><div class="todo3">
      <div><div class="th">🎯 Missionen</div>${pmis.map(b => `<div class="trow"><span>Blueprint ${esc(b ? b.name : '?')}</span></div>`).join('') || '<div class="trow dim">nichts</div>'}</div>
      <div><div class="th">⛏ Abbauen</div>${Object.entries(pm).sort((a, b) => b[1].miss - a[1].miss).map(([m, v]) => `<div class="trow"><span>${esc(resName(m))}</span><b>${fmtAmt(v.miss, v.unit)}</b><i>Q${v.q}</i></div>`).join('') || '<div class="trow dim">nichts</div>'}</div>
      <div><div class="th">🔧 Jetzt craften</div>${pcr.map(x => `<div class="trow"><span>${x.n} × ${esc(x.bp.name)}</span></div>`).join('') || '<div class="trow dim">nichts</div>'}</div>
    </div></div>`;
  }
  h += `</div></div>`;
  el.innerHTML = h;

  // Ereignisse
  $$('.prow', el).forEach(r => r.onclick = e => { if (e.target.closest('button')) return; S.ui.plan = r.dataset.plan; save(); render(); });
  $$('[data-pa]', el).forEach(b => b.onclick = () => planAction(b.closest('.prow').dataset.plan, b.dataset.pa));
  const nb = $('#plan-new', el); if (nb) nb.onclick = newPlan;
  const nf = $('#plan-fit', el); if (nf) nf.onclick = () => openFittingImport(null);
  if (plan) {
    $('#it-add', el).onclick = () => openBpPicker(plan);
    $('#it-list', el).onclick = () => openListImport(plan);
    $('#it-goal', el).onclick = () => openGoalDialog(plan);
    $$('[data-ia]', el).forEach(x => {
      const ev = x.tagName === 'INPUT' || x.tagName === 'SELECT' ? 'onchange' : 'onclick';
      x[ev] = () => itemAction(plan, x.dataset.it, x.dataset.ia, x);
    });
  }
}

async function newPlan() {
  openModal(`<h3>Neuer Plan</h3><div class="form"><div class="fld" style="flex:1"><label>Name</label><input id="np-name" placeholder="z. B. Centaurus Kampf-Ausbau"></div></div>
    <div class="foot"><button class="k" id="np-x">Abbrechen</button><button class="k pri" id="np-go">Anlegen</button></div>`, box => {
    const inp = $('#np-name', box); inp.focus();
    const go = () => { const n = inp.value.trim(); if (!n) return; const p = { id: uid(), name: n, items: [] }; S.plans.push(p); S.ui.plan = p.id; hist('Plan angelegt: ' + n); closeModal(); save(); render(); };
    $('#np-go', box).onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') go(); }; $('#np-x', box).onclick = closeModal;
  });
}
async function planAction(id, a) {
  const i = S.plans.findIndex(p => p.id === id); const p = S.plans[i]; if (!p) return;
  if (a === 'up' && i > 0) [S.plans[i - 1], S.plans[i]] = [S.plans[i], S.plans[i - 1]];
  if (a === 'down' && i < S.plans.length - 1) [S.plans[i + 1], S.plans[i]] = [S.plans[i], S.plans[i + 1]];
  if (a === 'copy') { const c = JSON.parse(JSON.stringify(p)); c.id = uid(); c.name = p.name + ' (Kopie)'; c.items.forEach(x => { x.id = uid(); x.built = 0; }); S.plans.splice(i + 1, 0, c); S.ui.plan = c.id; }
  if (a === 'ren') {
    openModal(`<h3>Plan umbenennen</h3><input id="rn" value="${esc(p.name)}" style="width:100%"><div class="foot"><button class="k" id="rn-x">Abbrechen</button><button class="k pri" id="rn-go">Speichern</button></div>`, box => {
      const inp = $('#rn', box); inp.focus(); inp.select();
      const go = () => { if (inp.value.trim()) p.name = inp.value.trim(); closeModal(); save(); render(); };
      $('#rn-go', box).onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') go(); }; $('#rn-x', box).onclick = closeModal;
    });
    return;
  }
  if (a === 'del') { if (!await ask(`Plan „${esc(p.name)}“ mit ${p.items.length} Bauteilen löschen?<br><span class="dim">Lager und Blueprints bleiben unverändert.</span>`, 'Löschen', true)) return; S.plans.splice(i, 1); hist('Plan gelöscht: ' + p.name); S.ui.plan = (S.plans[0] || {}).id || null; }
  save(); render();
}
async function itemAction(plan, id, a, el) {
  const it = plan.items.find(x => x.id === id); if (!it) return;
  if (a === 'toggle') S.ui.open[id] = !S.ui.open[id];
  if (a === 'plus') it.qty++;
  if (a === 'minus') it.qty = Math.max(1, it.qty - 1);
  if (a === 'q') it.minQ = Math.max(0, Math.min(1000, Math.round(num(el.value))));
  if (a === 'pick') { it.pick = it.pick || {}; it.pick[el.dataset.slot] = +el.value; }
  if (a === 'goal') { openGoalDialog(plan, it); return; }
  if (a === 'del') { if (!await ask(`„${esc(itemName(it))}“ aus dem Plan nehmen?`, 'Entfernen', true)) return; plan.items = plan.items.filter(x => x.id !== id); }
  if (a === 'built') { await markBuilt(plan, it); return; }
  save(); render();
}
async function markBuilt(plan, it) {
  if (!it || it.kind === 'mat') return;
  const bp = BP[it.bp]; const c = CALC.items[it.id];
  if ((it.built || 0) >= it.qty) { toast('Schon alle gebaut'); return; }
  openCraftDialog(plan, it, bp, c);
}
/* Craften: je Zutat Lagerposten wählen (mischbar). Vorschlag = beste zuerst, auffüllen bis zur Menge, solange der Schnitt das Ziel hält. */
function craftVorschlag(r) {
  const list = S.stacks.filter(s => s.mat === r.mat).map(s => ({ id: s.id, left: s.amount, q: s.q ?? 0 })).sort((a, b) => b.q - a.q);
  const mix = mischen(list, r.per, r.minQ);
  if (mix.have + 1e-9 < r.per) {   // Ziel nicht erreichbar: trotzdem mit den Besten auffüllen, damit man sieht, was fehlt
    const list2 = S.stacks.filter(s => s.mat === r.mat).map(s => ({ id: s.id, left: s.amount, q: s.q ?? 0 })).sort((a, b) => b.q - a.q);
    return mischen(list2, r.per, 0).takes;
  }
  return mix.takes;
}
function openCraftDialog(plan, it, bp, c) {
  const reqs = c.reqs.filter(r => r.per > 0);
  const sel = reqs.map(r => Object.fromEntries(craftVorschlag(r).map(t => [t.id, t.take])));
  const stapel = r => S.stacks.filter(s => s.mat === r.mat).sort((a, b) => (b.q ?? 0) - (a.q ?? 0));
  const zeile = (r, i) => {
    const st = stapel(r);
    return `<div class="win tight" style="margin:8px 0"><span class="pill">${esc(resName(r.mat))}</span><span class="sub">braucht ${fmtAmt(r.per, r.unit)} · Ziel Ø Q${r.minQ}</span>
      ${st.length ? `<table class="ptab"><tr><th class="l">Lagerposten</th><th>Q</th><th>vorhanden</th><th>nehmen (${r.unit === 'Stk' ? 'Stk' : 'SCU'})</th></tr>
      ${st.map(s => `<tr><td class="l">${esc(s.loc || 'ohne Ort')}${s.note ? ' <span class="dim">· ' + esc(s.note) + '</span>' : ''}</td><td>${s.q ?? '–'}</td><td>${fmtAmt(s.amount, s.unit)}</td>
        <td><input type="number" min="0" step="any" data-cr="${i}" data-st="${s.id}" value="${sel[i][s.id] ? +sel[i][s.id].toFixed(4) : ''}" style="width:110px"></td></tr>`).join('')}</table>`
      : '<div class="empty">Nichts davon im Lager.</div>'}
      <div class="hint" id="cr-sum-${i}"></div></div>`;
  };
  const summe = (box) => {
    let ok = true;
    reqs.forEach((r, i) => {
      let A = 0, Sq = 0;
      for (const s of stapel(r)) { const v = Math.min(s.amount, Math.max(0, num((box.querySelector(`[data-cr="${i}"][data-st="${s.id}"]`) || {}).value))); A += v; Sq += v * (s.q ?? 0); }
      const avg = A > 0 ? Sq / A : 0, mengeOk = A + 1e-9 >= r.per, qOk = avg + 1e-9 >= r.minQ;
      ok = ok && mengeOk;
      $('#cr-sum-' + i, box).innerHTML = `Gewählt: <b>${fmtAmt(A, r.unit)}</b> von ${fmtAmt(r.per, r.unit)} ${mengeOk ? '<span class="ok">✓</span>' : '<span class="bad">fehlt ' + fmtAmt(r.per - A, r.unit) + '</span>'}
        · Ø Qualität <b class="${qOk ? 'ok' : 'warn'}">${A > 0 ? Math.round(avg) : '–'}</b> ${qOk ? '' : '<span class="warn">(unter Ziel Q' + r.minQ + ')</span>'}`;
    });
    return ok;
  };
  openModal(`<h3>Craften: 1 × ${esc(bp.name)}</h3>
    <div class="hint" style="margin-top:0">Wähle, welches Material du verwendest. Im Spiel wird gemischt: Die Qualität ist der Durchschnitt nach Menge. Vorgeschlagen ist „beste zuerst, mit schlechterer auffüllen“.</div>
    ${reqs.map(zeile).join('') || '<div class="empty">Dieses Bauteil braucht kein Material aus dem Lager.</div>'}
    <div class="foot"><button class="k" data-a="best">Beste zuerst</button><button class="k" data-a="x">Abbrechen</button><button class="k pri" data-a="ok">Gebaut – abbuchen</button></div>`, box => {
    box.classList.add('wide');
    box.addEventListener('input', () => summe(box)); summe(box);
    $$('button', box).forEach(b => b.onclick = async () => {
      if (b.dataset.a === 'x') return closeModal();
      if (b.dataset.a === 'best') { reqs.forEach((r, i) => { const v = Object.fromEntries(craftVorschlag(r).map(t => [t.id, t.take])); $$(`[data-cr="${i}"]`, box).forEach(inp => inp.value = v[inp.dataset.st] ? +v[inp.dataset.st].toFixed(4) : ''); }); summe(box); return; }
      if (!summe(box) && !await ask('Für mindestens eine Zutat ist zu wenig gewählt. Trotzdem als gebaut eintragen und nur das Gewählte abbuchen?', 'Trotzdem')) return;
      const teile = [];
      reqs.forEach((r, i) => {
        let A = 0, Sq = 0;
        for (const s of stapel(r)) {
          const inp = box.querySelector(`[data-cr="${i}"][data-st="${s.id}"]`); const v = Math.min(s.amount, Math.max(0, num(inp ? inp.value : 0)));
          if (v > 1e-9) { s.amount -= v; A += v; Sq += v * (s.q ?? 0); }
        }
        if (A > 0) teile.push(`${fmtAmt(A, r.unit)} ${resName(r.mat)} Ø Q${Math.round(Sq / A)}`);
      });
      S.stacks = S.stacks.filter(s => s.amount > 1e-6);
      it.built = (it.built || 0) + 1;
      hist(`Gecraftet: 1 × ${bp.name} (Plan ${plan.name})${teile.length ? ' – ' + teile.join(', ') : ''}`);
      setComm('GECRAFTET · 1 × ' + bp.name.toUpperCase());
      closeModal(); save(); render();
    });
  });
}
function consume(mat, amount, minQ) {
  const list = S.stacks.filter(s => s.mat === mat && (s.q ?? 0) >= minQ).sort((a, b) => (a.q ?? 0) - (b.q ?? 0));
  let left = amount;
  for (const s of list) {
    if (left <= 1e-9) break;
    const take = Math.min(s.amount, left); s.amount -= take; left -= take;
  }
  S.stacks = S.stacks.filter(s => s.amount > 1e-6);
}

/* Material-Ziel: Material sammeln ohne Bauteil/Blueprint (z. B. 50 SCU Quantanium ab Q700) */
function openGoalDialog(plan, it) {
  const unit0 = it ? 'SCU' : (S.settings.inUnit || 'SCU');
  const amt0 = it ? (resUnit(it.mat) === 'Stk' ? it.amount : FI(fromSCU(it.amount, unit0), 6)) : '';
  openModal(`<h3>${it ? 'Material-Ziel ändern' : 'Material sammeln'} · ${esc(plan.name)}</h3>
    <div class="form">
      <div class="fld" style="min-width:220px"><label>Material</label><div><input id="gd-m" autocomplete="off" placeholder="quan… → Quantanium" value="${it ? esc(resName(it.mat)) : ''}"></div></div>
      <div class="fld"><label id="gd-ul">Menge</label><div style="display:flex;gap:4px"><input id="gd-a" inputmode="decimal" value="${amt0}" placeholder="z. B. 50" style="width:110px">${unitSelect('gd-u', unit0)}</div></div>
      <div class="fld"><label>ab Qualität</label><input id="gd-q" type="number" inputmode="numeric" min="0" max="1000" step="50" value="${it ? it.minQ : S.settings.defaultQ}" style="width:110px"></div></div>
    <div class="hint">Zählt ins To-do unter „Abbauen“ und reserviert passendes Lager, wie ein Bauteil. Kein Blueprint nötig.</div>
    <div class="foot"><button class="k" id="gd-x">Abbrechen</button><button class="k pri" id="gd-go">${it ? 'Speichern' : 'Hinzufügen'}</button></div>`, box => {
    const m = $('#gd-m', box), u = $('#gd-u', box);
    if (it) m.dataset.value = it.mat;
    const upd = () => { const stk = resUnit(m.dataset.value || '') === 'Stk'; u.style.display = stk ? 'none' : ''; $('#gd-ul', box).textContent = stk ? 'Menge (Stück)' : 'Menge'; };
    attachAC(m, materialChoices, () => { upd(); $('#gd-a', box).focus(); });
    upd();
    $('#gd-x', box).onclick = closeModal;
    $('#gd-go', box).onclick = () => {
      const name = m.value.trim(); if (!name) { m.focus(); return; }
      let id = m.dataset.value;
      if (!id) { const hit = materialChoices(name).find(x => x.label.toLowerCase() === name.toLowerCase()); id = hit ? hit.value : 'uex:' + name; }
      const amount = resUnit(id) === 'Stk' ? Math.round(num($('#gd-a', box).value)) : toSCU($('#gd-a', box).value, u.value);
      if (amount <= 0) { $('#gd-a', box).focus(); return; }
      const minQ = Math.max(0, Math.min(1000, Math.round(num($('#gd-q', box).value))));
      if (it) Object.assign(it, { mat: id, amount, minQ });
      else plan.items.push({ id: uid(), kind: 'mat', mat: id, amount, minQ, qty: 0 });
      hist(`${it ? 'Material-Ziel geändert' : 'Material-Ziel'}: ${fmtAmt(amount, resUnit(id))} ${resName(id)} ab Q${minQ} (Plan ${plan.name})`);
      closeModal(); save(); render(); toast(it ? 'Gespeichert' : 'Material-Ziel hinzugefügt');
    };
    if (!it) setTimeout(() => m.focus(), 50);
  });
}

/* Blueprint-Auswahl zum Hinzufuegen */
function bpSearch(q, limit = 60) {
  q = q.toLowerCase().trim();
  const words = q.split(/\s+/).filter(Boolean);
  const out = [];
  for (const b of R.blueprints) {
    const hay = ((b.name || '') + ' ' + (b.type_de || '') + ' ' + (b.maker || '') + ' s' + (b.size || '')).toLowerCase();
    if (words.every(w => hay.includes(w))) out.push(b);
    if (out.length >= limit) break;
  }
  return out;
}
/* --- Bauteil-Auswahl mit Filtern (Schiff/FPS, Schiff, Komponente, Größe, Klasse, Grade) --- */
let QDRIVES = {};   // Quantum-Antriebe aus data/schiffe.json: id -> {name, size, speed Gm/s, spool s, fuel SCU je Gm}
let SHIPS = null;   // aus data/schiffe.json: [{id, name, slots:[{type, size, n}]}]
async function loadShips() {
  if (SHIPS) return SHIPS;
  try { const j = await fetch('data/schiffe.json').then(r => r.json()); SHIPS = j.ships || []; QDRIVES = {}; (j.drives || []).forEach(d => QDRIVES[d.id] = d); } catch (e) { SHIPS = []; }
  return SHIPS;
}
const PICK_TYPES = [['WeaponGun', 'Waffe'], ['Cooler', 'Kühler'], ['Shield', 'Schild'], ['PowerPlant', 'Generator'], ['QuantumDrive', 'Quantum'],
  ['Radar', 'Radar'], ['WeaponMining', 'Mining-Laser'], ['MiningModifier', 'Mining-Modul'], ['TractorBeam', 'Traktor'],
  ['SalvageHead', 'Salvage-Kopf'], ['SalvageModifier', 'Salvage-Modul'], ['_rest', 'Sonstiges']];
const PICK_FPS = [['Char_Armor_Helmet', 'Helm'], ['Char_Armor_Torso', 'Torso'], ['Char_Armor_Arms', 'Arme'], ['Char_Armor_Legs', 'Beine'],
  ['Char_Armor_Backpack', 'Rucksack'], ['Char_Armor_Undersuit', 'Unteranzug'], ['WeaponPersonal', 'Handwaffe'], ['WeaponAttachment', 'Aufsatz'], ['_rest', 'Sonstiges']];
const PICK_CLS = ['Military', 'Civilian', 'Industrial', 'Stealth', 'Competition'];
const pickType = (b, list) => list.some(([t]) => t === b.type) ? b.type : '_rest';
const isShipBp = b => /^Vehicle/.test(b.category || '');
// Welche (Typ, Größe) passen aufs Schiff? Module (Mining/Salvage) passen in jeder Größe, wenn der Kopf da ist.
function shipFits(ship) {
  const fit = new Set(ship.slots.map(s => s.type + ':' + s.size)), has = new Set(ship.slots.map(s => s.type));
  return b => fit.has(b.type + ':' + b.size) || (b.type === 'MiningModifier' && has.has('WeaponMining')) || (b.type === 'SalvageModifier' && has.has('SalvageHead'));
}
// Rüstungs-Sets: Namen wie „ADP Arms Black“ = Rüstung „ADP“ + Teil + Set „Black“ (ohne Zusatz = „Standard“)
const ARMOR_PW = { Char_Armor_Helmet: 'Helmet', Char_Armor_Torso: 'Core', Char_Armor_Arms: 'Arms', Char_Armor_Legs: 'Legs', Char_Armor_Backpack: 'Backpack' };
const SET_PARTS = [['Char_Armor_Helmet', 'Helm'], ['Char_Armor_Torso', 'Torso'], ['Char_Armor_Arms', 'Arme'], ['Char_Armor_Legs', 'Beine'],
  ['Char_Armor_Backpack', 'Rucksack'], ['Char_Armor_Undersuit', 'Unteranzug']];
const SET_OPT = ['Char_Armor_Helmet', 'Char_Armor_Backpack', 'Char_Armor_Undersuit'];   // fehlt das passende Teil -> wahlweise ein anderes
function armorIndex() {
  if (ARMORS) return ARMORS;
  const g = {};
  for (const b of R.blueprints) {
    const w = ARMOR_PW[b.type]; if (!w) continue;
    const m = (b.name || '').match(new RegExp('^(.*?)\\s+' + w + '(?:\\s+(.*))?$'));
    if (!m) continue;
    const a = m[1].trim(), set = (m[2] || '').trim().replace(/^Base$/i, '') || 'Standard';   // „Base“ (Arme/Beine) = „Standard“ (Torso ohne Zusatz)
    ((g[a] = g[a] || {})[set] = g[a][set] || {})[b.type] = b.id;
  }
  ARMORS = Object.fromEntries(Object.entries(g).filter(([, sets]) => Object.values(sets).some(p => p.Char_Armor_Torso || p.Char_Armor_Arms || p.Char_Armor_Legs)));
  return ARMORS;
}
// alte Bauteil-Auswahl (ersetzt durch den Katalog in katalog.js, bleibt als Rückfall)
function openBpPickerAlt(plan, preset) {
  const F = { fps: false, set: false, armor: null, setName: null, ship: null, types: new Set(), sizes: new Set(), cls: new Set(), grades: new Set(), mine: false };
  const chip = (k, v, label, on, off) => `<span data-${k}="${esc(v)}" class="${on ? 'on' : ''}${off ? ' off' : ''}">${label}</span>`;
  openModal(`<h3>Bauteil zum Plan „${esc(plan.name)}“</h3>
    <div class="fchips" id="bpp-mode"></div>
    <div id="bpp-shipbox"><div class="flbl">Schiff (optional)</div>
      <div class="search" style="margin:0"><input id="bpp-ship" placeholder="Schiff suchen, z. B. „Zeus ES“, „Golem“" autocomplete="off"></div>
      <div class="fchips" id="bpp-shiphits" style="margin-top:6px"></div><div id="bpp-slots" class="fslots"></div></div>
    <div id="bpp-filters"></div>
    <div class="search" style="margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <input id="bpp-q" placeholder="Name suchen …" value="${esc(preset || '')}" style="flex:1;min-width:180px">
      <label class="ftog"><input type="checkbox" id="bpp-mine"> Nur meine Blueprints</label></div>
    <div id="bpp-count" class="flbl" style="margin-top:8px"></div>
    <div id="bpp-list" style="max-height:42vh;overflow:auto"></div>
    <div class="form" style="margin-top:10px"><div class="fld"><label>Anzahl</label><input id="bpp-n" type="number" min="1" value="1" style="width:90px"></div>
      <div class="fld"><label>ab Qualität</label><input id="bpp-qq" type="number" min="0" max="1000" step="50" value="${S.settings.defaultQ}" style="width:110px"></div></div>
    <div class="foot"><button class="k" id="bpp-x">Fertig</button></div>`, async box => {
    const q = $('#bpp-q', box), list = $('#bpp-list', box), shipIn = $('#bpp-ship', box);
    const toggle = (set, v) => set.has(v) ? set.delete(v) : set.add(v);
    const drawFilters = () => {
      const fits = F.ship && !F.fps ? shipFits(F.ship) : null;
      const types = F.fps ? PICK_FPS : PICK_TYPES;
      const pool = R.blueprints.filter(b => (F.fps ? /^FPS/.test(b.category || '') : isShipBp(b)) && (!F.mine || isOwned(b.id)));
      const avail = new Set(pool.filter(b => !fits || fits(b)).map(b => pickType(b, types)));
      let h = F.fps ? `<div class="fchips" style="margin-top:8px">${chip('fx', '0', 'Einzelteile', !F.set)}${chip('fx', '1', '🛡 Ganzes Set', F.set)}</div>` : '';
      if (!F.set || !F.fps) h += `<div class="flbl">${F.fps ? 'Art' : 'Komponente'}</div><div class="fchips">${types.filter(([t]) => !(F.fps || F.mine) || avail.has(t)).map(([t, l]) => {
        const sz = fits ? [...new Set(F.ship.slots.filter(s => s.type === t).map(s => s.size))].sort() : [];
        return chip('ft', t, esc(l) + (sz.length ? ` <small>S${sz.join('/')}</small>` : ''), F.types.has(t), !avail.has(t));
      }).join('')}</div>`;
      if (F.fps && F.set) h = h.replace(/<div class="flbl">Art[\s\S]*$/, '');
      if (!F.fps) {
        h += F.ship ? '<div class="flbl">Größe <i>– vom Schiff vorgegeben</i></div>'
          : `<div class="flbl">Größe</div><div class="fchips">${[0, 1, 2, 3, 4, 5, 6].map(s => chip('fs', s, 'S' + s, F.sizes.has(s))).join('')}</div>`;
        h += `<div class="flbl">Klasse <i>– nur Komponenten</i></div><div class="fchips">${PICK_CLS.map(c => chip('fc', c, c, F.cls.has(c))).join('')}</div>
          <div class="flbl">Grade <i>– nur Komponenten</i></div><div class="fchips">${[1, 2, 3, 4].map(g => chip('fg', g, 'ABCD'[g - 1], F.grades.has(g))).join('')}</div>`;
      }
      $('#bpp-filters', box).innerHTML = h;
      $('#bpp-mode', box).innerHTML = chip('fm', 'ship', '🚀 Schiff', !F.fps) + chip('fm', 'fps', '🧍 FPS', F.fps);
      $('#bpp-shipbox', box).style.display = F.fps ? 'none' : '';
      $('#bpp-slots', box).innerHTML = F.ship ? `<b>${esc(F.ship.name)}</b> <button class="k sm" id="bpp-noship">✕</button><br>Steckplätze: ${F.ship.slots.map(s => `<span>${esc((PICK_TYPES.find(([t]) => t === s.type) || [0, s.type])[1])} S${s.size}${s.n > 1 ? ' ×' + s.n : ''}</span>`).join(' ')}` : '';
      $$('[data-fm]', box).forEach(c => c.onclick = () => { F.fps = c.dataset.fm === 'fps'; F.types.clear(); drawFilters(); draw(); });
      $$('[data-fx]', box).forEach(c => c.onclick = () => { F.set = c.dataset.fx === '1'; q.value = ''; drawFilters(); draw(); });
      $$('[data-ft]', box).forEach(c => c.onclick = () => { if (c.classList.contains('off')) return; toggle(F.types, c.dataset.ft); drawFilters(); draw(); });
      $$('[data-fs]', box).forEach(c => c.onclick = () => { toggle(F.sizes, +c.dataset.fs); drawFilters(); draw(); });
      $$('[data-fc]', box).forEach(c => c.onclick = () => { toggle(F.cls, c.dataset.fc); drawFilters(); draw(); });
      $$('[data-fg]', box).forEach(c => c.onclick = () => { toggle(F.grades, +c.dataset.fg); drawFilters(); draw(); });
      const ns = $('#bpp-noship', box); if (ns) ns.onclick = () => { F.ship = null; F.types.clear(); shipIn.value = ''; drawFilters(); draw(); };
    };
    const addItem = (id, n, qq) => {
      const ex = plan.items.find(x => x.bp === id && x.minQ === qq);
      if (ex) ex.qty += n; else plan.items.push({ id: uid(), bp: id, qty: n, minQ: qq, built: 0, pick: {} });
    };
    const ownTag = id => `<span class="tag ${isOwned(id) ? 'ok' : 'bad'}">${isOwned(id) ? '✓ hab ich' : 'BP fehlt'}</span>`;
    const drawSet = () => {
      const AX = armorIndex(), words = q.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      const ownSet = p => Object.values(p).some(isOwned);   // „Nur meine“: nur Rüstungen/Sets, von denen ich mind. ein Teil habe
      const armors = Object.keys(AX).sort((a, b) => a.localeCompare(b)).filter(a => words.every(w => a.toLowerCase().includes(w)) && (!F.mine || Object.values(AX[a]).some(ownSet)));
      $('#bpp-count', box).textContent = armors.length + ' Rüstungen' + (F.armor ? ' · ' + Object.keys(AX[F.armor]).length + ' Sets „' + F.armor + '“' : '');
      let h = `<div class="flbl">1 · Rüstung</div><div class="fchips">${armors.map(a => chip('fa', a, esc(a), F.armor === a)).join('') || '<span class="off">keine Rüstung gefunden</span>'}</div>`;
      const sets = F.armor ? Object.keys(AX[F.armor]).filter(t => !F.mine || ownSet(AX[F.armor][t])).sort((x, y) => (y === 'Standard') - (x === 'Standard') || x.localeCompare(y)) : [];
      if (F.armor) h += `<div class="flbl">2 · Set</div><div class="fchips">${sets.map(t => chip('fset', t, esc(t), F.setName === t)).join('')}</div>`;
      const parts = F.armor && F.setName ? AX[F.armor][F.setName] : null;
      if (parts) {
        h += '<div class="flbl">3 · Teile</div>';
        for (const [t, l] of SET_PARTS) {
          const id = parts[t] && (!F.mine || isOwned(parts[t])) ? parts[t] : null;
          if (id) h += `<div class="fitrow"><label class="fc"><input type="checkbox" data-sp="${id}" checked> ${l}</label><div class="fm"><b>${esc(BP[id].name)}</b> ${ownTag(id)}</div></div>`;
          else if (SET_OPT.includes(t)) {
            const same = b => (b.name || '').endsWith(' ' + F.setName);
            const opts = R.blueprints.filter(b => b.type === t && (!F.mine || isOwned(b.id))).sort((a, b) => same(b) - same(a) || a.name.localeCompare(b.name));
            if (!opts.length) h += `<div class="fitrow no"><label class="fc dim">${l}</label><div class="fm dim">keinen Blueprint dafür</div></div>`;
            else h += `<div class="fitrow"><label class="fc">${l} <span class="dim">· wahlweise</span></label><div class="fm"><select data-so="1" style="width:100%"><option value="">— keiner —</option>${opts.map(b => `<option value="${b.id}">${esc(b.name)}${isOwned(b.id) ? '  ✓' : ''}</option>`).join('')}</select></div></div>`;
          } else h += `<div class="fitrow no"><label class="fc dim">${l}</label><div class="fm dim">${parts[t] ? 'Blueprint hast du nicht' : 'gibt es in diesem Set nicht'}</div></div>`;
        }
        h += '<div class="row2" style="margin-top:10px"><button class="k pri" id="bpp-setadd">Set hinzufügen</button></div>';
      }
      list.style.maxHeight = 'none'; list.innerHTML = h;
      $$('[data-fa]', list).forEach(c => c.onclick = () => { F.armor = c.dataset.fa; const s = Object.keys(AX[F.armor]); F.setName = s.length === 1 ? s[0] : null; drawSet(); });
      $$('[data-fset]', list).forEach(c => c.onclick = () => { F.setName = c.dataset.fset; drawSet(); });
      const sa = $('#bpp-setadd', list);
      if (sa) sa.onclick = () => {
        const ids = [...$$('[data-sp]', list).filter(c => c.checked).map(c => c.dataset.sp), ...$$('[data-so]', list).map(s => s.value).filter(Boolean)];
        if (!ids.length) { toast('Nichts ausgewählt'); return; }
        const n = Math.max(1, Math.round(num($('#bpp-n', box).value))), qq = Math.round(num($('#bpp-qq', box).value));
        ids.forEach(id => addItem(id, n, qq));
        hist(`Rüstungs-Set ${F.armor} ${F.setName}: ${ids.length} Teile → Plan ${plan.name}`);
        save(); toast(`${F.armor} ${F.setName}: ${ids.length} Teile hinzugefügt`); render();
      };
    };
    const draw = () => {
      if (F.fps && F.set) return drawSet();
      list.style.maxHeight = '42vh';
      const fits = F.ship && !F.fps ? shipFits(F.ship) : null, types = F.fps ? PICK_FPS : PICK_TYPES;
      const words = q.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      const res = R.blueprints.filter(b => {
        if (F.fps ? !/^FPS/.test(b.category || '') : !isShipBp(b)) return false;
        if (fits && !fits(b)) return false;
        if (F.types.size && !F.types.has(pickType(b, types))) return false;
        if (!F.fps && !fits && F.sizes.size && !F.sizes.has(b.size)) return false;
        if (!F.fps && F.cls.size && !F.cls.has(b.cls)) return false;
        if (!F.fps && F.grades.size && (!b.cls || !F.grades.has(b.grade))) return false;
        if (F.mine && !isOwned(b.id)) return false;
        if (words.length) { const hay = ((b.name || '') + ' ' + (b.type_de || '') + ' ' + (b.maker || '') + ' s' + (b.size ?? '')).toLowerCase(); if (!words.every(w => hay.includes(w))) return false; }
        return true;
      }).sort((a, b) => (a.type || '').localeCompare(b.type || '') || (a.size || 0) - (b.size || 0) || a.name.localeCompare(b.name));
      const shown = res.slice(0, 150);
      $('#bpp-count', box).textContent = res.length + ' Treffer' + (res.length > shown.length ? ' – die ersten 150, Filter weiter eingrenzen' : '');
      list.innerHTML = `<table class="ptab">${shown.map(b => `<tr class="clickrow" data-id="${b.id}"><td class="name">${esc(b.name)}</td><td class="l dim">${esc(b.type_de || '')}${b.size ? ' S' + b.size : ''}</td><td class="l dim fmaker">${esc(b.maker || '')}</td><td class="l ${isOwned(b.id) ? 'ok' : 'bad'}">${isOwned(b.id) ? '✓ hab ich' : '✗ fehlt'}</td><td><button class="k sm pri">+</button></td></tr>`).join('')}</table>` + (res.length ? '' : '<div class="empty">Nichts gefunden – Filter lockern.</div>');
      $$('tr[data-id]', list).forEach(tr => tr.onclick = () => {
        const n = Math.max(1, Math.round(num($('#bpp-n', box).value))), qq = Math.round(num($('#bpp-qq', box).value));
        const ex = plan.items.find(x => x.bp === tr.dataset.id && x.minQ === qq);
        if (ex) ex.qty += n; else plan.items.push({ id: uid(), bp: tr.dataset.id, qty: n, minQ: qq, built: 0, pick: {} });
        save(); toast(`${n} × ${BP[tr.dataset.id].name} hinzugefügt`); render();
      });
    };
    q.oninput = draw;
    $('#bpp-mine', box).onchange = e => {
      F.mine = e.target.checked;
      if (F.mine) { const AX = F.set ? armorIndex() : null;   // gewählte Rüstung/Set ohne eigene Teile zurücksetzen
        if (AX && F.armor && !Object.values(AX[F.armor]).some(p => Object.values(p).some(isOwned))) { F.armor = null; F.setName = null; }
        if (AX && F.armor && F.setName && !Object.values(AX[F.armor][F.setName] || {}).some(isOwned)) F.setName = null; }
      drawFilters(); draw(); };
    $('#bpp-x', box).onclick = closeModal;
    drawFilters(); draw();
    const ships = await loadShips();
    shipIn.oninput = () => {
      const w = shipIn.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      const hits = w.length ? ships.filter(s => w.every(x => s.name.toLowerCase().includes(x))).slice(0, 10) : [];
      $('#bpp-shiphits', box).innerHTML = hits.map(s => `<span data-ship="${esc(s.id)}">${esc(s.name)}</span>`).join('') || (w.length ? '<span class="off">kein Schiff gefunden</span>' : '');
      $$('[data-ship]', box).forEach(c => c.onclick = () => {
        F.ship = ships.find(s => s.id === c.dataset.ship); F.types.clear(); F.sizes.clear();
        shipIn.value = ''; $('#bpp-shiphits', box).innerHTML = ''; drawFilters(); draw();
      });
    };
  });
}
function matchBpName(s) {
  const k = s.trim().toLowerCase();
  if (BPN[k]) return BPN[k][0];
  const hit = R.blueprints.find(b => (b.name || '').toLowerCase().endsWith(' ' + k) || (b.name || '').toLowerCase().includes(k));
  return hit ? hit.id : null;
}
/* --- Fitting / Liste einfügen (z. B. SPViewer-Cart, „2x M6A Cannon“) --- */
// Blueprint-Namen ohne Klassen-Präfix („Ind/3/A FullSpec-Max“ -> „fullspec-max“), wie Erkul/SPViewer sie schreiben
const fitKey = s => String(s || '').toLowerCase().replace(/^(mil|civ|ind|stl|cmp|com|cop)\/\d+\/[a-z]\s+/, '').replace(/\s+/g, ' ').trim();
function fitIndex() {
  if (FITN) return FITN;
  FITN = {};
  for (const b of R.blueprints || []) for (const k of new Set([fitKey(b.name), (b.name || '').trim().toLowerCase()])) (FITN[k] = FITN[k] || []).push(b.id);
  return FITN;
}
// Schiffsteile zuerst, dann nach Name
const fitSort = ids => [...new Set(ids)].sort((a, b) => (/^Vehicle/.test(BP[b].category) - /^Vehicle/.test(BP[a].category)) || BP[a].name.localeCompare(BP[b].name));
// Text -> [{name, qty}]; erkennt SPViewer-Cart (Name / „… aUEC each“ / Menge), sonst eine Zeile pro Teil
function parseFitting(text) {
  const L = String(text || '').split(/\r?\n/).map(s => s.replace(/ /g, ' ').trim()).filter(Boolean);
  const out = [];
  for (let i = 0; i + 1 < L.length; i++) {
    if (!/^[\d\s.,]+\s*aUEC\s+each$/i.test(L[i + 1])) continue;
    const q = /^\d+$/.test(L[i + 2] || '') ? +L[i + 2] : 1;
    out.push({ name: L[i], qty: q }); i += 2;
  }
  if (!out.length) for (const l of L) {
    if (/aUEC|›|^[\d\s.,%]+$/i.test(l)) continue;
    let m;
    if ((m = l.match(/^(\d+)\s*[x×*]?\s+(.+)$/i))) out.push({ name: m[2], qty: +m[1] });
    else if ((m = l.match(/^(.+?)\s*[x×*]\s*(\d+)$/i))) out.push({ name: m[1], qty: +m[2] });
    else out.push({ name: l, qty: 1 });
  }
  const sum = {};
  for (const o of out) { const k = o.name.trim(); if (!k) continue; sum[k] = (sum[k] || 0) + Math.max(1, o.qty || 1); }
  return Object.entries(sum).map(([name, qty]) => ({ name, qty }));
}
// Name -> {st:'ok'|'warn'|'no', ids:[...]}
function matchFitting(name) {
  const ix = fitIndex(), k = fitKey(name);
  if (ix[k]) return { st: ix[k].length === 1 ? 'ok' : 'warn', ids: fitSort(ix[k]) };
  if (k.length < 4) return { st: 'no', ids: [] };
  const wb = (hay, w) => new RegExp('(^|[^a-z0-9])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])').test(hay);
  const hits = Object.keys(ix).filter(x => x.length >= 4 && (wb(x, k) || wb(k, x))).flatMap(x => ix[x]);
  return hits.length ? { st: 'warn', ids: fitSort(hits).slice(0, 12) } : { st: 'no', ids: [] };
}
function openFittingImport(plan) {
  openModal(`<h3>Fitting / Liste einfügen</h3>
    <div class="hint" style="margin-top:0">SPViewer: Cart öffnen → Text markieren und kopieren → hier einfügen.<br>Oder eine einfache Liste, z. B. „2x M6A Cannon“, eine Zeile pro Teil.</div>
    <textarea id="fi-t" rows="9" style="width:100%;margin-top:8px" placeholder="Hier einfügen …"></textarea>
    <div class="foot"><button class="k" id="fi-x">Abbrechen</button><button class="k pri" id="fi-go">Erkennen ▸</button></div>`, box => {
    $('#fi-x', box).onclick = closeModal;
    $('#fi-go', box).onclick = () => {
      const rows = parseFitting($('#fi-t', box).value).map(r => ({ ...r, ...matchFitting(r.name), pick: 0, on: true }));
      if (!rows.length) { toast('Nichts erkannt – Text leer?'); return; }
      fittingPreview(plan, rows);
    };
  });
}
function fittingPreview(plan, rows) {
  const nOk = rows.filter(r => r.st !== 'no').length;
  const tgt = plan ? plan.id : '';
  openModal(`<h3>Erkannt: ${rows.length} Teile · ${nOk} craftbar</h3>
    <div id="fi-rows">${rows.map((r, i) => {
      const sel = r.ids.length ? (r.ids.length > 1
        ? `<select data-fp="${i}" style="max-width:100%">${r.ids.map((id, j) => `<option value="${j}">${esc(BP[id].name)} · ${esc(BP[id].type_de || '')}${BP[id].size ? ' S' + BP[id].size : ''}</option>`).join('')}</select>`
        : `<b>${esc(BP[r.ids[0]].name)}</b> <span class="dim">${esc(BP[r.ids[0]].type_de || '')}${BP[r.ids[0]].size ? ' S' + BP[r.ids[0]].size : ''}</span>`)
        : '<span class="bad">nicht craftbar – kaufen</span>';
      const own = r.ids.length ? `<span class="tag ${isOwned(r.ids[0]) ? 'ok' : 'bad'}" data-fo="${i}">${isOwned(r.ids[0]) ? '✓ hab ich' : 'BP fehlt'}</span>` : '';
      return `<div class="fitrow ${r.st}">
        <label class="fc">${r.ids.length ? `<input type="checkbox" data-fc="${i}" checked>` : '<span class="bad">✖</span>'} <span class="${r.st === 'ok' ? 'ok' : r.st === 'warn' ? 'warn' : 'dim'}">${r.st === 'ok' ? '✔' : r.st === 'warn' ? '⚠' : ''}</span> ${esc(r.name)}</label>
        <div class="fm">${sel} ${own}</div>
        <div class="fq">${r.ids.length ? `<input type="number" min="1" value="${r.qty}" data-fq="${i}" style="width:70px"> Stk` : `<span class="dim">${r.qty} Stk</span>`}</div></div>`;
    }).join('')}</div>
    ${rows.some(r => r.st === 'warn') ? '<div class="hint">⚠ = nicht eindeutig, bitte den richtigen Blueprint auswählen.</div>' : ''}
    <div class="form" style="margin-top:12px">
      <div class="fld" style="flex:1 1 260px"><label>Ziel</label><select id="fi-p"><option value="">➕ Neuer Plan</option>${S.plans.map(p => `<option value="${p.id}" ${p.id === tgt ? 'selected' : ''}>an „${esc(p.name)}“ anhängen</option>`).join('')}</select></div>
      <div class="fld" style="flex:1 1 220px" id="fi-nf"><label>Name neuer Plan</label><input id="fi-n" value="Neues Fitting"></div>
      <div class="fld"><label>ab Qualität</label><input id="fi-q" type="number" min="0" max="1000" step="50" value="${S.settings.defaultQ}" style="width:110px"></div>
    </div>
    <div class="foot"><button class="k" id="fi-b">◂ Zurück</button><button class="k pri" id="fi-ok">Übernehmen</button></div>`, box => {
    const upd = () => {
      $('#fi-nf', box).style.display = $('#fi-p', box).value ? 'none' : '';
      $('#fi-ok', box).textContent = `Übernehmen (${rows.filter(r => r.on && r.ids.length).length} Teile)`;
    };
    $$('[data-fc]', box).forEach(c => c.onchange = () => { rows[c.dataset.fc].on = c.checked; upd(); });
    $$('[data-fq]', box).forEach(c => c.onchange = () => { rows[c.dataset.fq].qty = Math.max(1, Math.round(num(c.value))); });
    $$('[data-fp]', box).forEach(c => c.onchange = () => {
      const r = rows[c.dataset.fp]; r.pick = +c.value; const id = r.ids[r.pick], t = $(`[data-fo="${c.dataset.fp}"]`, box);
      t.className = 'tag ' + (isOwned(id) ? 'ok' : 'bad'); t.textContent = isOwned(id) ? '✓ hab ich' : 'BP fehlt';
    });
    $('#fi-p', box).onchange = upd; upd();
    $('#fi-b', box).onclick = () => openFittingImport(plan);
    $('#fi-ok', box).onclick = () => {
      const take = rows.filter(r => r.on && r.ids.length);
      if (!take.length) { toast('Nichts ausgewählt'); return; }
      let p = S.plans.find(x => x.id === $('#fi-p', box).value);
      if (!p) { p = { id: uid(), name: $('#fi-n', box).value.trim() || 'Neues Fitting', items: [] }; S.plans.push(p); hist('Plan angelegt: ' + p.name); }
      const qq = Math.round(num($('#fi-q', box).value));
      for (const r of take) {
        const id = r.ids[r.pick] || r.ids[0], ex = p.items.find(x => x.bp === id && x.minQ === qq);
        if (ex) ex.qty += r.qty; else p.items.push({ id: uid(), bp: id, qty: r.qty, minQ: qq, built: 0, pick: {} });
      }
      hist(`Fitting eingefügt: ${take.length} Teile → Plan ${p.name}`);
      S.ui.plan = p.id; closeModal(); save(); render(); toast(`${take.length} Teile → „${p.name}“`);
    };
  });
}
const openListImport = openFittingImport;

/* Heute / To-do: siehe heute.js */

/* ------------------------------------------------------------------ */
/* BLUEPRINTS                                                           */
/* ------------------------------------------------------------------ */
function renderBlueprints() {
  if (typeof renderCatalog === 'function') return renderCatalog($('#bp'));
  const ui = S.ui; const inPlan = new Set(S.plans.flatMap(p => p.items.filter(i => i.bp).map(i => i.bp)));
  const types = [...new Set(R.blueprints.map(b => b.type_de).filter(Boolean))].sort();
  let list = R.blueprints;
  if (ui.bpFilter === 'own') list = list.filter(b => isOwned(b.id));
  if (ui.bpFilter === 'plan') list = list.filter(b => inPlan.has(b.id));
  if (ui.bpFilter === 'miss') list = list.filter(b => !isOwned(b.id));
  if (ui.bpType) list = list.filter(b => b.type_de === ui.bpType);
  if (ui.bpSearch) { const w = ui.bpSearch.toLowerCase().split(/\s+/).filter(Boolean); list = list.filter(b => { const h = ((b.name || '') + ' ' + (b.maker || '') + ' s' + (b.size || '')).toLowerCase(); return w.every(x => h.includes(x)); }); }
  const shown = list.slice(0, 400);
  const owned = Object.keys(S.owned).length;
  let h = `<div class="win tight"><span class="pill">Blueprints</span><span class="sub">${owned} von ${R.blueprints.length} · Patch ${esc(R.patch || '?')}</span>
    <div class="search"><input id="bp-q" placeholder="Suchen …" value="${esc(ui.bpSearch)}">
      <select id="bp-t"><option value="">Alle Typen</option>${types.map(t => `<option ${t === ui.bpType ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
    <div class="chips2">${[['all', 'Alle'], ['own', 'Hab ich (' + owned + ')'], ['plan', 'In Plänen (' + inPlan.size + ')'], ['miss', 'Fehlen']].map(([k, l]) => `<span data-bf="${k}" class="${ui.bpFilter === k ? 'on' : ''}">${l}</span>`).join('')}</div>
    <div class="scroll"><table class="ptab"><tr><th class="l">Name</th><th class="l">Typ</th><th>Gr.</th><th class="l">Hersteller</th><th class="l">Status</th><th class="l">Quelle</th><th></th></tr>
    ${shown.map(b => `<tr class="clickrow" data-bp="${b.id}"><td class="name">${esc(b.name)}</td><td class="l dim">${esc(b.type_de || '')}</td><td>${b.size ?? ''}</td><td class="l dim">${esc(b.maker || '')}</td>
      <td class="l">${isOwned(b.id) ? `<span class="tag ok">✓ ${S.owned[b.id].src === 'hand' ? 'von Hand' : S.owned[b.id].src === 'bild' ? 'Erfassung' : 'Log'}</span>` : '<span class="tag">fehlt</span>'}${inPlan.has(b.id) ? ' <span class="tag warn">im Plan</span>' : ''}</td>
      <td class="l dim" style="font-size:12px">${b.pools && b.pools.length ? b.pools.length + ' Missions-Pool(s)' : '–'}</td><td><button class="k sm" data-addbp="${b.id}">+ Plan</button></td></tr>`).join('')}
    </table></div>${list.length > shown.length ? `<div class="hint">${list.length - shown.length} weitere – Suche eingrenzen.</div>` : ''}${!list.length ? '<div class="empty">Nichts gefunden.</div>' : ''}</div>`;
  const el = $('#bp'); el.innerHTML = h;
  const q = $('#bp-q', el); q.oninput = () => { S.ui.bpSearch = q.value; clearTimeout(q.t); q.t = setTimeout(() => { renderBlueprints(); const n = $('#bp-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
  $('#bp-t', el).onchange = e => { S.ui.bpType = e.target.value; renderBlueprints(); };
  $$('[data-bf]', el).forEach(c => c.onclick = () => { S.ui.bpFilter = c.dataset.bf; renderBlueprints(); });
  $$('tr[data-bp]', el).forEach(r => r.onclick = e => { if (e.target.closest('button')) return; openBpDetail(r.dataset.bp); });
  $$('[data-addbp]', el).forEach(b => b.onclick = () => addToPlanDialog(b.dataset.addbp));
}
function addToPlanDialog(id) {
  const b = BP[id];
  if (!S.plans.length) { S.plans.push({ id: uid(), name: 'Mein erster Plan', items: [] }); S.ui.plan = S.plans[0].id; }
  openModal(`<h3>${esc(b.name)} → Plan</h3><div class="form">
    <div class="fld"><label>Plan</label><select id="ap-p">${S.plans.map(p => `<option value="${p.id}" ${p.id === S.ui.plan ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
    <div class="fld"><label>Anzahl</label><input id="ap-n" type="number" min="1" value="1" style="width:90px"></div>
    <div class="fld"><label>ab Qualität</label><input id="ap-q" type="number" min="0" max="1000" step="50" value="${S.settings.defaultQ}" style="width:110px"></div></div>
    <div class="foot"><button class="k" id="ap-x">Abbrechen</button><button class="k pri" id="ap-go">Hinzufügen</button></div>`, box => {
    $('#ap-x', box).onclick = closeModal;
    $('#ap-go', box).onclick = () => {
      const p = S.plans.find(x => x.id === $('#ap-p', box).value);
      p.items.push({ id: uid(), bp: id, qty: Math.max(1, Math.round(num($('#ap-n', box).value))), minQ: Math.round(num($('#ap-q', box).value)), built: 0, pick: {} });
      S.ui.plan = p.id; closeModal(); save(); render(); toast('Zum Plan hinzugefügt');
    };
  });
}
function openBpDetail(id) {
  const b = BP[id]; if (!b) return;
  const draw = q => {
    const slots = slotsOf(b);
    return slots.map(sl => `<div class="slot"><div class="sn">${esc(sl.name)}</div>
      ${sl.options.map(o => `<div>${fmtAmt(o.qty, o.unit)} <b>${esc(resName(o.id))}</b> <span class="dim">ab Q${o.minQ || 0}</span></div>`).join('<div class="dim">oder</div>')}
      ${sl.mods.map(m => { const v = modAt(m, q); const pct = (v - 1) * 100; return `<div class="eff">${esc(PROP_DE[m.prop] || m.prop)}: ${pct >= 0 ? '+' : ''}${F(pct, 1)} % bei Q${q} <span class="dim">(Q${m.q0}: ${F((m.m0 - 1) * 100, 1)} % … Q${m.q1}: +${F((m.m1 - 1) * 100, 1)} %)</span></div>`; }).join('')}
    </div>`).join('') || '<div class="empty">Kein Rezept hinterlegt.</div>';
  };
  openModal(`<h3>${esc(b.name)}</h3>
    <div class="dim" style="font-family:var(--vdu)">${esc(b.type_de || '')}${b.size ? ' · Größe ' + b.size : ''}${b.maker ? ' · ' + esc(b.maker) : ''} · Herstellzeit ${fmtDur(craftTime(b))}${b.name_de && b.name_de !== b.name && !/NOT FOUND/i.test(b.name_de) ? ' · DE: ' + esc(b.name_de) : ''}</div>
    <div style="margin:8px 0">${isOwned(id) ? `<span class="tag ok">✓ hab ich (${S.owned[id].src === 'hand' ? 'von Hand' : S.owned[id].src === 'bild' ? 'per Erfassung' : 'laut Log, ' + fmtTime(S.owned[id].ts)})</span>` : '<span class="tag bad">✗ fehlt noch</span>'}</div>
    <div class="form"><div class="fld"><label>Qualität des Materials (zeigt die Wirkung)</label><input id="bd-q" type="range" min="0" max="1000" step="10" value="${S.settings.defaultQ}" style="width:260px"></div><b id="bd-qv" class="green" style="font:20px var(--vdu)">${S.settings.defaultQ}</b></div>
    <div id="bd-slots">${draw(S.settings.defaultQ)}</div>
    <div class="slot"><div class="sn">Blueprint bekommt man aus diesen Missionen</div>${(b.pools || []).map(p => poolDetail(p) + (typeof scLinks === 'function' ? scLinks(p, 4) : '')).join('') || '<div class="dim">Keine Missions-Belohnung bekannt (evtl. Standard-Blueprint oder andere Quelle).</div>'}<div class="dim" style="font-size:12px;margin-top:4px">Quelle: Spieldaten ${esc(R.patch || '')} (Missions-Verträge) · Rang = Ruf-Stufe beim Auftraggeber · Links: SCMDB</div></div>
    <div class="foot"><button class="k" id="bd-own">${isOwned(id) ? 'Als „fehlt“ markieren' : 'Hab ich (von Hand)'}</button><button class="k pri" id="bd-add">+ zu Plan</button><button class="k" id="bd-x">Schließen</button></div>`, box => {
    const r = $('#bd-q', box);
    r.oninput = () => { $('#bd-qv', box).textContent = r.value; $('#bd-slots', box).innerHTML = draw(+r.value); };
    $('#bd-x', box).onclick = closeModal;
    $('#bd-add', box).onclick = () => addToPlanDialog(id);
    $('#bd-own', box).onclick = () => { if (isOwned(id)) delete S.owned[id]; else S.owned[id] = { src: 'hand', ts: now() }; hist((isOwned(id) ? 'Blueprint von Hand abgehakt: ' : 'Blueprint entfernt: ') + b.name); closeModal(); save(); render(); };
  });
}

/* ------------------------------------------------------------------ */
/* LAGER                                                                */
/* ------------------------------------------------------------------ */
function renderLager() {
  const tab = S.ui.lagerTab;
  let h = `<div class="subkeys">${[['bestand', 'Bestand'], ['ansicht', '🔲 Lager-Ansicht'], ['scan', '📷 Erfassung' + (typeof erfOffen === 'function' && erfOffen() ? ' · ' + erfOffen() : '')], ['move', 'Umlagerung'], ['calc', 'SCU-Rechner'], ['hist', 'Historie']].map(([k, l]) => `<div class="key ${tab === k ? 'on' : ''}" data-lt="${k}">${l}</div>`).join('')}</div>`;
  if (tab === 'bestand') h += lagerBestand();
  if (tab === 'calc') h += lagerCalc();
  if (tab === 'scan') h += erfHtml();
  if (tab === 'ansicht') h += laHtml();
  if (tab === 'move') h += lagerMoves();
  if (tab === 'hist') h += `<div class="win tight"><span class="pill">Historie</span><table class="ptab"><tr><th class="l">Zeit</th><th class="l">Was</th></tr>${S.history.slice(0, 300).map(x => `<tr><td class="l dim">${fmtTime(x.ts)}</td><td class="l" style="color:var(--txt)">${esc(x.text)}</td></tr>`).join('') || '<tr><td colspan="2" class="empty">Noch nichts passiert.</td></tr>'}</table></div>`;
  const el = $('#lager'); el.innerHTML = h;
  $$('[data-lt]', el).forEach(k => k.onclick = () => { S.ui.lagerTab = k.dataset.lt; save(); renderLager(); });
  if (tab === 'bestand') bindLager(el);
  if (tab === 'calc') bindCalc(el);
  if (tab === 'scan') erfBind(el);
  if (tab === 'ansicht') laBind(el);
  if (tab === 'move') bindMoves(el);
}
function lagerBestand() {
  const locs = [...new Set(S.stacks.map(s => s.loc || 'Ohne Lagerort'))].sort();
  const lf = S.ui.locFilter;
  let h = `<div class="win tight"><span class="pill">Bestand einbuchen</span>
    <div class="form">
      <div class="fld" style="min-width:220px"><label>Ware / Material</label><input id="bk-mat" autocomplete="off" placeholder="tara… → Taranite"></div>
      <div class="fld"><label id="bk-ul">Menge</label><div style="display:flex;gap:4px"><input id="bk-amt" placeholder="z. B. 50" style="width:100px">${unitSelect('bk-unit', S.settings.inUnit)}</div><span id="bk-conv" class="badge2">&nbsp;</span></div>
      <div class="fld"><label>Qualität 0–1000</label><input id="bk-q" type="number" min="0" max="1000" placeholder="–" style="width:110px"></div>
      <div class="fld" style="min-width:220px"><label>Lagerort</label><input id="bk-loc" autocomplete="off" placeholder="everus → Everus Harbor" value="${esc(S.settings.home || '')}"></div>
      <div class="fld" style="min-width:140px"><label>Notiz</label><input id="bk-note"></div>
      <div class="fld"><label>Verkauf</label><label class="ftog" style="white-space:nowrap"><input type="checkbox" id="bk-sell"> zum Verkauf freigeben</label><span id="bk-sellw" class="badge2">&nbsp;</span></div>
      <button class="k pri" id="bk-go">Einbuchen</button>
    </div>
    <div class="boxin" style="margin-top:8px"><span class="dim" style="font:12px var(--vdu)">Kisten (optional):</span>${[...BOX_SIZES, 0.125].map(s => `<label>${s === 0.125 ? '⅛' : s}<input type="number" min="0" data-box="${s}" placeholder="0"></label>`).join('')}</div>
    <div class="hint">Verkauf: Der Haken folgt deiner Einstellung (Material unter Q ${S.settings.sellQ} → Verkauf${S.settings.sellTrade ? ', Handelsware ohne Qualität → Verkauf' : ''}) – du kannst ihn überschreiben. Material aus Rezepten erkennt das Tool automatisch.</div></div>
  <div class="win tight"><span class="pill">Lagerbestand</span><button class="k sm" style="float:right" onclick="S.ui.lagerTab='ansicht';save();render()">🔲 Lager-Ansicht</button>
    <div class="chips2"><span data-lf="" class="${!lf ? 'on' : ''}">Alle Orte</span>${locs.map(l => `<span data-lf="${esc(l)}" class="${lf === l ? 'on' : ''}">${esc(l)}</span>`).join('')}</div>`;
  let total = 0;
  const groups = {};
  S.stacks.forEach(s => (groups[s.loc || 'Ohne Lagerort'] = groups[s.loc || 'Ohne Lagerort'] || []).push(s));
  for (const loc of Object.keys(groups).sort()) {
    if (lf && lf !== loc) continue;
    const items = groups[loc].sort((a, b) => resName(a.mat).localeCompare(resName(b.mat)) || (b.q ?? 0) - (a.q ?? 0));
    let val = 0, scu = 0;
    const rows = items.map(s => {
      const bp = bestPrice(s.mat); const res = CALC.reservedBy[s.id] || 0;
      const v = stackSell(s) && bp ? bp.sell * s.amount : 0; val += v;
      if (s.unit !== 'Stk') scu += s.amount;
      return `<tr class="${stackSell(s) ? '' : 'res'}"><td class="name">${matSym(s.mat)}${esc(resName(s.mat))} ${res > 1e-6 ? `<span class="tag warn">${fmtAmt(res, s.unit)} verplant</span>` : ''}${s.note ? `<div class="dim" style="font-size:12px">${esc(s.note)}</div>` : ''}</td>
        <td>${fmtAmt(s.amount, s.unit)}</td><td class="l">${crates(s.boxes)}</td><td class="l">${qTag(s.q)}</td>
        <td class="l">${bp ? `${N(bp.sell)} <span class="dim">/SCU</span><div class="dim" style="font-size:12px">${esc(bp.term)}${bp.age != null && bp.age > S.settings.staleDays ? ` <span class="tag">${bp.age} T alt</span>` : ''}</div>` : '<span class="dim">kein Käufer</span>'}</td>
        <td>${stackSell(s) ? (v ? N(v) : '–') : '<span class="dim">–</span>'}</td>
        <td class="l" style="white-space:nowrap">${s.unit === 'Stk' ? '' : `<label style="cursor:pointer" title="Antippen = umschalten"><input type="checkbox" data-sell="${s.id}" ${stackSell(s) ? 'checked' : ''} style="display:none">${sellTag(s)}</label>`}</td>
        <td style="white-space:nowrap"><button class="k sm" data-sa="edit" data-s="${s.id}">Bearbeiten</button> <button class="k sm" data-sa="move" data-s="${s.id}">Umbuchen</button>${S.settings.home && s.loc && norm2(s.loc) !== norm2(S.settings.home) ? ` <button class="k sm" data-sa="home" data-s="${s.id}" title="Umlagerung zur Home-Station in die Lager-Tour legen">→ ⌂</button>` : ''} <button class="k sm x" data-sa="del" data-s="${s.id}">×</button></td></tr>`;
    }).join('');
    total += val;
    h += `<div class="loc">${esc(loc)} <span>· ${F(scu, 2)} SCU${val ? ' · ' + N(val) + ' UEC' : ''}</span></div>
      <div class="scroll"><table class="ptab"><tr><th class="l">Ware</th><th>Menge</th><th class="l">Kisten</th><th class="l">Qual.</th><th class="l">Bester Preis</th><th>Wert</th><th class="l">Verkauf</th><th></th></tr>${rows}</table></div>`;
  }
  if (!S.stacks.length) h += '<div class="empty">Lager ist leer – oben einbuchen.</div>';
  h += `<div style="text-align:right;margin-top:10px">Lagerwert (zum Verkauf freigegeben) <span class="big green">${N(total)}</span> <span class="dim">UEC</span></div></div>`;
  return h;
}
function bindLager(el) {
  const mat = $('#bk-mat', el), loc = $('#bk-loc', el);
  const amtIn = $('#bk-amt', el), unitIn = $('#bk-unit', el), conv = $('#bk-conv', el);
  const isStk = () => resUnit(mat.dataset.value || '') === 'Stk';
  const showConv = () => {
    unitIn.style.display = isStk() ? 'none' : '';
    $('#bk-ul', el).textContent = isStk() ? 'Menge (Stück)' : 'Menge';
    const v = num(amtIn.value);
    conv.textContent = isStk() || !v ? ' ' : '= ' + F(toSCU(v, unitIn.value), 6) + ' SCU' + (unitIn.value !== 'cSCU' ? ' = ' + F(fromSCU(toSCU(v, unitIn.value), 'cSCU'), 2) + ' cSCU' : '');
  };
  attachAC(mat, materialChoices, () => { showConv(); amtIn.focus(); });
  attachAC(loc, locationChoices, () => $('#bk-note', el).focus());
  amtIn.oninput = showConv;
  // Verkaufs-Haken: folgt der Qualität, bis man ihn selbst anklickt
  const sellIn = $('#bk-sell', el), qIn = $('#bk-q', el);
  const qNow = () => { const v = qIn.value.trim(); return v === '' ? null : Math.max(0, Math.min(1000, Math.round(num(v)))); };
  const showSell = () => { if (!sellIn.dataset.man) sellIn.checked = autoSell(qNow()); $('#bk-sellw', el).textContent = sellIn.dataset.man ? 'von Hand' : 'automatisch'; };
  sellIn.onchange = () => { sellIn.dataset.man = '1'; showSell(); };
  qIn.oninput = showSell; showSell();
  unitIn.onchange = () => { S.settings.inUnit = unitIn.value; save(); showConv(); };
  $('#bk-go', el).onclick = () => {
    const name = mat.value.trim(); if (!name) { mat.focus(); return; }
    let id = mat.dataset.value;
    if (!id) { const hit = materialChoices(name).find(x => x.label.toLowerCase() === name.toLowerCase()); id = hit ? hit.value : 'uex:' + name; }
    const amount = resUnit(id) === 'Stk' ? Math.round(num(amtIn.value)) : toSCU(amtIn.value, unitIn.value);
    if (amount <= 0) { amtIn.focus(); return; }
    const qv = $('#bk-q', el).value.trim(); const q = qv === '' ? null : Math.max(0, Math.min(1000, Math.round(num(qv))));
    const boxes = {}; $$('[data-box]', el).forEach(i => { const n = Math.round(num(i.value)); if (n > 0) boxes[i.dataset.box] = n; });
    const st = { id: uid(), mat: id, amount, unit: resUnit(id), q, loc: loc.value.trim(), boxes, note: $('#bk-note', el).value.trim(), auto: !sellIn.dataset.man, keep: !sellIn.checked };
    S.stacks.push(st);
    hist(`Eingebucht: ${fmtAmt(amount, st.unit)} ${resName(id)}${q != null ? ' Q' + q : ''}${st.loc ? ' → ' + st.loc : ''}`);
    setComm('EINGEBUCHT · ' + fmtAmt(amount, st.unit).toUpperCase() + ' ' + resName(id).toUpperCase());
    save(); render(); setTimeout(() => $('#bk-mat') && $('#bk-mat').focus(), 30);
  };
  $$('[data-lf]', el).forEach(c => c.onclick = () => { S.ui.locFilter = c.dataset.lf; save(); renderLager(); });
  $$('[data-sell]', el).forEach(c => c.onchange = () => { const s = S.stacks.find(x => x.id === c.dataset.sell); setStackSell(s, c.checked); save(); render(); });
  $$('[data-sa]', el).forEach(b => b.onclick = () => stackAction(b.dataset.s, b.dataset.sa));
}
async function stackAction(id, a) {
  const s = S.stacks.find(x => x.id === id); if (!s) return;
  if (a === 'home') return moveHome(id);
  if (a === 'del') { const busy = S.sales.some(x => x.stack === id && x.status === 'tour') || S.moves.some(m => m.stack === id && m.status === 'tour');
    if (!await ask(`${fmtAmt(s.amount, s.unit)} ${esc(resName(s.mat))} aus dem Lager löschen?${busy ? '<br><span class="warn">Der Posten ist in der Lager-Tour eingeplant – der Stopp fällt dann weg.</span>' : ''}`, 'Löschen', true)) return; S.stacks = S.stacks.filter(x => x !== s); hist(`Gelöscht: ${fmtAmt(s.amount, s.unit)} ${resName(s.mat)}`); save(); render(); return; }
  if (a === 'edit') {
    openModal(`<h3>Bestand bearbeiten · ${esc(resName(s.mat))}</h3><div class="form">
      <div class="fld"><label>Menge</label><div style="display:flex;gap:4px"><input id="ed-a" value="${s.unit === 'Stk' ? s.amount : FI(fromSCU(s.amount, S.settings.inUnit), 6)}" style="width:110px">${s.unit === 'Stk' ? '<span class="dim">Stk</span>' : unitSelect('ed-u', S.settings.inUnit)}</div></div>
      <div class="fld"><label>Qualität</label><input id="ed-q" type="number" value="${s.q ?? ''}" style="width:110px"></div>
      <div class="fld" style="min-width:220px"><label>Lagerort</label><input id="ed-l" value="${esc(s.loc)}" autocomplete="off"></div>
      <div class="fld" style="min-width:160px"><label>Notiz</label><input id="ed-n" value="${esc(s.note)}"></div></div>
      <div class="boxin" style="margin-top:8px">${[...BOX_SIZES, 0.125].map(z => `<label>${z === 0.125 ? '⅛' : z}<input type="number" min="0" data-eb="${z}" value="${(s.boxes || {})[z] || ''}"></label>`).join('')}</div>
      <div class="foot"><button class="k" id="ed-x">Abbrechen</button><button class="k pri" id="ed-go">Speichern</button></div>`, box => {
      attachAC($('#ed-l', box), locationChoices);
      const eu = $('#ed-u', box);
      if (eu) { let last = eu.value; eu.onchange = () => { const a = $('#ed-a', box); a.value = FI(fromSCU(toSCU(a.value, last), eu.value), 6); last = eu.value; }; }
      $('#ed-x', box).onclick = closeModal;
      $('#ed-go', box).onclick = () => {
        s.amount = Math.max(0, eu ? toSCU($('#ed-a', box).value, eu.value) : Math.round(num($('#ed-a', box).value))); const qv = $('#ed-q', box).value.trim(); s.q = qv === '' ? null : Math.max(0, Math.min(1000, Math.round(num(qv))));
        s.loc = $('#ed-l', box).value.trim(); s.note = $('#ed-n', box).value.trim();
        s.boxes = {}; $$('[data-eb]', box).forEach(i => { const n = Math.round(num(i.value)); if (n > 0) s.boxes[i.dataset.eb] = n; });
        if (s.amount <= 1e-6) S.stacks = S.stacks.filter(x => x !== s);
        hist(`Bearbeitet: ${resName(s.mat)}`); closeModal(); save(); render();
      };
    });
  }
  if (a === 'move') {
    openModal(`<h3>Sofort umbuchen · ${esc(resName(s.mat))}</h3><div class="form">
      <div class="fld"><label>Menge</label><div style="display:flex;gap:4px"><input id="mv-a" value="${s.unit === 'Stk' ? s.amount : FI(fromSCU(s.amount, S.settings.inUnit), 6)}" style="width:110px">${s.unit === 'Stk' ? '<span class="dim">Stk</span>' : unitSelect('mv-u', S.settings.inUnit)}</div></div>
      <div class="fld" style="min-width:240px"><label>Zielort</label><input id="mv-l" autocomplete="off"></div></div>
      <div class="hint">Von: ${esc(s.loc || 'ohne Lagerort')}</div>
      <div class="foot"><button class="k" id="mv-x">Abbrechen</button><button class="k pri" id="mv-go">Umbuchen</button></div>`, box => {
      attachAC($('#mv-l', box), locationChoices);
      const mvu = $('#mv-u', box);
      if (mvu) { let last = mvu.value; mvu.onchange = () => { const a = $('#mv-a', box); a.value = FI(fromSCU(toSCU(a.value, last), mvu.value), 6); last = mvu.value; }; }
      $('#mv-x', box).onclick = closeModal;
      $('#mv-go', box).onclick = () => {
        const mu = $('#mv-u', box);
        const amt = Math.min(s.amount, mu ? toSCU($('#mv-a', box).value, mu.value) : Math.round(num($('#mv-a', box).value))), to = $('#mv-l', box).value.trim(); if (amt <= 0 || !to) return;
        const ex = S.stacks.find(x => x !== s && x.mat === s.mat && x.loc === to && (x.q ?? null) === (s.q ?? null));
        if (ex) ex.amount += amt; else S.stacks.push({ ...s, id: uid(), amount: amt, loc: to, boxes: {} });
        s.amount -= amt; if (s.amount <= 1e-6) S.stacks = S.stacks.filter(x => x !== s);
        hist(`Umgebucht: ${fmtAmt(amt, s.unit)} ${resName(s.mat)} ${s.loc || '–'} → ${to}`); closeModal(); save(); render();
      };
    });
  }
}
// Raffinerie-Ertrag -> Kisten wie im Spiel: größte zuerst (bis 32 SCU), der Rest unter 1 SCU in eine angebrochene 1-SCU-Kiste.
// Kisten lassen sich im Spiel nicht umpacken/stapeln. Beispiel 714 cSCU = 7,14 SCU -> {4:1, 2:1, 1:1} + angebrochen 0,14 SCU.
function refineryBoxes(scu) {
  const boxes = {}; let left = Math.round(scu * 100) / 100;
  for (const b of BOX_SIZES) { const n = Math.floor((left + 1e-9) / b); if (n) { boxes[b] = n; left = Math.round((left - n * b) * 100) / 100; } }
  return { boxes, partial: left > 0 ? left : 0 };   // partial = Inhalt der angebrochenen 1er (SCU), belegt im Frachtraum 1 SCU
}
function boxSplit(scu) {
  const out = {}; let left = Math.ceil(scu - 1e-9);
  for (const b of BOX_SIZES) { const n = Math.floor(left / b); if (n) { out[b] = n; left -= n * b; } }
  return out;
}
function lagerCalc() {
  return `<div class="cols2"><div class="win tight"><span class="pill">Einheiten</span>
      <div class="form">${Object.keys(UNITS).map(u => `<div class="fld"><label>${u}</label><input data-cu="${u}" value="${FI(fromSCU(0.5, u), 6)}" style="width:130px"></div>`).join('')}</div>
      <div class="hint">1 SCU = 100 cSCU = 1.000 mSCU = 1.000.000 µSCU<br>Beispiele: ½ SCU = 50 cSCU = 500 mSCU · eine ⅛-Kiste = 0,125 SCU = 12,5 cSCU = 125 mSCU<br><span class="dim">Einheiten-Namen wie im Spiel (Sprachdatei). „c“ = Hundertstel, „m“ = Tausendstel, „µ“ = Millionstel.</span></div></div>
    <div class="win tight"><span class="pill">Kisten &amp; Restplatz</span>
      <div class="form"><div class="fld"><label>Menge SCU</label><input id="c-amt" value="47" style="width:120px"></div><div class="fld"><label>Frachtraum SCU</label><input id="c-hold" value="64" style="width:120px"></div></div>
      <div id="c-out" style="margin-top:10px"></div></div></div>`;
}
function bindCalc(el) {
  $$('[data-cu]', el).forEach(inp => inp.oninput = () => {
    const scu = toSCU(inp.value, inp.dataset.cu);
    $$('[data-cu]', el).forEach(o => { if (o !== inp) o.value = FI(fromSCU(scu, o.dataset.cu), 6); });
  });
  const draw = () => { const a = num($('#c-amt', el).value), h = num($('#c-hold', el).value); const bx = boxSplit(a);
    $('#c-out', el).innerHTML = `<div>${crates(bx)}</div><div class="hint">${Object.values(bx).reduce((x, y) => x + y, 0)} Kisten · Restplatz im Frachtraum: <b class="green">${F(Math.max(0, h - a), 2)} SCU</b>${a > h ? ' · <span class="bad">passt nicht!</span>' : ''}</div>`; };
  $('#c-amt', el).oninput = draw; $('#c-hold', el).oninput = draw; draw();
}

/* ------------------------------------------------------------------ */
/* LOG-SYNC                                                             */
/* ------------------------------------------------------------------ */
function applyLogHits(hits, source, files) {
  const added = [];
  for (const h of hits) {
    const ids = BPN[h.name.toLowerCase()];
    if (!ids) continue;
    for (const id of ids) {
      if (!S.owned[id] || S.owned[id].src !== 'log') {
        if (!S.owned[id]) added.push(BP[id].name);
        S.owned[id] = { src: 'log', ts: h.ts ? new Date(h.ts).toISOString() : now() };
      }
    }
  }
  const unknown = [...new Set(hits.filter(h => !BPN[h.name.toLowerCase()]).map(h => h.name))];
  S.syncLog.unshift({ ts: now(), source, files, added: [...new Set(added)], unknown });
  S.syncLog = S.syncLog.slice(0, 50);
  if (added.length) { hist(`Log-Sync: ${added.length} neue Blueprints (${added.slice(0, 5).join(', ')}${added.length > 5 ? ' …' : ''})`); setComm('LOG-SYNC · ' + added.length + ' NEUE BLUEPRINTS: ' + added.slice(0, 3).join(', ').toUpperCase()); }
  else setComm('LOG-SYNC ' + fmtTime(now()).split(' ')[1] + ' · NICHTS NEUES');
  return added;
}
async function syncNow(source = 'Sync-Knopf') {
  if (!localUI()) { toast('Log-Sync bitte in der PC-App auf dem Spiele-PC drücken'); setComm('LOG-SYNC LÄUFT ÜBER DIE PC-APP AUF DEM SPIELE-PC'); return; }
  if (!S.settings.logDir) { toast('Erst den Spielordner einstellen'); switchTab('log'); return; }
  setComm('LOG-SYNC LÄUFT …');
  const r = await call('sync_logs', S.settings.logDir);
  if (!r || !r.ok) { S.syncLog.unshift({ ts: now(), source, files: 0, added: [], error: (r && r.error) || 'Fehler' }); setComm('LOG-SYNC FEHLER · ' + ((r && r.error) || '')); save(); render(); return; }
  const added = applyLogHits(r.hits, source, r.files);
  toast(added.length ? added.length + ' neue Blueprints erkannt' : 'Keine neuen Blueprints');
  save(); render();
}
function renderLog() {
  const el = $('#log');
  const srcBox = !localUI()
    ? `<div class="hint" style="margin-top:0">Die Game-Logs liegen auf deinem Spiele-PC. <b>Öffne dort die PC-App</b> (Hysec Industrie.exe) und drück <b>⟳ Log-Sync</b> – die gefundenen Blueprints landen dann hier auf dem Pi und sind auf allen Geräten sichtbar.</div><button class="k pri" id="lg-go" style="display:none"></button>`
    : `<div class="form"><div class="fld" style="flex:1;min-width:320px"><label>Spielordner (LIVE)</label><input id="lg-dir" value="${esc(S.settings.logDir)}" placeholder="G:\\Star Citizen\\StarCitizen\\LIVE"></div>
        <button class="k" id="lg-pick">Ordner wählen</button><button class="k pri" id="lg-go">⟳ Jetzt synchronisieren</button></div>`;
  el.innerHTML = `<div class="win tight"><span class="pill">Log-Sync</span>
    ${srcBox}
    <label class="dim" style="display:flex;gap:6px;align-items:center;margin-top:8px;font:13px var(--vdu)"><input type="checkbox" id="lg-auto" ${S.settings.autoSync ? 'checked' : ''}> Beim Start automatisch einlesen</label>
    <div class="scroll" style="margin-top:12px"><table class="ptab"><tr><th class="l">Zeitpunkt</th><th class="l">Quelle</th><th>Logs</th><th class="l">Ergebnis</th></tr>
    ${S.syncLog.map(x => `<tr><td class="l">${fmtTime(x.ts)}</td><td class="l dim">${esc(x.source)}</td><td>${x.files || 0}</td><td class="l ${x.error ? 'bad' : x.added.length ? 'green' : 'dim'}">${x.error ? esc(x.error) : x.added.length ? '+' + x.added.length + ' · ' + esc(x.added.slice(0, 6).join(', ')) + (x.added.length > 6 ? ' …' : '') : 'nichts Neues'}${x.unknown && x.unknown.length ? ` <span class="warn">· unbekannt: ${esc(x.unknown.join(', '))}</span>` : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Noch kein Sync.</td></tr>'}
    </table></div>
    <div class="hint">Das Tool liest <b>Game.log</b> und alle Dateien in <b>logbackups</b> und sucht „Received Blueprint“. Bekannte Blueprints werden nicht doppelt gezählt, schon gelesene Backup-Logs merkt es sich.</div>
    <div class="drop" id="lg-drop" style="margin-top:12px"><b>Notlösung: Log-Dateien hierher ziehen</b>funktioniert immer, auch ohne Ordner</div></div>`;
  if (localUI()) {
    $('#lg-dir', el).onchange = e => { S.settings.logDir = e.target.value.trim(); save(); };
    $('#lg-pick', el).onclick = async () => { const d = await call('pick_folder'); if (d) { S.settings.logDir = d; save(); renderLog(); } };
  }
  $('#lg-go', el).onclick = () => { if (localUI()) S.settings.logDir = $('#lg-dir', el).value.trim(); syncNow(); };
  $('#lg-auto', el).onchange = e => { S.settings.autoSync = e.target.checked; save(); };
  const drop = $('#lg-drop', el);
  drop.ondragover = e => { e.preventDefault(); drop.style.borderColor = 'var(--pill)'; };
  drop.ondragleave = () => drop.style.borderColor = '';
  drop.ondrop = async e => {
    e.preventDefault(); drop.style.borderColor = '';
    const hits = []; const re = /^<([^>]+)>.*SHUDEvent_OnNotification> Added notification "Received Blueprint: (.+?)\s*: "/;
    const files = [...e.dataTransfer.files];
    for (const f of files) { const t = await f.text(); for (const line of t.split('\n')) { if (!line.includes('Received Blueprint')) continue; const m = line.match(re); if (m) hits.push({ ts: m[1], name: m[2].trim() }); } }
    const added = applyLogHits(hits, 'Reingezogen', files.length); toast(added.length + ' neue Blueprints'); save(); render();
  };
}

/* ------------------------------------------------------------------ */
/* EINSTELLUNGEN                                                        */
/* ------------------------------------------------------------------ */
function renderOpt() {
  const st = S.settings; const el = $('#opt');
  el.innerHTML = `<div class="cols2">${progBoxHtml()}<div class="win tight"><span class="pill">Grundeinstellungen</span>
      <div class="form">
        <div class="fld"><label>Standard-Mindestqualität</label><input id="o-dq" type="number" value="${st.defaultQ}" style="width:120px"></div>
        <div class="fld"><label title="Ab dieser Qualität gilt Material als High Quality (Markierung im Lager, Lager-Ansicht)">High Quality ab</label><input id="o-gq" type="number" value="${st.goldQ}" style="width:120px"></div>
        <div class="fld"><label>Preise alt ab (Tage)</label><input id="o-sd" type="number" value="${st.staleDays}" style="width:120px"></div></div>
      <div class="form" style="margin-top:8px">
        <div class="fld"><label>Mengen anzeigen in</label><select id="o-su">${[['auto', 'automatisch'], ['SCU', 'SCU'], ['cSCU', 'cSCU'], ['mSCU', 'mSCU']].map(([k, l]) => `<option value="${k}" ${st.showUnit === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="fld"><label>„automatisch“: unter 1 SCU in</label><select id="o-sm">${['cSCU', 'mSCU'].map(k => `<option ${st.smallUnit === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div></div>
      <div class="hint">1 SCU = 100 cSCU = 1.000 mSCU. Beim Einbuchen wählst du die Einheit direkt neben der Menge.</div>
      <label class="dim" style="display:flex;gap:6px;align-items:center;margin-top:10px;font:13px var(--vdu)"><input type="checkbox" id="o-calm" ${st.calm ? 'checked' : ''}> Bildschirm-Flackern und Radar-Animation aus</label>
      <label class="dim" style="display:flex;gap:6px;align-items:center;margin-top:6px;font:13px var(--vdu)"><input type="checkbox" id="o-cb" ${st.confirmBook ? 'checked' : ''}> Vor „1 gebaut“ nachfragen</label></div>
    <div class="win tight"><span class="pill">Verkauf automatisch</span>
      <div class="form"><div class="fld"><label>Material unter Qualität → Verkauf</label><input id="o-sq" type="number" min="0" max="1000" step="50" value="${st.sellQ}" style="width:120px"></div></div>
      <label class="dim" style="display:flex;gap:6px;align-items:center;margin-top:8px;font:13px var(--vdu)"><input type="checkbox" id="o-st" ${st.sellTrade ? 'checked' : ''}> Handelsware ohne Qualität immer zum Verkauf</label>
      <div class="hint">Ab Q ${st.sellQ} wird Material behalten (fürs Crafting). Gilt für alle Posten mit „auto“ – von Hand gesetzte (Haken im Lager oder beim Einbuchen) bleiben, wie sie sind.</div></div>
    <div class="win tight"><span class="pill">Lager-Ansicht</span>
      <div class="form"><div class="fld"><label>Dein Freight Elevator</label><select id="o-elev">${Object.entries(ELEVATOR).map(([k, v]) => `<option value="${k}" ${(st.elevator || 'large') === k ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></div></div>
      <label class="dim" style="display:flex;gap:6px;align-items:center;margin-top:6px;font:13px var(--vdu)"><input type="checkbox" id="o-kb" ${st.kistenBilder !== false ? 'checked' : ''}> Echte SCU-Kisten im Cargo-Grid (sonst Farbblöcke)</label>
      <div class="hint">Größen wie im Spiel: Small 6×5×4, Medium 8×7×4, Large 16×14×4, XL 20×14×4 Felder (1 Feld = 1 SCU). Steht in deiner Freight-Manager-Anzeige als „CAPACITY … SCU“.</div></div>
    <div class="win tight"><span class="pill">Katalog-Bilder</span>
      <div class="form"><div class="fld"><label>Unteranzug auf den Set-Bildern</label><select id="o-suit"><option value="n" ${st.suit !== 'm' ? 'selected' : ''}>Grau (kein Anzug)</option><option value="m" ${st.suit === 'm' ? 'selected' : ''}>Automatisch zugeordnet</option></select></div></div>
      <div class="hint"><b>Grau:</b> Kein eigener Unteranzug – jede Rüstung steht auf derselben grauen Figur, so lassen sich Sets gut vergleichen.<br><b>Automatisch zugeordnet:</b> Die Figur trägt den Unteranzug vom selben Hersteller wie die Rüstung (z. B. CDS-Rüstung mit CDS-Unteranzug). Gibt es keinen vom selben Hersteller, bleibt er grau.<br>Alle Bilder berechnet Pliskin selbst aus den Spieldaten (Modelle, Texturen, Farben des jeweiligen Skins).</div></div>
    <div class="win tight"><span class="pill">Home &amp; Favoriten</span>
      <div class="hint" style="margin-top:0">Home-Station: <b>${esc(st.home || '– noch keine –')}</b> · ${S.favs.length} Favoriten</div>
      <div class="row2"><button class="k" id="o-orte">Home &amp; Favoriten öffnen</button></div></div>
    <div class="win tight"><span class="pill">Ausprobieren &amp; Hilfe</span>
      <div class="hint" style="margin-top:0">Der <b>Demo-Modus</b> lädt Beispiel-Daten (Lager, Pläne, Schiffe, Contracts), damit du alles gefahrlos ausprobieren kannst. Deine eigenen Daten bleiben unberührt, im Demo-Modus wird nichts gespeichert.</div>
      <div class="row2">${DEMO ? '<button class="k x" id="o-demo">Demo beenden</button>' : '<button class="k pri" id="o-demo">Demo-Modus starten</button>'}<button class="k" id="o-tour">Rundgang starten</button><button class="k" id="o-help">Hilfe öffnen</button></div></div>
    <div class="win tight"><span class="pill">Daten &amp; Sicherung</span>
      <div class="row2"><button class="k" id="o-exp">Sicherung speichern</button><button class="k" id="o-imp">Sicherung laden</button>${MODE === 'app' ? '<button class="k" id="o-dir">Datenordner öffnen</button>' : ''}</div>
      <div class="hint">Deine Daten liegen in: <b>${esc(dataDir)}</b><br>Das Programm legt dort jeden Tag automatisch eine Sicherung an (die letzten 60 Tage, ältere je Monat eine).</div>
      <div class="row2" style="margin-top:14px"><button class="k x" id="o-reset">Alles zurücksetzen</button></div></div>
    <div class="win tight"><span class="pill">Datenquellen</span><span class="sub">Pliskin liest alles, was im Spiel steht, selbst aus den Spieldateien</span>
      <div class="hint" style="margin-top:0">Zwei Dinge stehen in keiner Spieldatei, weil der Spiel-Server sie live schickt: <b>Handelspreise</b> und <b>Raffinerie-Boni</b>.
        Dafür gibt es eigene Einträge (Datenbank → ✎ Eigene Daten) – die gelten immer zuerst. Fremde Quellen sind nur Ergänzung und lassen sich abschalten:</div>
      <label class="dim" style="display:flex;gap:6px;align-items:center;margin-top:8px;font:13px var(--vdu)"><input type="checkbox" id="o-uexon" ${st.uexOn ? 'checked' : ''}> Handelspreise von <a href="https://uexcorp.space" target="_blank" rel="noopener"><b>UEX Corp</b></a> verwenden (von Spielern gemeldet)</label>
      <div class="row2" style="margin:4px 0 0 24px"><button class="k sm" id="o-uexget">Jetzt von UEX holen</button><span class="dim" style="font-size:12px">${U.ts ? 'Stand ' + fmtTime(new Date(U.ts * 1000).toISOString()) + ' · ' + (U.prices || []).length + ' Preise' : 'noch nie geholt'}</span></div>
      <label class="dim" style="display:flex;gap:6px;align-items:center;margin-top:10px;font:13px var(--vdu)"><input type="checkbox" id="o-extb" ${st.extBonus ? 'checked' : ''}> Fehlende Raffinerie-Boni von <a href="https://scmdb.net" target="_blank" rel="noopener"><b>SCMDB</b></a> ergänzen <span class="dim">(Lizenz CC BY-SA 4.0)</span></label>
      <div class="row2" style="margin:4px 0 0 24px"><button class="k sm" id="o-scget">Jetzt von SCMDB holen</button><span class="dim" style="font-size:12px">${typeof WX !== 'undefined' && WX ? 'Stand ' + esc(WX.version || '?') + ' · geholt ' + esc(WX.fetched || '?') : 'noch nie geholt'}</span></div>
      <div class="hint">Pliskin holt nichts von selbst aus dem Internet. Abgerufen wird nur, wenn du hier drückst – am besten einmal nach einem Patch. Ohne diese Quellen funktioniert alles, nur ohne fremde Preise/Boni.</div></div>
    <div class="win tight"><span class="pill">Datenstand</span>
      <table class="ptab">
        <tr><td class="l dim">Rezepte</td><td class="l">${(R.blueprints || []).length} Blueprints · Patch ${esc(R.patch || '?')} · ${esc(R.source || '')} · erstellt ${esc(R.created || '')}</td></tr>
        <tr><td class="l dim">Materialien</td><td class="l">${Object.keys(RES).length}</td></tr>
        <tr><td class="l dim">UEX Corp</td><td class="l">${U.ts ? fmtTime(new Date(U.ts * 1000).toISOString()) + ' · ' + (U.commodities || []).length + ' Waren · ' + (U.prices || []).length + ' Preise' : 'nicht geladen'}${U.error ? ' · <span class="bad">' + esc(U.error) + '</span>' : ''}</td></tr>
        <tr><td class="l dim">Blueprints</td><td class="l">${Object.keys(S.owned).length} vorhanden</td></tr>
        <tr><td class="l dim">Wissen</td><td class="l">${typeof W !== 'undefined' && W && W.version ? esc(W.source || '') + ' · Patch ' + esc(W.version) + ' · ' + esc(W.fetched || '') : 'nicht geladen'}</td></tr>
        <tr><td class="l dim">Orte</td><td class="l">${(ORTE.orte || []).length} Orte mit Ausstattung · ${(ORTE.waren || []).length} Waren (Spieldaten)</td></tr>
        <tr><td class="l dim">Programm</td><td class="l">Pliskin Industrie ${APP_VERSION}${DEMO ? ' · <span class="warn">DEMO</span>' : ''}</td></tr>
      </table></div></div>`;
  const setN = (id, key) => $(id, el).onchange = e => { st[key] = Math.round(num(e.target.value)); save(); render(); };
  setN('#o-dq', 'defaultQ'); setN('#o-gq', 'goldQ'); setN('#o-sd', 'staleDays');
  $('#o-sq', el).onchange = e => { st.sellQ = Math.max(0, Math.min(1000, Math.round(num(e.target.value)))); save(); render(); };
  $('#o-st', el).onchange = e => { st.sellTrade = e.target.checked; save(); render(); };
  $('#o-uexon', el).onchange = async e => { st.uexOn = e.target.checked; save(); if (st.uexOn && !U.ts) { U = await call('uex', false, true) || U; indexUex(); } render(); };
  $('#o-uexget', el).onclick = async () => { setComm('UEX-PREISE WERDEN GELADEN …'); U = await call('uex', true) || U; indexUex(); setComm(U.error ? 'UEX FEHLER · ' + U.error : 'UEX-PREISE GEHOLT'); toast(U.error ? 'UEX nicht erreichbar: ' + U.error : (U.prices || []).length + ' Preise von UEX geholt'); render(); };
  $('#o-scget', el).onclick = async () => { setComm('SCMDB WIRD GELADEN …'); const r = await call('scmdb_sync'); if (r && r.ok) { WX = await call('scmdb'); toast('SCMDB geholt: ' + (r.version || '')); } else toast('SCMDB nicht erreichbar' + (r && r.info ? ': ' + r.info : '')); setComm('SYSTEM BEREIT'); render(); };
  $('#o-extb', el).onchange = e => { st.extBonus = e.target.checked; save(); render(); };
  $('#o-su', el).onchange = e => { st.showUnit = e.target.value; save(); render(); };
  $('#o-sm', el).onchange = e => { st.smallUnit = e.target.value; save(); render(); };
  $('#o-calm', el).onchange = e => { st.calm = e.target.checked; applyTheme(); save(); };
  $('#o-cb', el).onchange = e => { st.confirmBook = e.target.checked; save(); };
  $('#o-suit', el).onchange = e => { st.suit = e.target.value; save(); };
  const oe = $('#o-elev', el); if (oe) oe.onchange = e => { st.elevator = e.target.value; save(); };
  const okb = $('#o-kb', el); if (okb) okb.onchange = e => { st.kistenBilder = e.target.checked; save(); };
  $('#o-orte', el).onclick = () => goTab('orte');
  $('#o-demo', el).onclick = () => DEMO ? demoEnd() : demoStart();
  $('#o-tour', el).onclick = () => startRundgang();
  $('#o-help', el).onclick = () => goTab('help');
  $('#o-exp', el).onclick = async () => { const p = await call('export_backup', S); if (p) toast('Gespeichert: ' + p); };
  $('#o-imp', el).onclick = async () => {
    const d = await call('import_backup'); if (!d || !d.settings) { if (d !== null) toast('Keine gültige Sicherung'); return; }
    if (!await ask('Aktuelle Daten durch die Sicherung ersetzen?', 'Laden', true)) return;
    const rv = S._rev; S = null; loadStore(d); S._rev = rv; save(); applyTheme(); render(); toast('Sicherung geladen');
  };
  if ($('#o-dir', el)) $('#o-dir', el).onclick = () => call('open_data_dir');
  progBoxBind(el);
  $('#o-reset', el).onclick = async () => {
    if (!await ask('Wirklich <b>alles</b> zurücksetzen? Pläne, Lager, Blueprints und Einstellungen werden gelöscht.<br><span class="dim">Die automatischen Tagessicherungen im Datenordner bleiben erhalten.</span>', 'Zurücksetzen', true)) return;
    if (!await ask('Letzte Nachfrage: Wirklich alles löschen?', 'Ja, alles löschen', true)) return;
    const dir = S.settings.logDir, rv = S._rev; S = DEFAULT_STORE(); S.settings.logDir = dir; S._rev = rv; save(); applyTheme(); render(); toast('Zurückgesetzt');
  };
}

/* ------------------------------------------------------------------ */
/* Ablauf                                                               */
/* ------------------------------------------------------------------ */
function applyTheme() {
  // frühere Vergleichs-Fassungen „…-alt“ gibt es nicht mehr → auf das normale Design umstellen
  if (/-alt$/.test(S.settings.theme || '')) S.settings.theme = S.settings.theme.replace(/-alt$/, '');
  const th0 = S.settings.theme || 'wc3v';
  document.body.dataset.t = th0;
  document.body.dataset.gh = '2';   // Gehäuse: wc-gehaeuse.css (Grundlage) + wc-gehaeuse2.css
  document.body.classList.toggle('calm', !!S.settings.calm);
  const th = $('#theme'); if (th) th.value = th0;
}
let current = 'todo';
function switchTab(t) {
  if (t === 'bp') { t = 'db'; S.ui.dbTab = 'bps'; }
  current = t;
  $$('#nav .key[data-tab]').forEach(k => k.classList.toggle('on', k.dataset.tab === t));
  $$('.screen').forEach(s => s.classList.toggle('on', s.id === t));
  render(); $('#scr').scrollTop = 0;
}
function render() {
  if (S.ui.todoFilter !== 'all' && !S.plans.some(p => p.id === S.ui.todoFilter)) S.ui.todoFilter = 'all';   // Plan wurde gelöscht
  if (typeof tourClean === 'function' && typeof E2 !== 'undefined' && tourClean()) save();   // Touren ohne Ware (z. B. Lagerposten gelöscht) aufräumen
  if (window.MOBILE) { compute(); window.MOBILE.render(); return; }   // Handy-Oberflaeche (m.html / mobile.js)
  compute(); renderHeader();
  if (current === 'bp') { current = 'db'; S.ui.dbTab = 'bps'; }   // Blueprints stehen jetzt in der Datenbank
  ({ plan: renderPlans, todo: renderTodo, lager: renderLager, ctr: renderContracts, tour: renderTour, ships: renderShips, log: renderLog, opt: renderOpt,
     db: renderDb, orte: renderOrte, help: renderHelp })[current]();
  if (typeof demoBanner === 'function') demoBanner();
}

/* Fehlersuche: Startschritte an den Server melden (nur wenn serverdaten/debug.flag existiert, sonst ignoriert der Server es) */
const dbg = (...m) => { try { fetch('/api/clientlog', { method: 'POST', body: JSON.stringify(m.map(String)) }).catch(() => {}); } catch (e) { /* egal */ } };
window.addEventListener('error', e => dbg('JS-FEHLER', e.message, e.filename, e.lineno));
window.addEventListener('unhandledrejection', e => dbg('PROMISE-FEHLER', e.reason && (e.reason.stack || e.reason)));
async function boot() {
  LOCAL = !!(window.pywebview && window.pywebview.api && typeof window.pywebview.api.sync_logs === 'function');
  dbg('boot start', 'LOCAL=' + LOCAL, 'apiKeys=' + (LOCAL ? Object.keys(window.pywebview.api).join(',') : '-'));
  try { const r = await fetch('/api/rev', { method: 'POST', body: '[]' }); if (r.ok) { await r.json(); MODE = 'server'; } } catch (e) { /* kein Server */ }
  if (MODE !== 'server' && LOCAL) MODE = 'app';
  dbg('mode', MODE);
  const d = await call('load');
  dbg('loaded', !!d, d && d.store ? 'store ok' : 'kein store');
  if (DEMO) { try { d.store = await fetch('data/demo.json').then(r => r.json()); } catch (e) { DEMO = false; toast('Demo-Daten fehlen'); } }
  R = d.recipes || R; dataDir = d.dataDir || ''; LOGSRC = d.logSource || '';
  indexRecipes();
  S = null; loadStore(d.store); setBase();
  await progInit(); applyLang();
  if (localUI() && !S.settings.logDir) S.settings.logDir = await call('default_live_dir') || '';
  window.addEventListener('focus', checkRemote);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkRemote(); });
  applyTheme();
  if (window.MOBILE) window.MOBILE.init();
  else {
    $$('#nav .key[data-tab]').forEach(k => k.onclick = () => switchTab(k.dataset.tab));
    $$('#nav .key[data-soon]').forEach(k => k.onclick = () => toast('Kommt in Etappe 2'));
    $('#theme').onchange = e => { S.settings.theme = e.target.value; applyTheme(); save(); };
    $('#btn-sync').onclick = () => syncNow();
  }
  $('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  render();
  if (!d.store && !DEMO) save();
  // Beim Start: Logs einlesen und Preise holen (im Hintergrund)
  BOOTED = true;
  if (!LOCAL && window.pywebview && window.pywebview.api && typeof window.pywebview.api.sync_logs === 'function') { LOCAL = true; render(); }
  if (S.settings.autoSync && LOCAL && S.settings.logDir && !DEMO) syncNow('Start');
  wInit().then(render);
  fetch('data/missionen.json').then(r => r.json()).then(j => { MISS = j.pools || {}; render(); }).catch(() => { /* ohne Missionsdaten */ });
  loadOrte().then(render);
  loadKisten().then(render);
  if (S.settings.uexOn) call('uex', false, true).then(u => { U = u || U; indexUex(); render(); });   // nur gespeicherter Stand – neu holen nur per Knopf (Einstellungen)
  setTimeout(firstStart, 900);
  setTimeout(progUpdateCheck, 2500);
}
let BOOTED = false;
/* In der Hysec-App (pywebview) kommt die Erlaubnis zum lokalen Lesen oft erst NACH dem Start der Seite:
   dann Log-Sync nachholen. */
window.addEventListener('pywebviewready', () => {
  if (LOCAL || !BOOTED || !(window.pywebview && window.pywebview.api && typeof window.pywebview.api.sync_logs === 'function')) return;
  LOCAL = true;
  setComm('HYSEC-APP ERKANNT · LOG-SYNC VON DIESEM PC MÖGLICH');
  render();
  if (S.settings.autoSync && S.settings.logDir) syncNow('Start');
});

/* Start: In der Hysec-App (?app=1 oder lokales Fenster) erst warten, bis die Bruecke zum PC
   wirklich fertig ist (Methoden vorhanden) – sonst haengt der Start. Im Browser sofort los. */
{
  let started = false;
  const go = () => { if (!started) { started = true; boot(); } };
  const bridgeReady = () => !!(window.pywebview && window.pywebview.api && typeof window.pywebview.api.sync_logs === 'function');
  const inApp = /[?&]app=1\b/.test(location.search) || location.hostname === '127.0.0.1' || location.protocol === 'file:';
  if (inApp) {
    window.addEventListener('pywebviewready', () => { if (bridgeReady()) go(); });
    const t0 = Date.now();
    const poll = setInterval(() => { if (bridgeReady() || Date.now() - t0 > 6000) { clearInterval(poll); go(); } }, 100);
  } else {
    go();
  }
}
