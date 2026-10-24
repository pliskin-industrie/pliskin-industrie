/* Pliskin Industrie – Lager-Ansicht (Lager → 🔲 Lager-Ansicht, auch aus „Tour planen“)
   Der Bestand je Lagerort als Kisten im Freight Elevator (Größe in den Einstellungen, Maße aus den Spieldaten).
   Je Material ein kompakter Haufen (möglichst Quader), 2 Felder Abstand zum nächsten Haufen – wird es eng, 1 Feld,
   dann keiner, dann wird gestapelt; erst wenn nichts mehr geht, kommt ein weiterer Elevator daneben.
   Handmineables: je Sorte eigene Stor*All-Kisten: 1/8 (125 Steine), 8 volle = 1 SCU, dann 2 SCU, dann wieder 1/8.
   Geplante Umlagerungen: Quelle orange „soll nach …“, Ziel durchsichtig + blau „kommt von …“. Ziehen & Ablegen legt eine an.
   Listen: Material (echte SCU, Kisten je Größe, davon High Quality) und geplante Umlagerungen – antippen hebt hervor. */
const ELEVATOR = {   // InventoryContainer.FreightElevator_CargoGrid_* (Game2.dcb 4.10.2), 1 Feld = 1,25 m = 1 SCU
  small: { x: 6, y: 5, z: 4, name: 'Small (120 SCU)' }, medium: { x: 8, y: 7, z: 4, name: 'Medium (224 SCU)' },
  large: { x: 16, y: 14, z: 4, name: 'Large (896 SCU)' }, xl: { x: 20, y: 14, z: 4, name: 'XL (1.120 SCU)' },
  exterior: { x: 32, y: 20, z: 8, name: 'Außen-Elevator (5.120 SCU)' }
};
const LA_MAX_GRIDS = 40, LA_HL = '#2fbf55';
const LA = { ort: '', drag: null, hl: null };   // hl = {art:'mat', ware} | {art:'move', id}
const laElev = () => ELEVATOR[S.settings.elevator] || ELEVATOR.large;
const laDims = s => s < 1 ? [1, 1, 1] : (BOXG[s] || [1, 1, 1]);
const kisteTxt = s => s < 1 ? '⅛' : String(s);

// Lagerposten → Kisten [{mat, ware, s, inhalt (SCU), stk (Steine), q, stack, loc}]
function laKisten(st) {
  const r = kstRes(st.mat), out = [], base = { mat: st.mat, ware: resName(st.mat), q: st.q ?? null, stack: st.id, loc: st.loc || 'Ohne Lagerort' };
  if (r && r.hand && st.unit === 'Stk') {   // Handmineables nach Lony Pliskins Regel
    let n = Math.round(st.amount);
    const voll = Math.floor(n / 3000); for (let i = 0; i < voll; i++) { out.push({ ...base, s: 1, stk: 1000 }); out.push({ ...base, s: 2, stk: 2000 }); }
    n -= voll * 3000;
    if (n >= 1000) { out.push({ ...base, s: 1, stk: 1000 }); n -= 1000; if (n > 0) out.push({ ...base, s: 2, stk: n }); }
    else while (n > 0) { const k = Math.min(125, n); out.push({ ...base, s: 0.125, stk: k }); n -= k; }
    const je = r.hand.scu || 0.001; out.forEach(k => k.inhalt = k.stk * je);
    return out;
  }
  if (st.unit === 'Stk') return out;   // Ausrüstung/Teile: keine Fracht-Kisten
  let rest = st.amount;
  const boxes = st.boxes && Object.keys(st.boxes).length ? Object.entries(st.boxes).map(([s, n]) => [+s, n]).sort((a, b) => b[0] - a[0]) : null;
  if (boxes) for (const [s, n] of boxes) for (let i = 0; i < n; i++) { const v = Math.min(s, Math.max(0, rest)); out.push({ ...base, s: s < 1 ? 0.125 : s, inhalt: v }); rest -= v; }
  else {
    const rb = refineryBoxes(st.amount);
    for (const s of BOX_SIZES) for (let i = 0; i < (rb.boxes[s] || 0); i++) out.push({ ...base, s, inhalt: s });
    if (rb.partial > 1e-9) out.push({ ...base, s: 1, inhalt: rb.partial });
  }
  return out;
}

/* Packen: je Material ein Haufen in einem eigenen Rechteck (Abstand 2 → 1 → 0 Felder zu anderen Haufen),
   darin Boden zuerst, dann stapeln (nichts schwebt). Passt kein Rechteck mehr: einzeln in Lücken stapeln, sonst neuer Elevator. */
function laPacken(kisten) {
  const E = laElev(), grids = [];
  const neu = () => { const g = { x: E.x, y: E.y, z: E.z, occ: new Int16Array(E.x * E.y * E.z).fill(-1), boxes: [], reg: [] }; grids.push(g); return g; };
  const at = (g, x, y, z) => (z * g.y + y) * g.x + x;
  let id = 0, ueber = 0, zugross = 0;
  const frei = (g, x, y, z, w, l, h, R) => {
    if (x < R.x || y < R.y || x + w > R.x + R.w || y + l > R.y + R.l || x + w > g.x || y + l > g.y || z + h > g.z) return false;
    for (let a = 0; a < w; a++) for (let b = 0; b < l; b++) for (let c = 0; c < h; c++) if (g.occ[at(g, x + a, y + b, z + c)] >= 0) return false;
    if (z > 0) for (let a = 0; a < w; a++) for (let b = 0; b < l; b++) if (g.occ[at(g, x + a, y + b, z - 1)] < 0) return false;   // nichts schwebt
    return true;
  };
  const setze = (g, k, p) => {
    const i = ++id; for (let a = 0; a < p.w; a++) for (let b = 0; b < p.l; b++) for (let c = 0; c < p.h; c++) g.occ[at(g, p.x + a, p.y + b, p.z + c)] = i;
    g.boxes.push({ ...k, id: i, x: p.x, y: p.y, z: p.z, w: p.w, l: p.l, h: p.h, gi: grids.indexOf(g) });
  };
  const bester = (g, k, R) => {   // Boden zuerst, dann vorne/links
    const [d0, d1, d2] = laDims(k.s); let best = null;
    const xe = Math.min(g.x, R.x + R.w), ye = Math.min(g.y, R.y + R.l);
    for (const [w, l, h] of [[d0, d1, d2], [d1, d0, d2]])
      for (let z = 0; z + h <= g.z; z++) for (let y = R.y; y + l <= ye; y++) for (let x = R.x; x + w <= xe; x++)
        if (frei(g, x, y, z, w, l, h, R)) { const sc = z * 1e6 + y * 100 + x; if (!best || sc < best.sc) best = { sc, x, y, z, w, l, h }; }
    return best;
  };
  // ganzen Haufen in Rechteck R legen (erst bei Erfolg übernehmen)
  const haufen = (g, liste, R) => {
    const occ0 = g.occ.slice(), id0 = id, boxes0 = g.boxes.length;
    for (const k of liste) { const p = bester(g, k, R); if (!p) { g.occ = occ0; id = id0; g.boxes.length = boxes0; return false; } setze(g, k, p); }
    g.reg.push(R); return true;
  };
  const rechteckFrei = (g, R, gap) => {
    for (const Q of g.reg) if (R.x < Q.x + Q.w + gap && Q.x < R.x + R.w + gap && R.y < Q.y + Q.l + gap && Q.y < R.y + R.l + gap) return false;
    for (let a = 0; a < R.w; a++) for (let b = 0; b < R.l; b++) if (g.occ[at(g, R.x + a, R.y + b, 0)] >= 0) return false;
    return true;
  };
  const versuche = (g, liste, gap) => {
    const vol = liste.reduce((a, k) => { const d = laDims(k.s); return a + d[0] * d[1] * d[2]; }, 0);
    const mx = Math.max(...liste.map(k => Math.max(...laDims(k.s).slice(0, 2)))), mn = Math.max(...liste.map(k => Math.min(...laDims(k.s).slice(0, 2))));
    const groessen = [];
    for (let w = 1; w <= g.x; w++) for (let l = 1; l <= g.y; l++)
      if (w * l * g.z >= vol && Math.max(w, l) >= mx && Math.min(w, l) >= mn) groessen.push([w, l]);
    groessen.sort((a, b) => a[0] * a[1] - b[0] * b[1] || Math.abs(a[0] - a[1]) - Math.abs(b[0] - b[1]));
    for (const [w, l] of groessen.slice(0, 60))
      for (let y = 0; y + l <= g.y; y++) for (let x = 0; x + w <= g.x; x++) {
        const R = { x, y, w, l };
        if (rechteckFrei(g, R, gap) && haufen(g, liste, R)) return true;
      }
    return false;
  };
  const gruppen = new Map();
  for (const k of kisten) { if (!gruppen.has(k.ware)) gruppen.set(k.ware, []); gruppen.get(k.ware).push(k); }
  const liste = [...gruppen.entries()].map(([w, l]) => [w, l.filter(k => {
    const [d0, d1, d2] = laDims(k.s), ok = ((d0 <= E.x && d1 <= E.y) || (d1 <= E.x && d0 <= E.y)) && d2 <= E.z;
    if (!ok) zugross++; return ok;
  }).sort((a, b) => b.s - a.s || (b.q ?? 0) - (a.q ?? 0))]).filter(x => x[1].length)
    .sort((a, b) => b[1].reduce((s, k) => s + k.s, 0) - a[1].reduce((s, k) => s + k.s, 0));   // große Haufen zuerst
  neu();
  for (const [, ks] of liste) {
    let ok = false;
    for (const gap of [2, 1, 0]) { for (const gg of grids) if (versuche(gg, ks, gap)) { ok = true; break; } if (ok) break; }
    if (ok) continue;
    // eng: einzeln in Lücken der vorhandenen Elevators (stapeln), Rest in einen neuen Elevator
    const rest = [];
    for (const k of ks) { let p = null, gg = null; for (const x of grids) { p = bester(x, k, { x: 0, y: 0, w: x.x, l: x.y }); if (p) { gg = x; break; } } if (p) setze(gg, k, p); else rest.push(k); }
    if (rest.length) {
      if (grids.length >= LA_MAX_GRIDS) { ueber += rest.length; continue; }
      const g = neu();
      if (!versuche(g, rest, 0)) for (const k of rest) { const p = bester(g, k, { x: 0, y: 0, w: g.x, l: g.y }); if (p) setze(g, k, p); else ueber++; }
    }
  }
  return { grids: grids.filter(x => x.boxes.length), ueber, zugross };
}

// Geplante Umlagerungen: welche Kisten gehen weg (soll nach), welche kommen dazu (kommt von)
function laUmlagerungen() {
  const weg = new Map(), dazu = {}, liste = [];
  for (const m of S.moves.filter(x => x.status !== 'erledigt')) {
    const s = S.stacks.find(x => x.id === m.stack); if (!s) continue;
    (weg.get(s.id) || weg.set(s.id, []).get(s.id)).push({ amount: m.amount, to: m.to, id: m.id });
    (dazu[m.to || 'Ohne Lagerort'] = dazu[m.to || 'Ohne Lagerort'] || []).push({ ...s, amount: m.amount, von: s.loc || 'Ohne Lagerort', move: m.id });
    liste.push({ m, s });
  }
  return { weg, dazu, liste };
}

function laHtml() {
  const orte = [...new Set(S.stacks.map(s => s.loc || 'Ohne Lagerort'))].sort();
  const E = laElev(), z = S.ui.laZoom || 1;
  return `<div class="win tight" id="la"><span class="pill">🔲 Lager-Ansicht</span><span class="sub">Freight Elevator ${esc(E.name)} · Kisten wie im Spiel</span>
    <div class="row2" style="margin:8px 0;flex-wrap:wrap;gap:6px">
      <div class="chips2" style="flex:1"><span class="${LA.ort ? '' : 'on'}" data-lao="">Alle Orte</span>${orte.map(o => `<span class="${LA.ort === o ? 'on' : ''}" data-lao="${esc(o)}">${esc(o)}</span>`).join('')}</div>
      <label class="dim" style="font:12px var(--vdu)">Elevator <select id="la-el">${Object.entries(ELEVATOR).map(([k, v]) => `<option value="${k}" ${laElev() === v ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label></div>
    <div class="row2 la-steuer"><button class="k sm" data-laz="-1" title="kleiner">−</button><span class="dim">${Math.round(z * 100)} %</span><button class="k sm" data-laz="1" title="größer">+</button>
      <button class="k sm" data-lar="-1" title="drehen">⟲</button><button class="k sm" data-lar="1" title="drehen">⟳</button>
      <label class="dim">Ebenen <input type="range" id="la-lay" min="1" max="${E.z}" value="${Math.min(E.z, S.ui.laLayer || E.z)}" style="width:110px"> <b id="la-layw">${Math.min(E.z, S.ui.laLayer || E.z)}</b>/${E.z}</label>
      ${LA.hl ? '<button class="k sm" id="la-hlx">Markierung aufheben</button>' : ''}</div>
    <div class="hint" style="margin-top:4px">Über eine Kiste fahren = Material, Qualität, Menge · antippen = Material markieren · <b>auf einen anderen Ort ziehen</b> = Umlagerung planen.
      <span style="color:#ffae42">■</span> soll umgelagert werden · <span style="color:#5fd8ff">■</span> kommt dazu (durchsichtig) · <span style="color:${LA_HL}">■</span> markiert.</div>
    <div id="la-listen"></div><div id="la-orte"></div></div>`;
}
// Liste je Material: echte SCU, Kisten je Größe, davon High Quality (Einstellung „High Quality ab“)
function laMatListe(ks) {
  const hq = S.settings.goldQ || 900, M = new Map();
  for (const k of ks.filter(k => !k.geist)) {
    const m = M.get(k.ware) || M.set(k.ware, { mat: k.mat, scu: 0, stk: 0, n: {}, hqScu: 0, hqN: {} }).get(k.ware);
    m.scu += k.inhalt || 0; if (k.stk != null) m.stk += k.stk; m.n[k.s] = (m.n[k.s] || 0) + 1;
    if ((k.q ?? 0) >= hq) { m.hqScu += k.inhalt || 0; m.hqN[k.s] = (m.hqN[k.s] || 0) + 1; }
  }
  const kn = n => Object.entries(n).sort((a, b) => b[0] - a[0]).map(([s, c]) => `${c}× ${kisteTxt(+s)}`).join(' · ');
  if (!M.size) return '';
  return `<div class="scroll"><table class="ptab la-tab"><tr><th class="l">Material</th><th>Menge (echt)</th><th class="l">in Kisten (SCU)</th><th class="l">davon High Quality (ab Q${hq})</th></tr>
    ${[...M.entries()].sort((a, b) => b[1].scu - a[1].scu).map(([w, m]) => `<tr class="la-zeile ${LA.hl && LA.hl.art === 'mat' && LA.hl.ware === w ? 'on' : ''}" data-lhm="${esc(w)}">
      <td class="name">${matSym(m.mat)}${esc(w)}</td><td>${fmtAmt(m.scu, 'SCU')}${m.stk ? ` <span class="dim">(${N(m.stk)} Steine)</span>` : ''}</td><td class="l">${kn(m.n)}</td>
      <td class="l">${m.hqScu > 0 ? `<b class="ok">${fmtAmt(m.hqScu, 'SCU')}</b> in ${kn(m.hqN)}` : '<span class="dim">–</span>'}</td></tr>`).join('')}</table></div>`;
}
function laMoveListe(U) {
  const L = U.liste.filter(({ m, s }) => !LA.ort || (s.loc || 'Ohne Lagerort') === LA.ort || (m.to || 'Ohne Lagerort') === LA.ort);
  if (!L.length) return '';
  return `<div class="scroll"><table class="ptab la-tab"><tr><th class="l">Geplante Umlagerung</th><th class="l">von → nach</th><th>Menge</th><th class="l">Kisten</th></tr>
    ${L.map(({ m, s }) => { const ks = laKisten({ ...s, amount: m.amount }), n = {}; ks.forEach(k => n[k.s] = (n[k.s] || 0) + 1);
      return `<tr class="la-zeile ${LA.hl && LA.hl.art === 'move' && LA.hl.id === m.id ? 'on' : ''}" data-lhv="${m.id}"><td class="name">${matSym(s.mat)}${esc(resName(s.mat))}${s.q != null ? ' <span class="dim">Q' + s.q + '</span>' : ''}</td>
      <td class="l">${esc(s.loc || 'Ohne Lagerort')} → <b>${esc(m.to || 'Ohne Lagerort')}</b></td><td>${s.unit === 'Stk' ? N(m.amount) + ' Stk' : fmtAmt(m.amount, 'SCU')}</td>
      <td class="l">${Object.entries(n).sort((a, b) => b[0] - a[0]).map(([k, c]) => `${c}× ${kisteTxt(+k)}`).join(' · ')}</td></tr>`; }).join('')}</table></div>`;
}
function laZeichnen(root) {
  const box = $('#la-orte', root); if (!box) return;
  const U = laUmlagerungen(), E = laElev();
  const alle = [...new Set([...S.stacks.map(s => s.loc || 'Ohne Lagerort'), ...Object.keys(U.dazu)])].sort().filter(o => !LA.ort || o === LA.ort);
  let h = ''; const daten = {}, alleKisten = [];
  for (const ort of alle) {
    const ks = S.stacks.filter(s => (s.loc || 'Ohne Lagerort') === ort).flatMap(laKisten);
    for (const [sid, ms] of U.weg) { let rest = ms.reduce((a, m) => a + m.amount, 0); const to = ms.map(m => m.to).join(', '), mid = ms.map(m => m.id);
      for (const k of ks.filter(k => k.stack === sid)) { if (rest <= 1e-9) break; k.sollNach = to; k.moves = mid; rest -= (k.stk != null ? k.stk : k.inhalt); } }
    for (const d of (U.dazu[ort] || [])) laKisten(d).forEach(k => ks.push({ ...k, kommtVon: d.von, geist: true, moves: [d.move] }));
    if (!ks.length) continue;
    alleKisten.push(...ks);
    const P = laPacken(ks); daten[ort] = P;
    const scu = ks.filter(k => !k.geist).reduce((a, k) => a + (k.inhalt || 0), 0);
    h += `<div class="la-ort" data-ort="${esc(ort)}"><div class="la-kopf"><b>${esc(ort)}</b> <span class="dim">· ${F(scu, 3)} SCU · ${ks.filter(k => !k.geist).length} Kisten · ${P.grids.length} ${P.grids.length === 1 ? 'Elevator' : 'Elevators'}</span>
      ${P.ueber ? `<span class="warn"> · ${P.ueber} Kisten passen nicht mehr (Grenze ${LA_MAX_GRIDS} Elevators)</span>` : ''}${P.zugross ? `<span class="warn"> · ${P.zugross} ${P.zugross === 1 ? 'Kiste ist' : 'Kisten sind'} zu groß für diesen Elevator</span>` : ''}</div>
      <div class="la-grids">${P.grids.map((g, i) => `<canvas data-la="${esc(ort)}|${i}"></canvas>`).join('')}</div></div>`;
  }
  const lb = $('#la-listen', root);
  if (lb) lb.innerHTML = laMatListe(alleKisten) + laMoveListe(U);
  box.innerHTML = h || '<div class="empty">Keine Fracht im Lager (Ausrüstung in Stück wird hier nicht gezeigt).</div>';
  const fmtK = k => k.stk != null ? `${N(k.stk)} Steine (${F(k.inhalt, 3)} SCU)` : fmtAmt(k.inhalt, 'SCU');
  const markiert = b => !!LA.hl && (LA.hl.art === 'mat' ? b.ware === LA.hl.ware : (b.moves || []).includes(LA.hl.id));
  $$('canvas[data-la]', box).forEach(cv => {
    const [ort, gi] = cv.dataset.la.split('|'), g = daten[ort].grids[+gi];
    drawIso(cv, g, g.boxes, {
      badge: false, tuer: false, zoom: S.ui.laZoom || 1, rot: S.ui.laRot || 0, layer: Math.min(E.z, S.ui.laLayer || E.z),
      isHl: LA.hl ? markiert : null,
      auraOf: b => LA.hl ? (markiert(b) ? LA_HL : null) : (b.geist ? '#5fd8ff' : b.sollNach ? '#ffae42' : null),
      alphaOf: b => b.geist ? .45 : 1,
      tip: b => `<b>${esc(b.ware)}</b>${b.q != null ? ' · Q ' + b.q : ''}<br>Kiste ${kisteTxt(b.s)} SCU · Inhalt ${fmtK(b)}<br>${esc(b.loc)}${b.sollNach ? `<br><span style="color:#ffae42">soll nach ${esc(b.sollNach)}</span>` : ''}${b.kommtVon ? `<br><span style="color:#5fd8ff">kommt von ${esc(b.kommtVon)}</span>` : ''}`
    });
    // Antippen = Material markieren, Ziehen auf einen anderen Ort = Umlagerung planen
    cv.onpointerdown = e => {
      const b = cv._pick && cv._pick(e); if (!b) return;
      e.preventDefault(); LA.drag = { b, von: ort }; let bewegt = false;
      const gh = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'la-drag', textContent: `${b.ware} · ${fmtK(b)} → …` }));
      gh.style.display = 'none';
      const mv = ev => { if (Math.abs(ev.clientX - e.clientX) + Math.abs(ev.clientY - e.clientY) > 6) bewegt = true; if (!bewegt || b.geist) return;
        gh.style.display = 'block'; gh.style.left = ev.clientX + 12 + 'px'; gh.style.top = ev.clientY + 12 + 'px';
        const z = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.la-ort');
        $$('.la-ort', box).forEach(o => o.classList.toggle('la-ziel', o === z && z.dataset.ort !== ort)); };
      const up = async ev => {
        window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); gh.remove();
        $$('.la-ort', box).forEach(o => o.classList.remove('la-ziel')); LA.drag = null;
        if (!bewegt) { LA.hl = !(LA.hl && LA.hl.art === 'mat' && LA.hl.ware === b.ware) ? { art: 'mat', ware: b.ware } : null; render(); return; }
        if (b.geist) return;
        const z = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.la-ort,[data-lao]');
        const ziel = z && (z.dataset.ort || z.dataset.lao); if (!ziel || ziel === ort) return;
        await laUmlagern(b, ziel);
      };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    };
  });
}
async function laUmlagern(b, ziel) {
  const s = S.stacks.find(x => x.id === b.stack); if (!s) return;
  const menge = b.stk != null ? b.stk : Math.min(s.amount, b.inhalt);
  if (!await ask(`Umlagerung planen: <b>${esc(b.ware)}</b> ${b.stk != null ? menge + ' Steine' : fmtAmt(menge, 'SCU')}${b.q != null ? ' Q' + b.q : ''}<br>${esc(s.loc || 'Ohne Lagerort')} → <b>${esc(ziel)}</b>`, 'Planen')) return;
  S.moves.push({ id: uid(), stack: s.id, amount: menge, to: ziel === 'Ohne Lagerort' ? '' : ziel, status: 'tour', ts: now() });
  hist(`Umlagerung geplant (Lager-Ansicht): ${b.stk != null ? menge + ' Stk' : F(menge, 3) + ' SCU'} ${resName(s.mat)} ${s.loc || ''} → ${ziel}`);
  save(); toast('Umlagerung geplant – steht in Tour planen'); render();
}
function laBind(root) {
  $$('[data-lao]', root).forEach(c => c.onclick = () => { LA.ort = c.dataset.lao; render(); });
  const el = $('#la-el', root); if (el) el.onchange = () => { S.settings.elevator = el.value; save(); render(); };
  $$('[data-laz]', root).forEach(b => b.onclick = () => { S.ui.laZoom = Math.max(.5, Math.min(4, +((S.ui.laZoom || 1) * (+b.dataset.laz > 0 ? 1.25 : .8)).toFixed(2))); save(); render(); });
  $$('[data-lar]', root).forEach(b => b.onclick = () => { S.ui.laRot = ((S.ui.laRot || 0) + +b.dataset.lar + 4) % 4; save(); render(); });
  const ly = $('#la-lay', root); if (ly) ly.oninput = () => { S.ui.laLayer = +ly.value; $('#la-layw', root).textContent = ly.value; laZeichnen(root); };
  const hx = $('#la-hlx', root); if (hx) hx.onclick = () => { LA.hl = null; render(); };
  laZeichnen(root);
  $$('[data-lhm]', root).forEach(r => r.onclick = () => { LA.hl = LA.hl && LA.hl.art === 'mat' && LA.hl.ware === r.dataset.lhm ? null : { art: 'mat', ware: r.dataset.lhm }; render(); });
  $$('[data-lhv]', root).forEach(r => r.onclick = () => { LA.hl = LA.hl && LA.hl.art === 'move' && LA.hl.id === r.dataset.lhv ? null : { art: 'move', id: r.dataset.lhv }; render(); });
}
