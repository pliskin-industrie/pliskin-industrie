'use strict';
/* Pliskin Industrie – Handy-Oberflaeche. Nutzt Daten, Rechnung und Fenster aus app.js,
   zeichnet nur die Bildschirme neu (To-do, Plaene, Lager, Mehr …). */

const M = { view: 'todo', back: [], todoKind: 'all', lagerQ: '', planTab: 'parts', openPart: null };
const TAB = !!window.PLISKIN_TABLET;
const ROOTS = TAB ? ['todo', 'plans', 'lager', 'bp', 'mehr'] : ['todo', 'plans', 'lager', 'mehr'];
/* Tablet quer: Liste links, Details rechts */
const wide = () => TAB && innerWidth > innerHeight && innerWidth >= 700;
const TITLES = { todo: 'Pliskin', plans: 'Crafting-Pläne', plan: 'Plan', lager: 'Lager', mehr: 'Pliskin', bp: 'Blueprints', db: 'Datenbank', orte: 'Home & Favoriten', help: 'Hilfe',
  hist: 'Historie', calc: 'SCU-Rechner', log: 'Log-Sync', opt: 'Einstellungen', ctr: 'Contracts', tour: 'Tour planen', ships: 'Schiffe', move: 'Umlagerung' };

const pctBar = p => `<div class="mbar2"><i style="width:${Math.max(0, Math.min(100, p))}%"></i></div>`;

function mGo(v, push = true) {
  if (ROOTS.includes(v)) M.back = [];
  else if (push && M.view !== v) M.back.push(M.view);
  M.view = v;
  $('#m-scr').scrollTop = 0;
  render();
}
function mBack() { const v = M.back.pop(); M.view = v || 'todo'; render(); }

/* Auswahl-Blatt mit grossen Knoepfen */
function mSheet(title, actions) {
  openModal(`<h3>${esc(title)}</h3><div style="display:flex;flex-direction:column;gap:8px">
    ${actions.map((a, i) => `<div class="mbtn ${a.cls || ''}" data-i="${i}">${a.label}</div>`).join('')}
    <div class="mbtn" data-i="x">Abbrechen</div></div>`, box => {
    $$('[data-i]', box).forEach(b => b.onclick = () => { closeModal(); const a = actions[b.dataset.i]; if (a) a.fn(); });
  });
}

/* ------------------------------------------------------------------ */
/* Kopf + Fuss                                                          */
/* ------------------------------------------------------------------ */
function mHeader() {
  const scu = S.stacks.filter(s => s.unit !== 'Stk').reduce((a, s) => a + s.amount, 0);
  $('#m-s1').textContent = S.plans.length;
  $('#m-s2').textContent = scu >= 1000 ? Math.round(scu) : F(scu, 1).replace(',', '.');
  $('#m-s3').textContent = Object.keys(S.owned).length;
  $('#m-s4').textContent = Object.keys(CALC.missions).length + Object.keys(CALC.missing).length;
  const last = S.syncLog[0];
  $('#ind-auto').classList.toggle('on', !!last && !last.error);
  $('#ind-uex').classList.toggle('on', !!U.ts && !U.stale);
  $('#ind-warn').classList.toggle('on', !!(U.error || (last && last.error)));
  let t = TITLES[M.view] || 'Pliskin';
  if (M.view === 'plan') { const p = curPlan(); t = p ? p.name : 'Plan'; }
  $('#m-title').textContent = t;
  $('#m-back').hidden = !M.back.length;
  const keyOf = { plan: 'plans', bp: TAB ? 'bp' : 'mehr', hist: 'mehr', calc: 'mehr', log: 'mehr', opt: 'mehr', db: 'mehr', orte: 'mehr', help: 'mehr', tour: 'mehr', ctr: 'mehr', ships: 'mehr', move: 'mehr' };
  const k = keyOf[M.view] || M.view;
  $$('#m-keys .mkey').forEach(x => x.classList.toggle('on', x.dataset.v === k));
  $('#m-foot').textContent = `Pliskin Industrie ${APP_VERSION}${DEMO ? ' · DEMO' : ''} · Rezepte: Data.p4k · Patch ${R.patch || '?'} · Preise: UEX Corp${U.ts ? ' (Stand ' + fmtTime(new Date(U.ts * 1000).toISOString()) + ')' : ' (nicht geladen)'} · Blueprints: Game-Logs`;
}

/* ------------------------------------------------------------------ */
/* TO-DO                                                                */
/* ------------------------------------------------------------------ */
function mTodo() {
  if (!W) wInit().then(render);
  TODO_ACTS = [];
  const T = todoModel(), k = TODO_TABS.some(x => x[0] === S.ui.todoTab) ? S.ui.todoTab : 'next', f = S.ui.todoFilter;
  const cnt = { next: todoSteps(T).length, craft: T.craft.length, mat: T.mats.length, logi: T.moves.length + T.sales.length + T.ctrs.length, bp: T.miss.length };
  const lab = { next: '★ Nächste', craft: 'Craften', mat: 'Material', logi: 'Logistik', bp: 'Blueprints' };
  let h = `<div class="mchips">${TODO_TABS.map(([v]) => `<span class="mchip ${k === v ? 'on' : ''}" data-k="${v}">${lab[v]}<b>${cnt[v]}</b></span>`).join('')}</div>`;
  if (S.plans.length > 1) h += `<div class="mchips">${[['all', 'Alle Pläne'], ...S.plans.map(p => [p.id, p.name])].map(([v, l]) => `<span class="mchip ${f === v ? 'on' : ''}" data-f="${v}">${esc(l)}</span>`).join('')}</div>`;
  const it = (ic, cls, title, sub, v, a) => `<div class="mit" ${a != null ? `data-act="${a}"` : ''}><span class="mic ${cls}">${ic}</span><div class="tx"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div>${v ? `<span class="v ${/›$/.test(v) ? 'va' : ''}">${v}</span>` : ''}</div>`;
  h += '<div class="mgs mtodo">';
  if (k === 'next') {
    const IC = { CRAFTEN: ['✓', 'c'], HOLEN: ['⇄', 'a'], MINEN: ['⛏', 'a'], TOUR: ['⌖', 'a'], CONTRACT: ['✉', 'a'], MISSION: ['!', 'm'], VERKAUF: ['💰', 'c'], START: ['➜', 'c'] };
    h += '<div class="mg">' + (todoSteps(T).map(s => it((IC[s.tag] || ['•'])[0], (IC[s.tag] || ['', ''])[1], s.t.replace(/<\/?b>/g, ''), esc(s.sub || '') + (s.link ? ` · <a href="${s.link}" target="_blank" rel="noopener">SCMDB ↗</a>` : ''), esc(s.btn) + ' ›', act(s.fn))).join('') || '<div class="empty">Alles erledigt – nichts zu tun.</div>') + '</div>';
  }
  if (k === 'craft') {
    h += `<div class="mg"><div class="mgrp">Jetzt craften · ${T.craft.length}</div>` + (T.craft.map(x => it('✓', 'c', esc(BP[x.it.bp].name), 'Plan „' + esc(x.plan.name) + '“ · alles da', x.n + '×', act(() => mSheet(BP[x.it.bp].name, [
      { label: '✓ 1 gebaut – Material abbuchen', cls: 'go', fn: () => markBuilt(x.plan, x.it) },
      { label: 'Zum Plan „' + esc(x.plan.name) + '“', fn: () => { S.ui.plan = x.plan.id; M.openPart = x.it.id; mGo('plan'); } }])))).join('') || '<div class="empty">Noch nichts baubar.</div>') + '</div>';
    h += `<div class="mg"><div class="mgrp">Noch nicht möglich · ${T.blocked.length}</div>` + T.blocked.map(b => it(b.bp ? '!' : '⛏', b.bp ? 'm' : 'a', esc(itemName(b.it)), (b.bp ? 'Blueprint fehlt' + (b.lack.length ? ' · ' : '') : '') + b.lack.map(l => fmtAmt(l.amt, l.unit) + ' ' + esc(resName(l.mat))).join(', '), '', b.bp ? act(() => openBpDetail(b.it.bp)) : null)).join('') + '</div>';
    if (T.collect.length) h += `<div class="mbtn" data-act="${act(() => doCollect(T.collect))}">⇄ Material zur Home-Station holen (${T.collect.length})</div>`;
  }
  if (k === 'mat') {
    h += `<div class="mg"><div class="mgrp">Material fehlt · ${T.mats.length}</div>` + (T.mats.map(x => { const s = x.spots[0];
      return it('⛏', 'a', esc(resName(x.id)) + (x.minQ ? ' · Q≥' + x.minQ : ''), s ? `beste Chance: ${esc(s.loc)} (${pctTxt(s.hit)} je Stein)${x.ref && x.ref.b > 0 ? ' · raffinieren ' + esc(shortLoc(x.ref.name)) + ' ' + sgn(x.ref.b) + ' %' : ''}` : esc([...x.plans].join(', ')), fmtAmt(x.need, x.unit),
        act(() => mSheet(resName(x.id), [{ label: '⛏ Fundorte im Atlas', cls: 'go', fn: () => openAtlas(x.id, x.minQ) }, { label: '+ Einbuchen', fn: () => mQuickBook(x.id) }]))); }).join('') || '<div class="empty">Kein Material offen.</div>') + '</div>';
    if (T.mats.some(x => x.m)) h += `<div class="mbtn" data-act="${act(() => openTrip(true))}">⛏ Mining-Ausflug planen (${T.mats.filter(x => x.m).length} Materialien)</div>`;
  }
  if (k === 'logi') {
    h += `<div class="mg"><div class="mgrp">Umlagerungen · ${T.moves.length}</div>` + T.moves.map(m => { const s = S.stacks.find(x => x.id === m.stack); return it('⇄', 'a', s ? esc(resName(s.mat)) : '?', esc(s ? s.loc : '?') + ' → ' + esc(m.to), s ? fmtAmt(m.amount, s.unit) : '', act(() => { S.ui.tourKind = 'lager'; mGo('tour'); })); }).join('') + '</div>';
    if (T.collect.length) h += `<div class="mbtn" data-act="${act(() => doCollect(T.collect))}">⇄ Material zur Home-Station holen (${T.collect.length})</div>`;
    h += `<div class="mg"><div class="mgrp">Verkauf</div>${it('💰', 'c', T.sales.length ? T.sales.length + ' Verkäufe in der Tour' : T.sellable.length + ' Posten freigegeben', T.sellVal && !T.sales.length ? '~' + N(T.sellVal) + ' aUEC' : '', '›', act(() => { S.ui.tourKind = 'lager'; S.ui.saleView = T.sales.length ? null : 'plan'; mGo('tour'); }))}</div>`;
    h += `<div class="mg"><div class="mgrp">Contracts · ${T.ctrs.length}</div>` + T.ctrs.map(c => it('✉', 'a', esc(c.giver || '–'), F(ctrScu(c), 2) + ' SCU' + (c.reward ? ' · ' + N(c.reward) + ' aUEC' : ''), c.status === 'tour' ? 'Tour' : 'offen', act(() => mGo('ctr')))).join('') + '</div>';
  }
  if (k === 'bp') {
    h += T.poolList.map(p => `<div class="mg"><div class="mgrp">${esc(poolName(p.p))} · ${p.bps.length}</div>${p.bps.map(b => it('!', 'm', esc(b.name), '', 'fehlt', act(() => openBpDetail(b.id)))).join('')}${scLinks(p.p, 3)}</div>`).join('');
    if (T.noPool.length) h += `<div class="mg"><div class="mgrp">Ohne bekannte Mission</div>${T.noPool.map(x => it('!', 'm', esc(x.b.name), '', '', act(() => openBpDetail(x.b.id)))).join('')}</div>`;
    if (!T.miss.length) h += '<div class="empty">Alle Blueprints für deine Pläne vorhanden.</div>';
  }
  h += '</div>';
  const el = $('#m-view'); el.innerHTML = h;
  $$('[data-k]', el).forEach(c => c.onclick = () => { S.ui.todoTab = c.dataset.k; save(); render(); });
  $$('[data-f]', el).forEach(c => c.onclick = () => { S.ui.todoFilter = c.dataset.f; save(); render(); });
  bindActs(el);
}

/* ------------------------------------------------------------------ */
/* PLÄNE                                                                */
/* ------------------------------------------------------------------ */
function mPlans(el = $('#m-view')) {
  if (wide() && el.id === 'm-view') {
    el.innerHTML = '<div class="msplit"><div class="ml" id="m-l"></div><div class="mr" id="m-r"></div></div>';
    mPlans($('#m-l')); mPlan($('#m-r')); return;
  }
  const sel = wide() ? (curPlan() || {}).id : null;
  let h = `<div class="mhd"><h3>Pläne</h3><span class="mpill">${S.plans.length}</span></div>`;
  h += S.plans.map((p, i) => {
    const c = CALC.plans[p.id];
    const st = [c.blocked ? `<span class="bad">${c.blocked} BP fehlt</span>` : '', c.mats ? `<span class="warn">${c.mats} Mat. abbauen</span>` : '',
      !c.blocked && !c.mats && p.items.length ? '<span class="green">alles da</span>' : ''].filter(Boolean).join(' · ');
    return `<div class="mit ${c.total && c.done >= c.total ? 'done' : ''} ${p.id === sel ? 'sel' : ''}" data-p="${p.id}">
      <span class="mic c" style="color:var(--pill);border-color:var(--pill)">${i + 1}</span>
      <div class="tx"><b>${esc(p.name)}</b><small>${p.items.reduce((a, x) => a + (x.qty || 0), 0)} Teile${p.items.some(x => x.kind === 'mat') ? ' + ' + p.items.filter(x => x.kind === 'mat').length + ' Material' : ''} · ${c.done}/${c.total} gebaut${st ? ' · ' + st : ''}</small>${pctBar(c.pct)}</div>
      <span class="v">${c.pct}%</span><span class="mpill btn" data-pm="${p.id}">⋯</span></div>`;
  }).join('') || '<div class="empty">Noch kein Plan.<br>Leg z. B. „Golem-Refit“ an.</div>';
  h += `<div class="mbtns"><div class="mbtn pri" id="mp-new">+ Neuer Plan</div><div class="mbtn" id="mp-fit">Fitting einfügen</div></div>
    <div class="hint">Reihenfolge = Vorrang: Obere Pläne bekommen Lagerbestand zuerst. Über ⋯ verschieben.</div>`;
  el.innerHTML = h;
  $$('[data-p]', el).forEach(r => r.onclick = e => { if (e.target.closest('[data-pm]')) return; S.ui.plan = r.dataset.p; M.openPart = null; save(); if (wide()) render(); else mGo('plan'); });
  $$('[data-pm]', el).forEach(b => b.onclick = () => mPlanMenu(b.dataset.pm));
  $('#mp-new', el).onclick = newPlan;
  $('#mp-fit', el).onclick = () => openFittingImport(null);
}
function mPlanMenu(id) {
  const p = S.plans.find(x => x.id === id); if (!p) return;
  mSheet(p.name, [
    { label: '▲ Nach oben (mehr Vorrang)', fn: () => planAction(id, 'up') },
    { label: '▼ Nach unten', fn: () => planAction(id, 'down') },
    { label: 'Umbenennen', fn: () => planAction(id, 'ren') },
    { label: 'Kopieren', fn: () => planAction(id, 'copy') },
    { label: 'Löschen', cls: 'x', fn: () => planAction(id, 'del') }
  ]);
}

function mPlan(el = $('#m-view')) {
  const plan = curPlan();
  if (!plan) { if (el.id === 'm-view') { M.view = 'plans'; mPlans(); } else el.innerHTML = '<div class="empty">Links einen Plan anlegen.</div>'; return; }
  const pc = CALC.plans[plan.id];
  let h = `<div class="mhd"><h3>${esc(plan.name)}</h3><span class="mpill">${pc.done}/${pc.total} · ${pc.pct}%</span><span class="mpill btn" id="mp-menu">⋯</span></div>
    <div class="mchips">${[['parts', 'Bauteile'], ['todo', 'To-do dieses Plans']].map(([v, l]) => `<span class="mchip ${M.planTab === v ? 'on' : ''}" data-pt="${v}">${l}</span>`).join('')}</div>`;
  if (M.planTab === 'parts') {
    h += plan.items.map((it, idx) => {
      if (it.kind === 'mat') {          // Material-Ziel
        const c = CALC.items[it.id], u = c.reqs[0].unit, miss = c.need - c.have, open = M.openPart === it.id;
        let x = `<div class="mpart ${open ? 'open' : ''}"><div class="mit" data-open="${it.id}"><span class="mic a">⛏</span><div class="tx"><b>${esc(resName(it.mat))}</b>
          <small>Material-Ziel · ${fmtAmt(it.amount, u)} ab Q${it.minQ} · Lager ${fmtAmt(c.have, u)}</small>${pctBar(c.pct)}</div>
          <span class="v ${miss > 1e-6 ? 'w' : ''}">${miss > 1e-6 ? '−' + fmtAmt(miss, u) : '✓'}</span></div>`;
        if (open) x += `<div class="more"><div class="mbtns"><div class="mbtn sm pri" data-ia="goal" data-it="${it.id}">Ändern</div><div class="mbtn sm" data-mat="${esc(it.mat)}">+ Einbuchen</div></div>
          <div class="mbtns"><div class="mbtn sm" data-mv="-1" data-it="${it.id}" ${idx === 0 ? 'style="opacity:.4"' : ''}>▲ hoch</div><div class="mbtn sm" data-mv="1" data-it="${it.id}" ${idx === plan.items.length - 1 ? 'style="opacity:.4"' : ''}>▼ runter</div><div class="mbtn sm x" data-ia="del" data-it="${it.id}">Entfernen</div></div></div>`;
        return x + '</div>';
      }
      const bp = BP[it.bp] || { name: it.bp + ' (unbekannt)' }; const c = CALC.items[it.id];
      const open = M.openPart === it.id;
      let st;
      if (c.rem === 0) st = '<span class="green">✓ fertig</span>';
      else if (!c.owned) st = '<span class="bad">Blueprint fehlt</span>';
      else if (c.canBuild > 0) st = `<span class="green">baubar ${c.canBuild}×</span>`;
      else st = '<span class="warn">Material fehlt</span>';
      let x = `<div class="mpart ${open ? 'open' : ''}"><div class="mit" data-open="${it.id}"><div class="tx"><b>${esc(bp.name)}</b>
        <small>${esc(bp.type_de || '')}${bp.size ? ' S' + bp.size : ''} · Ziel Q${it.minQ} · ${it.built || 0}/${it.qty} gebaut · ${st}</small>${pctBar(c.pct)}</div>
        <div class="mstp"><span data-ia="minus" data-it="${it.id}">−</span><em>${it.qty}</em><span data-ia="plus" data-it="${it.id}">+</span></div></div>`;
      if (open) {
        x += `<div class="more">`;
        for (const r of c.reqs) {
          const miss = r.need - r.have;
          const sel = r.slot.options.length > 1
            ? `<select data-ia="pick" data-it="${it.id}" data-slot="${esc(r.slot.key)}" style="padding:5px 6px;font-size:14px">${r.slot.options.map((o, i) => `<option value="${i}" ${i === r.pick ? 'selected' : ''}>${esc(resName(o.id))}</option>`).join('')}</select>`
            : esc(resName(r.mat));
          x += `<div class="mreq"><div class="n">${sel}<small>${esc(r.slot.name)} · ${fmtAmt(r.per, r.unit)} pro Stück · Lager ${fmtAmt(r.have, r.unit)}</small></div>
            <div class="a ${miss > 1e-6 ? 'bad' : 'green'}">${miss > 1e-6 ? '−' + fmtAmt(miss, r.unit) : '✓'}</div></div>`;
        }
        if (!c.reqs.length) x += '<div class="dim" style="padding:6px 0">Kein Rezept hinterlegt.</div>';
        x += `<div class="mrow"><label>ab Qualität</label><input type="number" inputmode="numeric" min="0" max="1000" step="50" value="${it.minQ}" data-ia="q" data-it="${it.id}" style="width:96px">
            <span class="dim" style="font-size:12px">Herstellzeit ${fmtDur(craftTime(bp))}</span></div>
          <div class="mbtns"><div class="mbtn sm go" data-ia="built" data-it="${it.id}">✓ 1 gebaut</div><div class="mbtn sm" data-bpd="${it.bp}">Blueprint</div></div>
          <div class="mbtns"><div class="mbtn sm" data-mv="-1" data-it="${it.id}" ${idx === 0 ? 'style="opacity:.4"' : ''}>▲ hoch</div><div class="mbtn sm" data-mv="1" data-it="${it.id}" ${idx === plan.items.length - 1 ? 'style="opacity:.4"' : ''}>▼ runter</div><div class="mbtn sm x" data-ia="del" data-it="${it.id}">Entfernen</div></div></div>`;
      }
      return x + '</div>';
    }).join('') || '<div class="empty">Leer. Unten „+ Bauteil“.</div>';
    h += `<div class="mbtns"><div class="mbtn pri" id="it-add">+ Bauteil</div><div class="mbtn pri" id="it-goal">+ Material</div><div class="mbtn" id="it-list">+ Fitting</div></div>
      <div class="hint">Antippen klappt Material und Knöpfe auf. Obere Bauteile bekommen das Lager zuerst.</div>`;
  } else {
    const pm = {}, pmis = [], pcr = [];
    for (const it of plan.items) {
      const c = CALC.items[it.id];
      if (!c.owned && c.rem > 0) pmis.push(it.bp);
      if (c.owned && c.canBuild > 0) pcr.push({ it, n: c.canBuild });
      for (const r of c.reqs) if (r.need - r.have > 1e-6) { const m = pm[r.mat] = pm[r.mat] || { miss: 0, q: 0, unit: r.unit }; m.miss += r.need - r.have; m.q = Math.max(m.q, r.minQ); }
    }
    h += `<div class="mgrp">Jetzt craften · ${pcr.length}</div>` + (pcr.map(x => `<div class="mit" data-built="${x.it.id}"><span class="mic c">✓</span><div class="tx"><b>${esc(BP[x.it.bp].name)}</b><small>antippen = 1 gebaut</small></div><span class="v">${x.n}×</span></div>`).join('') || '<div class="empty">nichts</div>');
    h += `<div class="mgrp">Abbauen · ${Object.keys(pm).length}</div>` + (Object.entries(pm).sort((a, b) => b[1].miss - a[1].miss).map(([m, v]) => `<div class="mit" data-mat="${esc(m)}"><span class="mic a">⛏</span><div class="tx"><b>${esc(resName(m))}</b><small>ab Q ${v.q}</small></div><span class="v w">${fmtAmt(v.miss, v.unit)}</span></div>`).join('') || '<div class="empty">nichts</div>');
    h += `<div class="mgrp">Missionen · ${pmis.length}</div>` + (pmis.map(id => `<div class="mit" data-bpd="${id}"><span class="mic m">!</span><div class="tx"><b>BP: ${esc((BP[id] || {}).name || id)}</b></div><span class="v b">fehlt</span></div>`).join('') || '<div class="empty">nichts</div>');
  }
  el.innerHTML = h;
  $('#mp-menu', el).onclick = () => mPlanMenu(plan.id);
  $$('[data-pt]', el).forEach(c => c.onclick = () => { M.planTab = c.dataset.pt; render(); });
  $$('[data-open]', el).forEach(r => r.onclick = e => { if (e.target.closest('.mstp')) return; M.openPart = M.openPart === r.dataset.open ? null : r.dataset.open; render(); });
  $$('[data-ia]', el).forEach(x => {
    const ev = x.tagName === 'INPUT' || x.tagName === 'SELECT' ? 'onchange' : 'onclick';
    x[ev] = e => { e.stopPropagation(); itemAction(plan, x.dataset.it, x.dataset.ia, x); };
  });
  $$('[data-mv]', el).forEach(b => b.onclick = () => {
    const i = plan.items.findIndex(x => x.id === b.dataset.it), j = i + +b.dataset.mv;
    if (j < 0 || j >= plan.items.length) return;
    [plan.items[i], plan.items[j]] = [plan.items[j], plan.items[i]]; save(); render();
  });
  $$('[data-bpd]', el).forEach(b => b.onclick = () => openBpDetail(b.dataset.bpd));
  $$('[data-mat]', el).forEach(r => r.onclick = () => mQuickBook(r.dataset.mat));
  $$('[data-built]', el).forEach(r => r.onclick = () => markBuilt(plan, plan.items.find(x => x.id === r.dataset.built)));
  const ia = $('#it-add', el); if (ia) ia.onclick = () => openBpPicker(plan);
  const il = $('#it-list', el); if (il) il.onclick = () => openListImport(plan);
  const ig = $('#it-goal', el); if (ig) ig.onclick = () => openGoalDialog(plan);
}

/* ------------------------------------------------------------------ */
/* LAGER                                                                */
/* ------------------------------------------------------------------ */
function mLager() {
  const q = M.lagerQ.trim().toLowerCase(), lf = S.ui.locFilter;
  const locs = [...new Set(S.stacks.map(s => s.loc || 'Ohne Lagerort'))].sort();
  const groups = {};
  S.stacks.forEach(s => {
    const loc = s.loc || 'Ohne Lagerort';
    if (lf && lf !== loc) return;
    if (q && !(resName(s.mat).toLowerCase().includes(q) || loc.toLowerCase().includes(q) || (s.note || '').toLowerCase().includes(q))) return;
    (groups[loc] = groups[loc] || []).push(s);
  });
  let total = 0;
  const W = wide();
  let h = `<div class="msearch"><input id="ml-q" type="search" placeholder="⌕ Suchen …" value="${esc(M.lagerQ)}"></div>`;
  if (W) h = `<div class="msplit"><div class="ml"><div class="mhd"><h3>Orte</h3></div>${[['', 'Alle Orte', S.stacks], ...locs.map(l => [l, l, S.stacks.filter(s => (s.loc || 'Ohne Lagerort') === l)])].map(([k, l, list]) =>
    `<div class="mit ${lf === k ? 'sel' : ''}" data-lf="${esc(k)}"><div class="tx"><b>${esc(l)}</b><small>${list.length} Posten</small></div><span class="v">${F(list.filter(s => s.unit !== 'Stk').reduce((a, s) => a + s.amount, 0), 1)}</span></div>`).join('')}
    <div id="ml-val"></div></div><div class="mr">` + h;
  else if (locs.length > 1) h += `<div class="mchips"><span class="mchip ${!lf ? 'on' : ''}" data-lf="">Alle Orte</span>${locs.map(l => `<span class="mchip ${lf === l ? 'on' : ''}" data-lf="${esc(l)}">${esc(l)}</span>`).join('')}</div>`;
  for (const loc of Object.keys(groups).sort()) {
    const items = groups[loc].sort((a, b) => resName(a.mat).localeCompare(resName(b.mat)) || (b.q ?? 0) - (a.q ?? 0));
    const scu = items.filter(s => s.unit !== 'Stk').reduce((a, s) => a + s.amount, 0);
    h += `<div class="mcols"><div class="mgrp">${esc(loc)}<span>${F(scu, 2)} SCU</span></div>`;
    for (const s of items) {
      const bp = bestPrice(s.mat), res = CALC.reservedBy[s.id] || 0;
      const v = stackSell(s) && bp ? bp.sell * s.amount : 0; total += v;
      const sub = [s.q != null ? 'Q ' + s.q : '', stackSell(s) ? '💰 ' + (v ? N(v) + ' UEC' : 'Verkauf') + (s.auto ? '' : ' (Hand)') : (s.unit === 'Stk' ? '' : '🔒 behalten' + (s.auto ? '' : ' (Hand)')), res > 1e-6 ? fmtAmt(res, s.unit) + ' verplant' : '', s.note].filter(Boolean).join(' · ');
      h += `<div class="mit" data-s="${s.id}">${matSym(s.mat)}<div class="tx"><b>${esc(resName(s.mat))}</b><small>${esc(sub)}</small></div><span class="v">${fmtAmt(s.amount, s.unit)}</span></div>`;
    }
    h += '</div>';
  }
  if (!S.stacks.length) h += '<div class="empty">Lager ist leer – unten auf <b>+</b> zum Einbuchen.</div>';
  else if (!Object.keys(groups).length) h += '<div class="empty">Nichts gefunden.</div>';
  if (total) h += `<div style="text-align:right;margin-top:10px">Lagerwert (Verkauf) <span class="big green">${N(total)}</span> <span class="dim">UEC</span></div>`;
  h += '<div class="hint">Antippen = Bearbeiten, Umbuchen, Verkaufen, Löschen.</div>';
  if (W) h += '</div></div>';
  const el = $('#m-view'); el.innerHTML = h;
  const qi = $('#ml-q', el);
  qi.oninput = () => { M.lagerQ = qi.value; clearTimeout(qi.t); qi.t = setTimeout(() => { render(); const n = $('#ml-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
  $$('[data-lf]', el).forEach(c => c.onclick = () => { S.ui.locFilter = c.dataset.lf; save(); render(); });
  $$('[data-s]', el).forEach(r => r.onclick = () => mStackMenu(r.dataset.s));
}
function mStackMenu(id) {
  const s = S.stacks.find(x => x.id === id); if (!s) return;
  const bp = bestPrice(s.mat);
  mSheet(`${resName(s.mat)} · ${fmtAmt(s.amount, s.unit)}${s.loc ? ' · ' + s.loc : ''}`, [
    { label: 'Bearbeiten', fn: () => stackAction(id, 'edit') },
    { label: '⇄ Umbuchen', fn: () => stackAction(id, 'move') },
    ...(s.unit === 'Stk' ? [] : [{ label: !stackSell(s) ? 'Zum Verkauf freigeben' + (bp ? ` (${N(bp.sell)}/SCU)` : '') : 'Behalten (nicht verkaufen)', fn: () => { setStackSell(s, !stackSell(s)); save(); render(); } }]),
    { label: 'Löschen', cls: 'x', fn: () => stackAction(id, 'del') }
  ]);
}

/* ------------------------------------------------------------------ */
/* SCHNELL EINBUCHEN ( + )                                              */
/* ------------------------------------------------------------------ */
function mQuickBook(presetMat) {
  const st = S.settings;
  const recent = [...new Set(S.stacks.slice().reverse().map(s => s.mat))].slice(0, 4);
  const needs = Object.keys(CALC.missing).slice(0, 4);
  const sugg = [...needs.map(m => ({ m, need: true })), ...recent.filter(m => !needs.includes(m)).map(m => ({ m }))].slice(0, 6);
  const units = ['SCU', 'cSCU', 'mSCU'];
  let unit = units.includes(st.inUnit) ? st.inUnit : 'cSCU';
  openModal(`<div class="qb"><h3>Einbuchen</h3>
    <div class="mbtns"><div class="mbtn" id="qb-cam"><s>📷</s>Kiste am PC erfassen<small id="qb-camw"></small></div></div>
    <div class="lb">Material</div><div><input id="qb-mat" autocomplete="off" placeholder="tara… → Taranite"></div>
    ${sugg.length ? `<div class="sugg">${sugg.map(x => `<span class="${x.need ? 'need' : ''}" data-m="${esc(x.m)}">${x.need ? '⛏ ' : ''}${esc(resName(x.m))}</span>`).join('')}</div>` : ''}
    <div class="lb" id="qb-ul">Menge</div><input id="qb-amt" class="amt" inputmode="decimal" autocomplete="off" placeholder="0">
    <div class="units" id="qb-units">${units.map(u => `<span data-u="${u}" class="${u === unit ? 'on' : ''}">${u}</span>`).join('')}</div>
    <div class="conv" id="qb-conv"></div>
    <div class="two"><div><div class="lb">Qualität</div><input id="qb-q" inputmode="numeric" placeholder="–"></div>
      <div><div class="lb">Ort</div><div><input id="qb-loc" autocomplete="off" value="${esc(st.lastLoc || '')}" placeholder="Lagerort"></div></div></div>
    <label class="ftog" style="margin-top:10px;font-size:15px"><input type="checkbox" id="qb-sell"> zum Verkauf freigeben <span class="dim" id="qb-sellw" style="font-size:12px"></span></label>
    <details><summary>Notiz &amp; Kisten (optional)</summary>
      <input id="qb-note" placeholder="Notiz" style="margin-top:6px">
      <div class="boxin" style="margin-top:8px">${[...BOX_SIZES, 0.125].map(s => `<label>${s === 0.125 ? '⅛' : s}<input type="number" inputmode="numeric" min="0" data-box="${s}" placeholder="0"></label>`).join('')}</div></details>
    <div class="mbtns"><div class="mbtn go" id="qb-go">✓ Buchen</div></div>
    <div class="mbtns"><div class="mbtn" id="qb-x">Abbrechen</div></div></div>`, box => {
    const mat = $('#qb-mat', box), amt = $('#qb-amt', box), conv = $('#qb-conv', box), go = $('#qb-go', box);
    const isStk = () => resUnit(mat.dataset.value || '') === 'Stk';
    const amount = () => isStk() ? Math.round(num(amt.value)) : toSCU(amt.value, unit);
    const upd = () => {
      $('#qb-units', box).style.display = isStk() ? 'none' : '';
      $('#qb-ul', box).textContent = isStk() ? 'Menge (Stück)' : 'Menge';
      const a = amount();
      conv.textContent = isStk() || !a ? ' ' : '= ' + F(a, 6) + ' SCU';
      go.textContent = a > 0 ? '✓ Buchen · ' + fmtAmt(a, isStk() ? 'Stk' : 'SCU') : '✓ Buchen';
    };
    const setMat = id => { mat.value = resName(id); mat.dataset.value = id; upd(); amt.focus(); };
    attachAC(mat, materialChoices, () => { upd(); amt.focus(); });
    attachAC($('#qb-loc', box), locationChoices);
    $$('[data-m]', box).forEach(s => s.onclick = () => setMat(s.dataset.m));
    $$('[data-u]', box).forEach(s => s.onclick = () => { unit = s.dataset.u; st.inUnit = unit; $$('[data-u]', box).forEach(x => x.classList.toggle('on', x === s)); upd(); });
    amt.oninput = upd;
    const sellIn = $('#qb-sell', box), qIn = $('#qb-q', box);
    const showSell = () => { const v = qIn.value.trim(); if (!sellIn.dataset.man) sellIn.checked = autoSell(v === '' ? null : Math.round(num(v))); $('#qb-sellw', box).textContent = sellIn.dataset.man ? '(von Hand)' : '(automatisch)'; };
    sellIn.onchange = () => { sellIn.dataset.man = '1'; showSell(); };
    qIn.oninput = showSell; showSell();
    $('#qb-x', box).onclick = closeModal;
    if (typeof erfQbBind === 'function') erfQbBind(box, {
      setMat: (id, name) => { mat.value = name || resName(id); mat.dataset.value = id; },
      setAmt: v => { unit = 'SCU'; st.inUnit = unit; $$('[data-u]', box).forEach(x => x.classList.toggle('on', x.dataset.u === 'SCU')); amt.value = String(v).replace('.', ','); upd(); },
      setQ: q => { qIn.value = q; showSell(); },
      setLoc: l => { $('#qb-loc', box).value = l; },
      setBox: k => { $$('[data-box]', box).forEach(i => i.value = ''); const i = $(`[data-box="${k}"]`, box); if (i) i.value = 1; },
      done: id => { box.dataset.erf = id; }
    });
    go.onclick = () => {
      const name = mat.value.trim(); if (!name) { mat.focus(); return; }
      let id = mat.dataset.value;
      if (!id) { const hit = materialChoices(name).find(x => x.label.toLowerCase() === name.toLowerCase()); id = hit ? hit.value : 'uex:' + name; }
      const a = resUnit(id) === 'Stk' ? Math.round(num(amt.value)) : toSCU(amt.value, unit);
      if (a <= 0) { amt.focus(); return; }
      const qv = $('#qb-q', box).value.trim(); const q = qv === '' ? null : Math.max(0, Math.min(1000, Math.round(num(qv))));
      const boxes = {}; $$('[data-box]', box).forEach(i => { const n = Math.round(num(i.value)); if (n > 0) boxes[i.dataset.box] = n; });
      const loc = $('#qb-loc', box).value.trim();
      const s = { id: uid(), mat: id, amount: a, unit: resUnit(id), q, loc, boxes, note: $('#qb-note', box).value.trim(), auto: !sellIn.dataset.man, keep: !sellIn.checked };
      S.stacks.push(s); st.lastLoc = loc;
      if (box.dataset.erf && typeof erfErledigt === 'function') erfErledigt(box.dataset.erf, q, a);
      hist(`Eingebucht: ${fmtAmt(a, s.unit)} ${resName(id)}${q != null ? ' Q' + q : ''}${loc ? ' → ' + loc : ''}`);
      setComm('EINGEBUCHT · ' + fmtAmt(a, s.unit).toUpperCase() + ' ' + resName(id).toUpperCase());
      toast('Eingebucht: ' + fmtAmt(a, s.unit) + ' ' + resName(id));
      closeModal(); save(); render();
    };
    if (presetMat) setMat(presetMat); else setTimeout(() => mat.focus(), 60);
    upd();
  });
}

/* ------------------------------------------------------------------ */
/* BLUEPRINTS                                                           */
/* ------------------------------------------------------------------ */
function mBlueprints() {
  if (typeof renderCatalog === 'function') return renderCatalog($('#m-view'));
  const ui = S.ui; const inPlan = new Set(S.plans.flatMap(p => p.items.filter(i => i.bp).map(i => i.bp)));
  const types = [...new Set(R.blueprints.map(b => b.type_de).filter(Boolean))].sort();
  let list = R.blueprints;
  if (ui.bpFilter === 'own') list = list.filter(b => isOwned(b.id));
  if (ui.bpFilter === 'plan') list = list.filter(b => inPlan.has(b.id));
  if (ui.bpFilter === 'miss') list = list.filter(b => !isOwned(b.id));
  if (ui.bpType) list = list.filter(b => b.type_de === ui.bpType);
  if (ui.bpSearch) { const w = ui.bpSearch.toLowerCase().split(/\s+/).filter(Boolean); list = list.filter(b => { const x = ((b.name || '') + ' ' + (b.maker || '') + ' s' + (b.size || '')).toLowerCase(); return w.every(y => x.includes(y)); }); }
  const shown = list.slice(0, 120), owned = Object.keys(S.owned).length;
  let h = `<div class="msearch"><input id="mb-q" type="search" placeholder="⌕ z. B. quadracell" value="${esc(ui.bpSearch)}">
    <select id="mb-t"><option value="">Alle Typen</option>${types.map(t => `<option ${t === ui.bpType ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
    <div class="mchips">${[['all', 'Alle'], ['own', 'Hab ich ' + owned], ['plan', 'In Plänen ' + inPlan.size], ['miss', 'Fehlen']].map(([k, l]) => `<span class="mchip ${ui.bpFilter === k ? 'on' : ''}" data-bf="${k}">${l}</span>`).join('')}</div>`;
  h += '<div class="mcols">' + shown.map(b => `<div class="mit" data-bp="${b.id}"><div class="tx"><b>${esc(b.name)}</b><small>${esc(b.type_de || '')}${b.size ? ' · S' + b.size : ''}${b.maker ? ' · ' + esc(b.maker) : ''}${inPlan.has(b.id) ? ' · <span class="warn">im Plan</span>' : ''}</small></div>
    <span class="v ${isOwned(b.id) ? '' : 'd'}">${isOwned(b.id) ? '✓' : 'fehlt'}</span></div>`).join('') + '</div>';
  if (list.length > shown.length) h += `<div class="hint">${list.length - shown.length} weitere – Suche eingrenzen.</div>`;
  if (!list.length) h += '<div class="empty">Nichts gefunden.</div>';
  h += `<div class="hint">${owned} von ${R.blueprints.length} Blueprints · Patch ${esc(R.patch || '?')}</div>`;
  const el = $('#m-view'); el.innerHTML = h;
  const q = $('#mb-q', el);
  q.oninput = () => { S.ui.bpSearch = q.value; clearTimeout(q.t); q.t = setTimeout(() => { render(); const n = $('#mb-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 300); };
  $('#mb-t', el).onchange = e => { S.ui.bpType = e.target.value; render(); };
  $$('[data-bf]', el).forEach(c => c.onclick = () => { S.ui.bpFilter = c.dataset.bf; render(); });
  $$('[data-bp]', el).forEach(r => r.onclick = () => openBpDetail(r.dataset.bp));
}

/* ------------------------------------------------------------------ */
/* MEHR + Unterseiten                                                   */
/* ------------------------------------------------------------------ */
const THEMES = [['wc3v', 'WC III · Victory'], ['wc4l', 'WC IV · Lexington'], ['wc4i', 'WC IV · Intrepid'], ['wc5m', 'Prophecy · Midway'], ['scfab', 'SC · Item Fabricator'], ['sccargo', 'SC · Freight Elevator'], ['scholo', 'SC · Holo']];
function mMehr() {
  const last = S.syncLog[0];
  const th = (THEMES.find(t => t[0] === (S.settings.theme || '').replace(/-alt$/, '')) || THEMES[0])[1];
  const el = $('#m-view');
  el.innerHTML = `<div class="mhd"><h3>Mehr</h3></div><div class="mmenu">
    <div class="mbtn" data-go="db"><s>◈</s>Datenbank<small>Fundorte · Raffinerien · Missionen</small></div>
    <div class="mbtn" data-go="bp"><s>◈</s>Blueprints<small>${Object.keys(S.owned).length} von ${R.blueprints.length}</small></div>
    <div class="mbtn" data-go="orte"><s>⌂</s>Home &amp; Favoriten<small>${esc(S.settings.home || 'Home festlegen')}</small></div>
    <div class="mbtn" data-go="log"><s>⟳</s>Log-Sync<small>${last ? 'zuletzt ' + fmtTime(last.ts) : 'noch nie'}</small></div>
    <div class="mbtn" data-go="hist"><s>⌚</s>Historie</div>
    <div class="mbtn" data-go="ansicht"><s>🔲</s>Lager-Ansicht<small>Kisten im Freight Elevator</small></div>
    <div class="mbtn" data-go="scan"><s>📷</s>Erfassung<small>${erfOffen() ? erfOffen() + ' Kisten prüfen' : 'Kisten aus dem Spiel'}</small></div>
    <div class="mbtn" data-go="calc"><s>⚖</s>SCU-Rechner</div>
    <div class="mbtn" data-go="opt"><s>⚙</s>Einstellungen</div>
    <div class="mbtn" id="mm-theme"><s>◐</s>Design<small>${esc(th)}</small></div>
    <div class="mbtn" data-go="tour"><s>⌖</s>Tour planen<small>${[S.stour, S.tour].reduce((a, t) => a + (t ? t.stops.filter(s => !s.done).length : 0), 0) || 'keine'} Stopps offen</small></div>
    <div class="mbtn" data-go="ctr"><s>✉</s>Contracts<small>${S.contracts.filter(c => c.status !== 'erledigt').length} offen</small></div>
    <div class="mbtn" data-go="own"><s>✎</s>Eigene Daten<small>Preise · Raffinerie-Boni</small></div>
    <div class="mbtn" data-go="ships"><s>✈</s>Schiffe<small>${S.fleet.length} Schiffe</small></div>
    <div class="mbtn" data-go="move"><s>⇄</s>Umlagerung<small>${S.moves.filter(m => m.status !== 'erledigt').length} geplant</small></div>
    <div class="mbtn" data-go="help"><s>?</s>Hilfe<small>Rundgang · Demo-Modus</small></div>
    <div class="mbtn" id="mm-pc"><s>▭</s>PC-Ansicht<small>große Oberfläche</small></div>
  </div>
  <div class="hint">Tipp: Im Browser-Menü „Zum Startbildschirm hinzufügen“ – dann startet Pliskin wie eine App.</div>`;
  $$('[data-go]', el).forEach(b => b.onclick = () => mGo(b.dataset.go));
  $$('[data-soon]', el).forEach(b => b.onclick = () => toast('Kommt in Etappe 2'));
  $('#mm-theme', el).onclick = () => mSheet('Design', THEMES.map(([k, l]) => ({ label: (k === S.settings.theme ? '● ' : '') + l, cls: k === S.settings.theme ? 'pri' : '', fn: () => { S.settings.theme = k; applyTheme(); save(); render(); } })));
  $('#mm-pc', el).onclick = () => { try { localStorage.setItem('hysec-view', 'pc'); } catch (e) { /* egal */ } location.href = './'; };
}
function mHist() {
  $('#m-view').innerHTML = `<div class="mhd"><h3>Historie</h3></div>` +
    (S.history.slice(0, 200).map(x => `<div class="mit" style="cursor:default"><div class="tx"><small>${fmtTime(x.ts)}</small><span style="font-size:14px">${esc(x.text)}</span></div></div>`).join('') || '<div class="empty">Noch nichts passiert.</div>');
}
function mCalc() { const el = $('#m-view'); el.innerHTML = lagerCalc(); bindCalc(el); }
/* Log-Sync und Einstellungen: die PC-Seiten zeichnen in #log / #opt – hier in die Handy-Ansicht umgeleitet */
function mSub(id, fn) { const el = $('#m-view'); el.innerHTML = `<section id="${id}"></section>`; fn(); }

/* ------------------------------------------------------------------ */
/* Ablauf                                                               */
/* ------------------------------------------------------------------ */
window.MOBILE.render = () => {
  if (wide() && M.view === 'plan') { M.view = 'plans'; M.back = []; }   // quer: Plan steht rechts neben der Liste
  mHeader();
  const v = M.view;
  if (v === 'todo') mTodo();
  else if (v === 'plans') mPlans();
  else if (v === 'plan') mPlan();
  else if (v === 'lager') mLager();
  else if (v === 'bp') mBlueprints();
  else if (v === 'mehr') mMehr();
  else if (v === 'hist') mHist();
  else if (v === 'calc') mCalc();
  else if (v === 'ansicht') { const el = $('#m-view'); el.innerHTML = laHtml(); laBind(el); }
  else if (v === 'scan') { const el = $('#m-view'); el.innerHTML = erfHtml(); erfBind(el); }
  else if (v === 'log') mSub('log', renderLog);
  else if (v === 'opt') mSub('opt', renderOpt);
  else if (v === 'ctr') mSub('ctr', renderContracts);
  else if (v === 'tour') mSub('tour', renderTour);
  else if (v === 'ships') mSub('ships', renderShips);
  else if (v === 'db') mSub('db', renderDb);
  else if (v === 'orte') mSub('orte', renderOrte);
  else if (v === 'own') { S.ui.dbTab = 'own'; mSub('db', renderDb); }
  else if (v === 'help') mSub('help', renderHelp);
  else if (v === 'move') { const el = $('#m-view'); el.innerHTML = lagerMoves(); bindMoves(el); }
  mHeader();
  demoBanner();
};
/* Sichtbare Hoehe messen, damit die Tastenreihe nicht hinter der Browser-Leiste verschwindet */
function mFit() {
  const h = Math.round(window.visualViewport ? window.visualViewport.height : window.innerHeight);
  document.documentElement.style.setProperty('--apph', h + 'px');
}
mFit();
window.addEventListener('resize', mFit);
if (window.visualViewport) window.visualViewport.addEventListener('resize', mFit);

window.MOBILE.init = () => {
  $$('#m-keys .mkey').forEach(k => k.onclick = () => { if (k.dataset.v === '+') mQuickBook(); else mGo(k.dataset.v); });
  $('#m-back').onclick = mBack;
  setTimeout(() => { const k = $('#m-keys').getBoundingClientRect(); dbg('handy-masse', 'inner=' + innerHeight, 'vv=' + (window.visualViewport ? Math.round(visualViewport.height) : '-'), 'tasten-unten=' + Math.round(k.bottom), 'tablet=' + TAB); }, 800);
  $('#m-title').onclick = () => { if (M.back.length) mBack(); };
  // Zurueck-Taste am Handy: erst Fenster schliessen, dann eine Seite zurueck
  history.pushState({ pliskin: 1 }, '');
  window.addEventListener('popstate', () => {
    if ($('#modal').classList.contains('on')) closeModal();
    else if (M.back.length) mBack();
    else if (M.view !== 'todo') mGo('todo');
    else { history.back(); return; }
    history.pushState({ pliskin: 1 }, '');
  });
  // Antippen ausserhalb schliesst das Fenster (Handy hat kein mousedown-Gefuehl)
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  // Tablet drehen: Aufteilung neu zeichnen (nur wenn sich quer/hochkant aendert)
  let wasWide = wide();
  window.addEventListener('resize', () => { const w = wide(); if (w !== wasWide) { wasWide = w; if (w && M.view === 'plan') M.view = 'plans'; render(); } });
};
