'use strict';
/* Pliskin Industrie – Heute / To-do (Nächste Schritte, Craften, Material & Mining, Logistik, Blueprints),
   Home-Station & Favoriten, „Zusammenholen“ (Material eines Plans zur Home-Station umlagern). */

const TODO_TABS = [['next', '★ Nächste Schritte'], ['craft', 'Craften'], ['mat', 'Material & Mining'], ['logi', 'Logistik'], ['bp', 'Blueprints']];
let TODO_ACTS = [];
const act = fn => { TODO_ACTS.push(fn); return TODO_ACTS.length - 1; };
const bindActs = el => $$('[data-act]', el).forEach(b => b.onclick = e => { e.stopPropagation(); const f = TODO_ACTS[+b.dataset.act]; f && f(); });
const homeSet = () => !!(S.settings.home || '').trim();
const atHome = loc => homeSet() && norm2(loc) === norm2(S.settings.home);

/* ------------------------------------------------------------------ */
/* Zusammenholen                                                        */
/* ------------------------------------------------------------------ */
// Lagerposten, die für die Pläne verplant sind, aber nicht an der Home-Station liegen
function collectList(plan) {
  if (!homeSet()) return [];
  const acc = {};
  for (const p of (plan ? [plan] : S.plans)) for (const [sid, a] of Object.entries(CALC.resPlan[p.id] || {})) acc[sid] = (acc[sid] || 0) + a;
  return Object.entries(acc).map(([sid, a]) => ({ s: S.stacks.find(x => x.id === sid), amt: a }))
    .filter(x => x.s && x.s.loc && !atHome(x.s.loc) && !S.moves.some(m => m.stack === x.s.id && m.status !== 'erledigt'))
    .map(x => ({ s: x.s, amt: Math.min(x.amt, x.s.amount) })).filter(x => x.amt > 1e-9);
}
function doCollect(list) {
  if (!list.length) { toast(homeSet() ? 'Alles liegt schon an der Home-Station' : 'Erst eine Home-Station festlegen'); return; }
  for (const x of list) S.moves.push({ id: uid(), stack: x.s.id, amount: x.amt, to: S.settings.home, status: 'tour', ts: now() });
  hist(`Zusammenholen: ${list.length} Umlagerung(en) nach ${S.settings.home}`);
  S.ui.tourKind = 'lager'; S.ui.saleView = null;
  save(); render(); toast(`${list.length} Umlagerung(en) in die Lager-Tour gelegt`);
}
function moveHome(id) {
  const s = S.stacks.find(x => x.id === id); if (!s) return;
  if (!homeSet()) { toast('Erst unter „Home & Favoriten“ eine Home-Station festlegen'); return; }
  if (atHome(s.loc)) { toast('Liegt schon an der Home-Station'); return; }
  if (S.moves.some(m => m.stack === id && m.status !== 'erledigt')) { toast('Ist schon für eine Umlagerung eingeplant'); return; }
  S.moves.push({ id: uid(), stack: s.id, amount: s.amount, to: S.settings.home, status: 'tour', ts: now() });
  hist(`Umlagerung geplant: ${fmtAmt(s.amount, s.unit)} ${resName(s.mat)} ${s.loc || ''} → ${S.settings.home}`);
  save(); render(); toast('In die Lager-Tour gelegt: → ' + S.settings.home);
}

/* ------------------------------------------------------------------ */
/* Daten fürs To-do (PC und Handy nutzen dasselbe)                      */
/* ------------------------------------------------------------------ */
function todoModel() {
  const f = S.ui.todoFilter, plan = f === 'all' ? null : S.plans.find(p => p.id === f) || null;
  const plans = plan ? [plan] : S.plans;
  const craft = CALC.craft.filter(x => !plan || x.plan.id === plan.id);
  const blocked = [];
  for (const p of plans) for (const it of p.items) {
    if (it.kind === 'mat') continue;
    const r = CALC.items[it.id]; if (!r || !r.rem || (r.owned && r.canBuild > 0)) continue;
    const lack = r.reqs.filter(q => q.need - q.have > 1e-6).map(q => ({ mat: q.mat, amt: q.need - q.have, unit: q.unit, minQ: q.minQ }));
    blocked.push({ plan: p, it, bp: !r.owned, lack });
  }
  // fehlendes Material (bei gewähltem Plan nur dessen Anteil)
  const mats = Object.entries(CALC.missing).map(([id, v]) => {
    const need = plan ? ((CALC.missPlan[plan.id] || {})[id] || 0) : v.need;
    if (need <= 1e-6) return null;
    const m = wMat(id), q = v.minQ || 0;
    return { id, need, unit: v.unit, minQ: q, plans: v.plans, m, spots: m ? wSpots(m, q) : [], ref: m && mainKind(m) === 'ship' ? (wRefs(m).find(r => r.b != null) || null) : null,
      best: m ? SYSTEMS.map(s => [s, Math.max(...Object.keys(m.where).map(k => (m.where[k].some(r => r[1] === s) ? qChance(m, k, s, q) : 0)))]).sort((a, b) => b[1] - a[1])[0] : null };
  }).filter(Boolean).sort((a, b) => (b.minQ - a.minQ) || b.need - a.need);
  // fehlende Blueprints nach Missions-Pool
  const miss = Object.entries(CALC.missions).filter(([, v]) => !plan || v.plans.has(plan.name)).map(([id, v]) => ({ b: BP[id] || { id, name: id, pools: [] }, plans: v.plans }));
  const pools = {};
  miss.forEach(x => (x.b.pools || []).forEach(p => (pools[p] = pools[p] || { p, bps: [] }).bps.push(x.b)));
  const poolList = Object.values(pools).sort((a, b) => b.bps.length - a.bps.length || ((W && W.pools[b.p] ? 1 : 0) - (W && W.pools[a.p] ? 1 : 0)));
  const noPool = miss.filter(x => !(x.b.pools || []).length);
  // Logistik
  const moves = S.moves.filter(m => m.status !== 'erledigt');
  const sales = S.sales.filter(x => x.status === 'tour');
  const sellable = S.stacks.filter(s => stackSell(s) && !S.sales.some(x => x.stack === s.id && x.status === 'tour'));
  const sellVal = sellable.reduce((a, s) => { const p = bestPrice(s.mat); return a + (p ? p.sell * s.amount : 0); }, 0);
  const ctrs = S.contracts.filter(c => c.status !== 'erledigt');
  const openStops = t => t ? t.stops.filter(s => !s.done).length : 0;
  return { plan, plans, craft, blocked, mats, miss, poolList, noPool, moves, sales, sellable, sellVal, ctrs, collect: collectList(plan),
    stourOpen: openStops(S.stour), tourOpen: openStops(S.tour) };
}
// Nächste Schritte: eine gemischte, sortierte Liste
function todoSteps(T) {
  const st = [];
  if (!S.plans.length) st.push({ tag: 'START', cls: 'ok', t: '<b>Ersten Crafting-Plan anlegen</b> – z. B. die Komponenten für ein Schiff oder eine Rüstung.', btn: 'Zu den Plänen', fn: () => goTab('plan') });
  if (!homeSet()) st.push({ tag: 'START', cls: 'ok', t: '<b>Home-Station festlegen</b> – dorthin holt Pliskin dein Material zusammen.', btn: 'Festlegen', fn: () => goTab('orte') });
  T.craft.forEach(x => st.push({ tag: 'CRAFTEN', cls: 'ok', t: `<b>${esc(BP[x.it.bp].name)}</b> ×${x.n} – alles da`, sub: 'Plan ' + x.plan.name, btn: '1 gebaut', fn: () => markBuilt(x.plan, x.it) }));
  if (T.collect.length) {
    const locs = [...new Set(T.collect.map(x => x.s.loc))];
    st.push({ tag: 'HOLEN', cls: 'warn', t: `<b>Material zur Home-Station holen:</b> ${T.collect.length} Posten aus ${locs.map(esc).join(', ')} → ${esc(S.settings.home)}`, sub: T.plan ? 'Plan ' + T.plan.name : 'alle Pläne', btn: 'Zusammenholen', fn: () => doCollect(T.collect) });
  }
  if (T.stourOpen) st.push({ tag: 'TOUR', cls: 'warn', t: `<b>Lager-Tour</b> läuft – noch ${T.stourOpen} Stopp(s)`, btn: 'Zur Tour', fn: () => { S.ui.tourKind = 'lager'; goTab('tour'); } });
  else if (T.moves.length) st.push({ tag: 'TOUR', cls: 'warn', t: `<b>${T.moves.length} Umlagerung(en)</b> geplant`, btn: 'Tour planen', fn: () => { S.ui.tourKind = 'lager'; goTab('tour'); } });
  if (T.tourOpen) st.push({ tag: 'CONTRACT', cls: 'warn', t: `<b>Contracts-Tour</b> läuft – noch ${T.tourOpen} Stopp(s)`, btn: 'Zur Tour', fn: () => { S.ui.tourKind = 'ctr'; goTab('tour'); } });
  T.mats.slice(0, 4).forEach(x => {
    const s = x.spots[0];
    st.push({ tag: 'MINEN', cls: 'bad', t: `<b>${esc(resName(x.id))}</b> ${fmtAmt(x.need, x.unit)}${x.minQ ? ' · Q ≥ ' + x.minQ : ''}${s ? ` – beste Chance: <b>${esc(s.loc)}</b> (${esc(s.sys)}, ${pctTxt(s.hit)} je Stein)` : ''}${x.ref && x.ref.b > 0 ? ` · raffinieren: ${esc(shortLoc(x.ref.name))} ${sgn(x.ref.b)} %` : ''}`, sub: [...x.plans].join(', '), btn: 'Atlas', fn: () => openAtlas(x.id, x.minQ) });
  });
  if (T.poolList.length) {
    const p = T.poolList[0], c = W && W.pools[p.p] && W.pools[p.p].c[0];
    st.push({ tag: 'MISSION', cls: 'vio', t: `<b>${esc(poolName(p.p))}</b> – bringt ${p.bps.length} deiner fehlenden Blueprints (${p.bps.slice(0, 3).map(b => esc(b.name)).join(', ')}${p.bps.length > 3 ? ' …' : ''})`, link: c ? SCMDB(c[3]) : null, btn: 'Alle Missionen', fn: () => { S.ui.todoTab = 'bp'; render(); } });
  }
  if (T.sellable.length && !T.sales.length) st.push({ tag: 'VERKAUF', cls: '', t: `<b>${T.sellable.length} Posten</b> zum Verkauf freigegeben${T.sellVal ? ' · ~' + N(T.sellVal) + ' aUEC' : ''}`, btn: 'Verkauf planen', fn: () => { S.ui.tourKind = 'lager'; S.ui.saleView = 'plan'; goTab('tour'); } });
  return st;
}
function goTab(t) {
  if (window.MOBILE && typeof mGo === 'function') mGo(t === 'lager' && S.ui.lagerTab === 'move' ? 'move' : ({ plan: 'plans' }[t] || t));
  else switchTab(t);
}

/* ------------------------------------------------------------------ */
/* PC: Heute / To-do                                                    */
/* ------------------------------------------------------------------ */
function renderTodo() {
  const el = $('#todo');
  if (!W) { wInit().then(render); }
  TODO_ACTS = [];
  const T = todoModel(), tab = TODO_TABS.some(x => x[0] === S.ui.todoTab) ? S.ui.todoTab : 'next', f = S.ui.todoFilter;
  const cnt = { next: '', craft: T.craft.length, mat: T.mats.length, logi: T.moves.length + T.sales.length + T.ctrs.length, bp: T.miss.length };
  let h = `<div class="subkeys">${TODO_TABS.map(([k, l]) => `<div class="key ${tab === k ? 'on' : ''}" data-tt="${k}">${l}${cnt[k] ? ' · ' + cnt[k] : ''}</div>`).join('')}</div>
    ${S.plans.length > 1 ? `<div class="chips2"><span data-f="all" class="${f === 'all' ? 'on' : ''}">Alle Pläne</span>${S.plans.map(p => `<span data-f="${p.id}" class="${f === p.id ? 'on' : ''}">${esc(p.name)}</span>`).join('')}</div>` : ''}`;
  h += ({ next: tdNext, craft: tdCraft, mat: tdMat, logi: tdLogi, bp: tdBp })[tab](T);
  el.innerHTML = h;
  $$('[data-tt]', el).forEach(k => k.onclick = () => { S.ui.todoTab = k.dataset.tt; save(); renderTodo(); });
  $$('[data-f]', el).forEach(c => c.onclick = () => { S.ui.todoFilter = c.dataset.f; save(); renderTodo(); });
  $$('[data-bp]', el).forEach(r => r.onclick = e => { if (e.target.closest('a,button')) return; openBpDetail(r.dataset.bp); });
  bindActs(el);
}
const TAGC = { ok: 'ok', warn: 'warn', bad: 'bad', vio: 'q', '': '' };
function tdNext(T) {
  const st = todoSteps(T);
  return `<div class="win tight"><span class="pill">★ Nächste Schritte</span><span class="sub">einfach von oben abarbeiten${T.plan ? ' · Plan ' + esc(T.plan.name) : ''}</span>
    <div class="tdk">
      <div data-act="${act(() => { S.ui.todoTab = 'craft'; render(); })}"><b>${T.craft.length}</b>jetzt craftbar</div>
      <div data-act="${act(() => { S.ui.todoTab = 'mat'; render(); })}"><b>${T.mats.length}</b>Materialien fehlen</div>
      <div data-act="${act(() => { S.ui.todoTab = 'logi'; render(); })}"><b>${T.moves.length + T.sales.length + T.ctrs.length}</b>Transporte offen</div>
      <div data-act="${act(() => { S.ui.todoTab = 'bp'; render(); })}"><b>${T.miss.length}</b>Blueprints fehlen</div></div>
    <table class="ptab">${st.map(s => `<tr><td class="l" style="width:1%"><span class="tag ${TAGC[s.cls]}">${s.tag}</span></td><td class="l">${s.t}${s.sub ? `<div class="dim" style="font-size:12px">${esc(s.sub)}</div>` : ''}</td>
      <td style="white-space:nowrap">${s.link ? `<a class="k sm" href="${s.link}" target="_blank" rel="noopener">SCMDB ↗</a> ` : ''}<button class="k sm ${s.cls === 'ok' ? 'pri' : ''}" data-act="${act(s.fn)}">${esc(s.btn)}</button></td></tr>`).join('')
      || '<tr><td class="empty">Alles erledigt – nichts zu tun. 🎉</td></tr>'}</table></div>`;
}
function tdCraft(T) {
  const why = b => [b.bp ? '<span class="tag q">Blueprint fehlt</span>' : '', ...b.lack.map(l => `<span class="tag bad">${fmtAmt(l.amt, l.unit)} ${esc(resName(l.mat))}${l.minQ ? ' Q≥' + l.minQ : ''}</span>`)].join(' ');
  return `<div class="cols2"><div class="win tight"><span class="pill">🔧 Jetzt craften</span><span class="sub">alles da</span>
    <table class="ptab"><tr><th class="l">Bauteil</th><th>Anz.</th><th class="l">Plan</th><th class="l">Material liegt in</th><th></th></tr>
    ${T.craft.map(x => { const locs = [...new Set(Object.keys(CALC.resPlan[x.plan.id] || {}).map(id => (S.stacks.find(s => s.id === id) || {}).loc).filter(Boolean))];
      return `<tr><td class="name">${esc(BP[x.it.bp].name)}</td><td>${x.n}</td><td class="l dim">${esc(x.plan.name)}</td><td class="l dim" style="font-size:12px">${locs.map(l => esc(l) + (atHome(l) ? ' ⌂' : '')).join(', ') || '–'}</td><td><button class="k sm pri" data-act="${act(() => markBuilt(x.plan, x.it))}">1 gebaut</button></td></tr>`; }).join('')
      || '<tr><td colspan="5" class="empty">Noch nichts baubar.</td></tr>'}</table>
    <div class="hint">„1 gebaut“ zieht das Material automatisch aus dem Lager ab.</div>
    ${T.collect.length ? `<div class="row2"><button class="k" data-act="${act(() => doCollect(T.collect))}">⇄ Material zur Home-Station holen (${T.collect.length})</button></div>` : ''}</div>
  <div class="win tight"><span class="pill">⏳ Geplant · noch nicht möglich</span><span class="sub">${T.blocked.length}</span>
    <table class="ptab"><tr><th class="l">Bauteil</th><th class="l">Plan</th><th class="l">Was fehlt</th></tr>
    ${T.blocked.map(b => `<tr ${b.bp ? `class="clickrow" data-bp="${b.it.bp}"` : ''}><td class="name">${esc(itemName(b.it))}</td><td class="l dim">${esc(b.plan.name)}</td><td class="l">${why(b)}</td></tr>`).join('')
      || '<tr><td colspan="3" class="empty">Nichts blockiert.</td></tr>'}</table></div></div>`;
}
function tdMat(T) {
  return `<div class="win tight"><span class="pill">⛏ Material & Mining</span><span class="sub">${T.plan ? 'Plan ' + esc(T.plan.name) : 'alle Pläne zusammen'} · Fundorte und Qualität aus den Spieldaten</span>
    <div class="scroll"><table class="ptab"><tr><th class="l">Material</th><th>Fehlt</th><th>ab Q</th><th class="l">Beste Chance (je Stein)</th><th class="l">Qualität im besten System</th><th class="l">Raffinieren</th><th></th></tr>
    ${T.mats.map(x => `<tr><td class="name">${esc(resName(x.id))}${x.m ? ` <span class="dim" style="font-size:12px">${KINDL[mainKind(x.m)]}</span>` : ''}<div class="dim" style="font-size:12px">${esc([...x.plans].join(', '))}</div></td>
      <td class="tot">${fmtAmt(x.need, x.unit)}</td><td>${x.minQ || '–'}</td>
      <td class="l" style="font-size:13px">${x.spots.slice(0, 3).map(s => `${esc(s.loc)}${locMark(s.loc)} <span class="dim">${pctTxt(s.hit)}</span>`).join('<br>') || '<span class="dim">keine Fundort-Daten (z. B. Handelsware)</span>'}</td>
      <td class="l" style="font-size:13px">${x.best ? `${esc(x.best[0])}: <b>${pctTxt(x.best[1] * 100)}</b> der Funde ≥ Q${x.minQ}` : '–'}</td>
      <td class="l" style="font-size:13px">${x.ref ? `${esc(shortLoc(x.ref.name))} <span class="${bcls(x.ref.b)}">${sgn(x.ref.b)} %</span>` : '<span class="dim">–</span>'}</td>
      <td style="white-space:nowrap">${x.m ? `<button class="k sm" data-act="${act(() => openAtlas(x.id, x.minQ))}">Atlas</button> ` : ''}<button class="k sm" data-act="${act(() => bookMat(x.id))}">Einbuchen</button></td></tr>`).join('')
      || '<tr><td colspan="7" class="empty">Kein Material offen.</td></tr>'}</table></div>
    ${T.mats.some(x => x.m) ? `<div class="row2"><button class="k pri" data-act="${act(() => openTrip(true))}">⛏ Mining-Ausflug für dieses Material planen</button><span class="dim">findet Orte, an denen du mehrere davon zusammen bekommst</span></div>` : ''}
    <div class="hint"><b>Beste Chance je Stein</b> = wie viele Steine dort das Material in deiner Wunsch-Qualität enthalten (Vorkommen × Qualitäts-Chance). Mehr dazu im Material-Atlas unter „Datenbank“.</div></div>`;
}
function bookMat(id) {
  if (window.MOBILE && typeof mQuickBook === 'function') return mQuickBook(id);
  S.ui.lagerTab = 'bestand'; switchTab('lager');
  setTimeout(() => { const i = $('#bk-mat'); if (i) { i.value = resName(id); i.dataset.value = id; i.dispatchEvent(new Event('input')); $('#bk-amt') && $('#bk-amt').focus(); } }, 60);
}
function tdLogi(T) {
  const stk = id => S.stacks.find(x => x.id === id);
  return `<div class="cols2">
  <div class="win tight"><span class="pill">⇄ Umlagerungen</span><span class="sub">${T.moves.length} geplant</span>
    <table class="ptab">${T.moves.map(m => { const s = stk(m.stack); return `<tr><td class="name">${s ? esc(resName(s.mat)) : '?'}</td><td>${s ? fmtAmt(m.amount, s.unit) : F(m.amount, 2)}</td><td class="l dim">${esc(s ? s.loc : '?')} → ${esc(m.to)}</td><td class="l"><span class="tag ${m.status === 'tour' ? 'warn' : ''}">${m.status === 'tour' ? 'in der Tour' : 'offen'}</span></td></tr>`; }).join('') || '<tr><td class="empty">Nichts geplant.</td></tr>'}</table>
    <div class="row2">${T.collect.length ? `<button class="k" data-act="${act(() => doCollect(T.collect))}">Material zur Home-Station holen (${T.collect.length})</button>` : ''}<button class="k" data-act="${act(() => { S.ui.lagerTab = 'move'; goTab('lager'); })}">Umlagerung planen</button><button class="k pri" data-act="${act(() => { S.ui.tourKind = 'lager'; S.ui.saleView = null; goTab('tour'); })}">Lager-Tour</button></div></div>
  <div class="win tight"><span class="pill">💰 Verkauf</span><span class="sub">${T.sales.length ? T.sales.length + ' in der Tour' : T.sellable.length + ' Posten freigegeben'}</span>
    <table class="ptab">${T.sales.map(x => { const s = stk(x.stack); return `<tr><td class="name">${s ? esc(resName(s.mat)) : '?'}</td><td>${F(x.amount, 2)} SCU</td><td class="l dim">→ ${esc(x.term || '')}</td></tr>`; }).join('')
      || T.sellable.slice(0, 8).map(s => `<tr><td class="name">${esc(resName(s.mat))}</td><td>${fmtAmt(s.amount, s.unit)}</td><td class="l dim">${esc(s.loc || '')}</td></tr>`).join('') || '<tr><td class="empty">Nichts zum Verkauf freigegeben.</td></tr>'}</table>
    ${T.sellVal && !T.sales.length ? `<div class="hint">Wert laut UEX: ~${N(T.sellVal)} aUEC</div>` : ''}
    <div class="row2"><button class="k pri" data-act="${act(() => { S.ui.tourKind = 'lager'; S.ui.saleView = 'plan'; goTab('tour'); })}">Verkauf planen</button></div></div>
  <div class="win tight"><span class="pill">✉ Contracts</span><span class="sub">${T.ctrs.length} offen</span>
    <table class="ptab">${T.ctrs.map(c => `<tr><td class="name">${esc(c.giver || '–')}</td><td>${F(ctrScu(c), 2)} SCU</td><td class="l dim">${c.reward ? N(c.reward) + ' aUEC' : ''}</td><td class="l"><span class="tag ${c.status === 'tour' ? 'warn' : ''}">${c.status === 'tour' ? 'in der Tour' : 'offen'}</span></td></tr>`).join('') || '<tr><td class="empty">Keine offenen Contracts.</td></tr>'}</table>
    <div class="row2"><button class="k" data-act="${act(() => goTab('ctr'))}">Contracts</button><button class="k pri" data-act="${act(() => { S.ui.tourKind = 'ctr'; goTab('tour'); })}">Contracts-Tour</button></div></div>
  <div class="win tight"><span class="pill">⌂ Home-Station</span><span class="sub">${homeSet() ? esc(S.settings.home) : 'nicht festgelegt'}</span>
    <div class="hint" style="margin-top:0">${homeSet() ? `Touren starten und enden hier, „Zusammenholen“ bringt Material hierher.` : 'Leg eine Home-Station fest – dann kann Pliskin dein Material per Klick zusammenholen.'}</div>
    <div class="row2"><button class="k" data-act="${act(() => goTab('orte'))}">Home & Favoriten</button></div></div></div>`;
}
function tdBp(T) {
  return `<div class="win tight"><span class="pill">🎯 Fehlende Blueprints</span><span class="sub">${T.miss.length} fehlen in ${T.plan ? 'Plan ' + esc(T.plan.name) : 'deinen Plänen'} · nach Mission sortiert</span>
    ${T.poolList.map(p => `<div class="wpool"><div class="wph"><b>${esc(poolName(p.p))}</b><span class="tag warn">${p.bps.length} deiner fehlenden BP</span></div>
      <div class="wbps">${p.bps.map(b => `<span class="plan" data-bp="${b.id}">★ ${esc(b.name)}</span>`).join('')}</div>${scLinks(p.p, 5) || '<div class="dim" style="font-size:12px">Keine Missions-Links in SCMDB (Event oder Sonderquelle)</div>'}</div>`).join('')}
    ${T.noPool.length ? `<div class="wpool"><div class="wph"><b>Ohne bekannte Mission</b></div><div class="wbps">${T.noPool.map(x => `<span data-bp="${x.b.id}">${esc(x.b.name)}</span>`).join('')}</div></div>` : ''}
    ${!T.miss.length ? '<div class="empty">Alle Blueprints für deine Pläne vorhanden.</div>' : ''}
    <div class="hint">Hakt sich beim Log-Sync von selbst ab. Blueprint anklicken = Details. Alle Missionen mit Blueprints: Datenbank → Missionen.</div>
    <div class="row2"><button class="k" data-act="${act(() => { S.ui.dbTab = 'miss'; goTab('db'); })}">Alle Missionen → Blueprints</button></div></div>`;
}

/* ------------------------------------------------------------------ */
/* Home-Station & Favoriten                                             */
/* ------------------------------------------------------------------ */
const HUBS = ['Area18', 'Lorville', 'New Babbage', 'Orison', 'Levski'];
function renderOrte() {
  const el = $('#orte'), home = S.settings.home || '';
  el.innerHTML = `<div class="cols2"><div class="win tight"><span class="pill">⌂ Home-Station</span><span class="sub">wie im Spiel: genau eine</span>
      <div class="hint" style="margin-top:0">Dein Haupt-Hub. Vorgabe beim Einbuchen, Start und Ende der Touren, Ziel bei „Zusammenholen“ und „→ ⌂ Home“.</div>
      <div class="chips2" style="margin-top:8px">${HUBS.map(x => `<span data-hub="${esc(x)}" class="${norm2(x) === norm2(home) ? 'on' : ''}">${esc(x)}</span>`).join('')}</div>
      <div class="form"><div class="fld" style="min-width:240px;flex:1"><label>oder frei eintragen</label><input id="or-home" value="${esc(home)}" autocomplete="off" placeholder="z. B. Area18"></div><button class="k pri" id="or-hgo">Speichern</button></div>
      ${home ? `<div class="hint">Aktuell: <b class="green">⌂ ${esc(home)}</b></div>` : '<div class="hint warn">Noch keine Home-Station festgelegt.</div>'}</div>
    <div class="win tight"><span class="pill">☆ Favoriten</span><span class="sub">Orte, an denen du oft bist – kürzen nur die Auswahl ab</span>
      <div class="form"><div class="fld" style="min-width:220px;flex:2"><label>Ort</label><input id="fv-l" autocomplete="off" placeholder="z. B. MIC-L2, Levski"></div>
        <div class="fld"><label>Wofür (optional)</label><select id="fv-k"><option value="">–</option><option>Raffinerie</option><option>Lager</option><option>Handel</option><option>Tanken</option><option>Mining</option></select></div>
        <button class="k pri" id="fv-go">+ Favorit</button></div>
      <table class="ptab" style="margin-top:8px">${S.favs.map((f, i) => `<tr><td class="name">☆ ${esc(f.loc)}</td><td class="l dim">${esc(f.kind || '')}${f.name && f.name !== f.kind ? ' · ' + esc(f.name) : ''}</td>
        <td style="white-space:nowrap"><button class="k sm" data-fu="${i}">▲</button> <button class="k sm x" data-fv="${i}">×</button></td></tr>`).join('') || '<tr><td class="empty">Noch keine Favoriten.</td></tr>'}</table>
      <div class="hint">In jedem Ort-Feld (Einbuchen, Umlagern, Contracts) stehen ⌂ Home und deine Favoriten als Knöpfe direkt unter dem Feld.</div></div></div>`;
  const hi = $('#or-home', el); attachAC(hi, locationChoices);
  const setHome = v => { S.settings.home = v.trim(); hist('Home-Station: ' + (S.settings.home || '–')); [S.tour, S.stour].forEach(t => t && (t.sig = null)); save(); render(); toast(S.settings.home ? '⌂ Home: ' + S.settings.home : 'Home entfernt'); };
  $('#or-hgo', el).onclick = () => setHome(hi.value);
  $$('[data-hub]', el).forEach(c => c.onclick = () => setHome(c.dataset.hub));
  attachAC($('#fv-l', el), locationChoices);
  $('#fv-go', el).onclick = () => { const l = $('#fv-l', el).value.trim(); if (!l) return; if (S.favs.some(f => norm2(f.loc) === norm2(l))) { toast('Ist schon Favorit'); return; } const k = $('#fv-k', el).value; S.favs.push({ loc: l, name: k, kind: k }); save(); render(); };
  $$('[data-fv]', el).forEach(b => b.onclick = () => { S.favs.splice(+b.dataset.fv, 1); save(); render(); });
  $$('[data-fu]', el).forEach(b => b.onclick = () => { const i = +b.dataset.fu; if (i > 0) [S.favs[i - 1], S.favs[i]] = [S.favs[i], S.favs[i - 1]]; save(); render(); });
}
