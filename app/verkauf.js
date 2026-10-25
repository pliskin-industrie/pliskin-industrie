/* Pliskin Industrie – Verkaufstour (Lager-Tour): Ware aus dem Lager auswählen, Käufer aus UEX-Preisen finden,
   in Runden aufteilen (Schiff voll → nächste Runde), Stopp „verkauft“ → Lager wird ausgebucht.
   Nutzt Tour-Ablauf, Ladeplan und Karte aus etappe2.js (Lager-Tour = S.stour). Skizze: archiv/skizzen-hysec/hysec-verkaufstour-prototyp.html */

const SALE_SYS = ['Stanton', 'Pyro', 'Nyx'];
const saleUi = () => {
  const d = { mode: 'preis', sys: { Stanton: true, Pyro: true, Nyx: true }, sort: 'erloes', showKeep: false, sel: {}, pick: {} };
  S.ui.sale = Object.assign(d, S.ui.sale || {});
  return S.ui.sale;
};
// Verkäufe, deren Lagerposten es nicht mehr gibt (gelöscht, umgebucht, verbaut), fallen weg
function saleClean() { let n = 0; for (const x of S.sales) if ((x.status === 'tour' || x.status === 'offen') && !S.stacks.some(s => s.id === x.stack && s.amount > 1e-9)) { x.status = 'entfallen'; x.doneTs = now(); n++; } return n; }
const saleRound = () => { const r = S.sales.filter(x => x.status === 'tour').map(x => x.round || 1); return r.length ? Math.min(...r) : 0; };
const saleRounds = () => [...new Set(S.sales.filter(x => x.status === 'tour').map(x => x.round || 1))].sort((a, b) => a - b);

// Tour-Zeilen der aktuellen Runde (abholen am Lagerort → verkaufen beim Käufer)
function saleLines() {
  const r = saleRound(), out = [];
  for (const x of S.sales) {
    if (x.status !== 'tour' || (x.round || 1) !== r) continue;
    const s = S.stacks.find(y => y.id === x.stack); if (!s || !s.loc || !x.term) continue;
    const scu = Math.min(x.amount, s.amount); if (scu <= 1e-9) continue;
    out.push({ id: 'vk:' + x.id, src: 'sale', ref: x.id, ware: resName(s.mat), scu, from: s.loc, to: x.term, price: x.price, who: 'Verkauf', boxes: scu >= s.amount - 1e-6 ? s.boxes : null });
  }
  return out;
}
function saleRoundInfo() {
  const all = Math.max(0, ...S.sales.filter(x => x.planned && x.planned === S.salePlan).map(x => x.round || 1)), r = saleRound();
  return all > 1 && r ? ` · Runde ${r} von ${all}` : '';
}
// Stopp beim Käufer erledigt: Ware aus dem Lager ausbuchen
function saleDone(l) {
  const x = S.sales.find(y => y.id === l.ref), s = x && S.stacks.find(y => y.id === x.stack); if (!x) return;
  if (s) {
    const amt = Math.min(x.amount, s.amount);
    s.amount = Math.round((s.amount - amt) * 1e6) / 1e6; s.boxes = {};
    if (s.amount <= 1e-6) S.stacks = S.stacks.filter(y => y !== s);
    hist(`Verkauft: ${F(amt, 2)} SCU ${resName(s.mat)} an ${x.term} · ${N(amt * (x.price || 0))} aUEC`);
  }
  x.status = 'erledigt'; x.doneTs = now();
}
// Runde fertig? → nächste Runde laden (Stopps neu berechnen)
function saleRoundCheck() {
  const T = curTour(); if (!T.round) T.round = saleRound();
  if (!T.round || S.sales.some(x => x.status === 'tour' && (x.round || 1) === T.round)) return;
  T.stops = []; T.sig = null; T.manual = false; S.ui.tourStop = 0; T.round = saleRound();
  toast(T.round ? `Runde fertig – Runde ${T.round} geladen` : 'Verkaufstour fertig');
  hist(T.round ? `Verkaufstour: Runde ${T.round} geladen` : 'Verkaufstour fertig');
}

// Käufer für einen Posten: eigene Preise (gehen vor) + UEX-Terminals, in den gewählten Systemen
function saleBuyers(s, V) {
  return priceList(s.mat).filter(p => p.sell > 0).map(p => ({ term: p.term, sys: p.sys || '', sell: p.sell, dist: locDist(s.loc, p.term), age: p.age, src: p.src }))
    .filter(b => !SALE_SYS.includes(b.sys) || V.sys[b.sys]);
}
function saleChoice(s, V) {
  const b = saleBuyers(s, V); if (!b.length) return { list: [], pick: null };
  const dd = x => x.dist ?? 999;
  const list = V.mode === 'route' ? [...b].sort((x, y) => dd(x) - dd(y) || y.sell - x.sell).slice(0, 6)   // nächste Käufer (gebündelt in renderSalePlanner)
    : [...b].sort((x, y) => y.sell - x.sell || dd(x) - dd(y)).slice(0, V.mode === 'top3' ? 3 : 1);
  return { list, pick: list.find(x => x.term === V.pick[s.id]) || list[0] };
}

function renderSalePlanner(el, head) {
  const V = saleUi(), T = curTour();
  if (!T.ship && S.fleet[0]) T.ship = S.fleet[0].id;
  const ship = S.fleet.find(f => f.id === T.ship) || null, cap = ship ? fleetScu(ship) : 0;
  const busy = S.sales.filter(x => x.status === 'tour').length;
  const rows = S.stacks.filter(s => s.unit !== 'Stk' && s.amount > 1e-9 && (V.showKeep || stackSell(s))).map(s => {
    const c = saleChoice(s, V), amt = V.sel[s.id] != null ? Math.min(V.sel[s.id], s.amount) : null;
    return { s, c, amt, er: c.pick ? c.pick.sell * (amt ?? s.amount) : 0, res: (CALC && CALC.reservedBy[s.id]) || 0 };
  });
  if (V.mode === 'route') {   // Kürzeste Route: Käufer bündeln – lieber einen Käufer, den schon andere Posten anfliegen (bis 10 Gm Umweg), statt je Posten den nächsten
    const on = rows.filter(r => r.amt != null && r.amt > 0 && r.c.list.length && !V.pick[r.s.id]);
    for (let pass = 0; pass < 3; pass++) {
      const use = {}; rows.forEach(r => { if (r.c.pick && r.amt) use[r.c.pick.term] = (use[r.c.pick.term] || 0) + 1; });
      on.forEach(r => {
        const near = r.c.list[0].dist ?? 999, ok = r.c.list.filter(b => (b.dist ?? 999) <= near + 10);
        const u = b => (use[b.term] || 0) - (b === r.c.pick ? 1 : 0);
        r.c.pick = ok.sort((x, y) => u(y) - u(x) || (x.dist ?? 999) - (y.dist ?? 999))[0];
        r.er = r.c.pick.sell * (r.amt ?? r.s.amount);
      });
    }
    rows.forEach(r => { if (r.c.pick) r.c.list = [r.c.pick]; });
  }
  const kind = m => ((UEXIDX.byName[resName(m).toLowerCase()] || {}).kind) || 'Ware';
  const sorters = { art: (a, b) => kind(a.s.mat).localeCompare(kind(b.s.mat)) || resName(a.s.mat).localeCompare(resName(b.s.mat)),
    menge: (a, b) => b.s.amount - a.s.amount, preis: (a, b) => ((b.c.pick || {}).sell || 0) - ((a.c.pick || {}).sell || 0),
    erloes: (a, b) => b.er - a.er, ort: (a, b) => (a.s.loc || '').localeCompare(b.s.loc || '') };
  rows.sort(sorters[V.sort] || sorters.erloes);
  const sel = rows.filter(r => r.amt != null && r.amt > 0 && r.c.pick), scu = sel.reduce((a, r) => a + r.amt, 0), sum = sel.reduce((a, r) => a + r.er, 0);
  const rounds = cap ? Math.ceil(scu / cap - 1e-9) : (scu ? 1 : 0);
  const chip = (attr, k, l, on) => `<span data-${attr}="${k}" class="${on ? 'on' : ''}">${l}</span>`;
  let h = head + `<div class="win tight"><span class="pill">Verkauf planen</span><span class="sub">Ware aus dem Lager wählen · Käufer aus deinen Preisen${S.settings.uexOn ? ' + UEX' + (U.ts ? ' (Stand ' + fmtTime(new Date(U.ts * 1000).toISOString()) + ')' : '') : ''}</span>
    ${busy ? `<div class="hint warn">Es läuft schon eine Verkaufstour (${busy} Posten). „Tour erstellen“ ersetzt die noch offenen Verkäufe. <a href="#" id="vp-back">Zur laufenden Tour</a></div>` : ''}
    ${!(U.prices || []).length && !(S.myPrices || []).length ? `<div class="hint bad">Keine Preise da – ${S.settings.uexOn ? 'UEX ist nicht geladen' : 'UEX ist in den Einstellungen aus'}. Eigene Preise trägst du unter Datenbank → ✎ Eigene Daten ein.</div>` : ''}
    <div class="row2"><span class="dim">Käufer:</span><div class="chips2">${chip('vm', 'preis', 'Höchster Preis', V.mode === 'preis')}${chip('vm', 'route', 'Kürzeste Route', V.mode === 'route')}${chip('vm', 'top3', '3 beste Preise', V.mode === 'top3')}</div></div>
    <div class="row2"><span class="dim">Verkaufen in:</span>${SALE_SYS.map(y => `<label class="ftog"><input type="checkbox" data-vs="${y}" ${V.sys[y] ? 'checked' : ''}> ${y}</label>`).join(' ')}</div>
    <div class="row2"><span class="dim">Sortieren:</span><div class="chips2">${[['art', 'Art'], ['menge', 'Menge'], ['preis', 'Preis/SCU'], ['erloes', 'Erlös gesamt'], ['ort', 'Lagerort']].map(([k, l]) => chip('vo', k, l, V.sort === k)).join('')}</div></div>
    <div class="row2"><label class="ftog"><input type="checkbox" id="vp-keep" ${V.showKeep ? 'checked' : ''}> auch „Behalten“-Posten zeigen</label><div class="grow"></div>
      <button class="k sm" id="vp-all">Alle Max</button><button class="k sm" id="vp-none">Keine</button></div></div>
  <div class="win tight"><span class="pill">${rows.length} Posten</span>`;
  for (const r of rows) {
    const { s, c } = r, on = r.amt != null && r.amt > 0;
    h += `<div class="vp-row ${on ? 'on' : ''}"><div class="vp-top"><input type="checkbox" class="vp-chk" data-vc="${s.id}" ${on ? 'checked' : ''}>
      <div class="n"><b>${esc(resName(s.mat))}</b> · ${F(s.amount, 2)} SCU <small>${esc(kind(s.mat))} · ${s.q != null ? 'Q ' + s.q : 'ohne Qualität'} · liegt in ${esc(s.loc || 'ohne Ort')}${r.res > 1e-6 ? ` · <span class="warn">${fmtAmt(r.res, s.unit)} für Crafting verplant</span>` : ''} · ${sellTag(s)}</small></div>
      <div class="vp-amt"><input data-va="${s.id}" value="${r.amt != null ? F(r.amt, 2) : ''}" placeholder="SCU" inputmode="decimal"><button class="k sm" data-vmax="${s.id}">Max</button></div>
      <div class="er">${c.pick ? N(r.er) : '–'}<div class="dim" style="font-size:11px">aUEC</div></div></div>
      ${c.list.length ? `<div class="vp-buy">${c.list.map(b => `<label data-vb="${s.id}" data-t="${esc(b.term)}">${V.mode === 'top3' ? `<input type="radio" name="vb-${s.id}" ${b === c.pick ? 'checked' : ''}>` : '→'}
        <span>${esc(b.term)} <span class="dim">(${esc(b.sys)})</span> · <b>${N(b.sell)}/SCU</b> <span class="dim">· ${b.dist == null ? '? Gm' : F(b.dist, 1) + ' Gm'}${b.src === 'eigen' ? ' · ✎ eigener Preis' : ''}${b.age != null && b.age > S.settings.staleDays ? ' · Preis ' + b.age + ' T alt' : ''}</span></span></label>`).join('')}</div>`
        : '<div class="vp-buy bad">kein Käufer in den gewählten Systemen</div>'}</div>`;
  }
  if (!rows.length) h += `<div class="empty">Nichts zum Verkauf freigegeben. Im Lager bei einem Posten auf „🔒 Behalten“ tippen oder oben „auch Behalten-Posten zeigen“.</div>`;
  h += `<div class="vp-sum"><div class="t">${sel.length} gewählt · <b>${F(scu, 2)} SCU</b> · <b class="green">${N(sum)} aUEC</b><br>
      Schiff <select id="vp-ship">${S.fleet.map(f => `<option value="${f.id}" ${f.id === T.ship ? 'selected' : ''}>${esc(fleetName(f))} · ${fleetScu(f)} SCU</option>`).join('') || '<option value="">– erst unter „Schiffe“ anlegen –</option>'}</select>
      ${rounds > 1 ? `<span class="warn"> · passt nicht auf einmal → ${rounds} Runden</span>` : ''}</div>
    <button class="k pri" id="vp-go" ${sel.length ? '' : 'disabled'}>Tour erstellen</button></div></div>`;
  el.innerHTML = h;
  const re = () => { save(); render(); };
  $$('[data-vm]', el).forEach(b => b.onclick = () => { V.mode = b.dataset.vm; re(); });
  $$('[data-vo]', el).forEach(b => b.onclick = () => { V.sort = b.dataset.vo; re(); });
  $$('[data-vs]', el).forEach(b => b.onchange = () => { V.sys[b.dataset.vs] = b.checked; re(); });
  $('#vp-keep', el).onchange = e => { V.showKeep = e.target.checked; re(); };
  $('#vp-all', el).onclick = () => { rows.forEach(r => V.sel[r.s.id] = r.s.amount); re(); };
  $('#vp-none', el).onclick = () => { V.sel = {}; re(); };
  $$('[data-vc]', el).forEach(c => c.onchange = () => { const s = S.stacks.find(x => x.id === c.dataset.vc); if (c.checked) V.sel[s.id] = s.amount; else delete V.sel[s.id]; re(); });
  $$('[data-vmax]', el).forEach(b => b.onclick = () => { const s = S.stacks.find(x => x.id === b.dataset.vmax); V.sel[s.id] = s.amount; re(); });
  $$('[data-va]', el).forEach(i => i.onchange = () => { const s = S.stacks.find(x => x.id === i.dataset.va), v = num(i.value); if (v > 0) V.sel[s.id] = Math.min(v, s.amount); else delete V.sel[s.id]; re(); });
  $$('[data-vb]', el).forEach(l => l.onclick = () => { V.pick[l.dataset.vb] = l.dataset.t; re(); });
  const sh = $('#vp-ship', el); if (sh) sh.onchange = () => { T.ship = sh.value; re(); };
  const bk = $('#vp-back', el); if (bk) bk.onclick = e => { e.preventDefault(); S.ui.saleView = null; render(); };
  $('#vp-go', el).onclick = async () => {
    if (busy && !await ask('Die noch offenen Verkäufe der laufenden Tour werden durch die neue Auswahl ersetzt.', 'Ersetzen', true)) return;
    saleCreate(sel, cap);
  };
}
// Auswahl → Verkäufe in Runden (nach System und Ort sortiert, Schiff voll → nächste Runde; große Posten werden geteilt)
function saleCreate(sel, cap) {
  S.sales = S.sales.filter(x => x.status === 'erledigt');
  const plan = uid(); S.salePlan = plan;
  const sysOf = l => (locInfo(l) || {}).sys || '';
  const items = [...sel].sort((a, b) => sysOf(a.s.loc).localeCompare(sysOf(b.s.loc)) || (a.c.pick.sys || '').localeCompare(b.c.pick.sys || '') || (a.s.loc || '').localeCompare(b.s.loc || ''));
  // Umlagerungen fahren in Runde 1 mit – deren Platz vorher abziehen
  let round = 1, used = Math.min(cap || 0, S.moves.filter(m => m.status === 'tour').reduce((a, m) => { const s = S.stacks.find(x => x.id === m.stack); return a + (s && s.unit !== 'Stk' && s.loc !== m.to ? m.amount : 0); }, 0));
  for (const r of items) {
    let rest = r.amt;
    while (rest > 1e-9) {
      if (cap && used >= cap - 1e-9) { round++; used = 0; }
      const take = cap ? Math.min(rest, cap - used) : rest;
      S.sales.push({ id: uid(), stack: r.s.id, amount: Math.round(take * 1e6) / 1e6, term: r.c.pick.term, price: r.c.pick.sell, round, status: 'tour', planned: plan, ts: now() });
      used += take; rest -= take;
    }
  }
  const T = curTour(); T.stops = []; T.sig = null; T.manual = false; T.round = 1;
  S.ui.saleView = null; S.ui.tourStop = 0; S.ui.sale.sel = {};
  hist(`Verkaufstour geplant: ${items.length} Posten, ${round} Runde${round > 1 ? 'n' : ''}`);
  setComm(`VERKAUFSTOUR ERSTELLT · ${round} RUNDE${round > 1 ? 'N' : ''}`);
  save(); render();
}
