/* Pliskin Industrie – Erfassung (Lager → 📷 Erfassung, Handy: Mehr → Erfassung)
   Im Programm auf dem Spiele-PC: Maus über eine Kiste (Inventar / Freight Manager), Tastenkürzel (Standard Pause)
   → das Programm schneidet den Tooltip aus und legt ihn mit dem Ort aus dem Game.log in die Erfassungsliste (Server).
   Hier: Erkennung (erkennung.js), Liste zum Prüfen/Ändern, „Passt – einlagern“. Jeder Tastendruck = eine Kiste.
   Bestätigte Werte werden Lernmuster für die Ziffern-Erkennung. */
const ERF = { d: { stand: -1, items: [] }, T: null, busy: false, key: null, timer: null, pc: false };
const erfOk = () => MODE === 'server';
const erfOffen = () => (ERF.d.items || []).length;

async function erfMuster() {
  if (ERF.T) return ERF.T;
  const base = await fetch('data/ziffern.json').then(r => r.json()).catch(() => ({ muster: [] }));
  let T = base.muster || [];
  // mitgelieferte Lernmuster (Release) + eigene bestätigte Kisten (Server)
  try { const L = await fetch('data/lernen.json').then(r => r.ok ? r.json() : []); if (L.length) T = T.concat(await ERK.lerne(L.map(x => ({ src: 'data/lernen/' + x.name, q: x.q, a: x.a })))); } catch (e) { /* keine */ }
  try { const L = await call('erfassung_lernen'); if (L && L.length) T = T.concat(await ERK.lerne(L)); } catch (e) { /* ohne Lernmuster */ }
  try { ERF.namen = await fetch('data/erfnamen.json').then(r => r.ok ? r.json() : {}); } catch (e) { ERF.namen = {}; }
  return (ERF.T = T);
}
function erfOrt(code) {
  if (!code) return '';
  const o = (ORTE.orte || []).find(x => x.id === code);
  return o ? o.name : code.replace(/_/g, ' ');
}
function erfMaterialien() {
  const m = new Map();
  for (const r of Object.values(RES)) m.set((r.name || r.id), r.id);
  for (const c of U.commodities || []) if (!m.has(c.name)) m.set(c.name, 'uex:' + c.name);
  for (const w of ORTE.waren || []) if (!m.has(w.name)) m.set(w.name, 'uex:' + w.name);
  return m;
}
function erfMat(roh) {
  const m = erfMaterialien();
  // früher von dir korrigierte Lesarten zuerst (lernt mit: S.settings.erfNamen = {Lesart: Material})
  const gelernt = Object.assign({}, ERF.namen || {}, S.settings.erfNamen || {});
  for (const r of (Array.isArray(roh) ? roh : [roh])) { const k = (r || '').toLowerCase().trim(); if (gelernt[k] && m.has(gelernt[k])) return { id: m.get(gelernt[k]), name: gelernt[k] }; }
  const n = ERK.naechster(roh, [...m.keys()]);
  return n ? { id: m.get(n), name: n } : null;
}
const erfKiste = a => a == null || !(a > 0) ? null : a < 1 ? 1 : ERK.KISTEN.includes(a) ? a : null;

// Stand vom Server holen (alle 4 s, nur wenn sich etwas geändert hat) und neue Kisten erkennen
async function erfLaden(force) {
  if (!erfOk()) return;
  let st; try { st = await call('erfassung_stand'); } catch (e) { return; }
  if (st && st.pc !== ERF.pc) { ERF.pc = !!st.pc; $$('.erfpc').forEach(x => { x.className = 'erfpc ' + (ERF.pc ? 'ok' : 'dim'); x.textContent = erfPcText(); }); }
  if (!st || (!force && st.stand === ERF.d.stand)) return;
  const vorher = erfOffen();
  ERF.d = await call('erfassung_liste');
  if (erfOffen() > vorher && !force) toast(`📷 Kiste erfasst – ${erfOffen()} in der Erfassung`);
  erfZeichnen();
  erfVerarbeiten();
}
async function erfVerarbeiten() {
  if (ERF.busy) return; ERF.busy = true;
  try {
    const T = await erfMuster();
    for (const it of ERF.d.items) {
      if (it.res || !it.img) continue;
      let res;
      if (/^traktor-/.test(it.name || it.id)) {   // Kiste im Traktorstrahl: Material + Ø-Qualität + Gewicht → Kistengröße
        try {
          const r = await ERK.traktorLesen(it.img), mat = erfMat(r.mats.length ? r.mats : [r.mat]);
          const masse = mat && (kstRes(mat.id) || {}).masse, k = ERK.kisteAusGewicht(r.t, masse);
          res = { art: 'traktor', matRoh: r.mat || r.roh, rohs: r.mats, mat: mat ? mat.id : '', matErkannt: mat ? mat.name : '', matName: mat ? mat.name : r.mat, q: r.q, amt: k, loc: erfOrt(it.loc),
            hinweis: k ? `Traktorstrahl: ${F(r.t, 1)} t = volle ${k}-SCU-Kiste (Menge angenommen, angebrochene Kisten bitte anpassen)` : `Traktorstrahl: Gewicht ${r.t != null ? F(r.t, 1) + ' t' : 'nicht gelesen'} – Kistengröße bitte eintragen`,
            unsicher: { mat: !mat, q: !r.qSicher, amt: !k } };
        } catch (e) { res = { art: 'traktor', fehler: e.message, loc: erfOrt(it.loc) }; }
        it.res = res; call('erfassung_setzen', it.id, res); erfZeichnen(); continue;
      }
      if (erfIstBp(it)) {   // Blueprint-Tooltip aus dem Fabricator
        try {
          const roh = await ERK.bpLesen(it.img), b = ERK.bpFinden(roh, R.blueprints || []);
          res = { art: 'bp', roh, bp: b ? b.id : '', bpName: b ? b.name : roh, unsicher: { bp: !b } };
        } catch (e) { res = { art: 'bp', fehler: e.message, bp: '', bpName: '' }; }
        it.res = res; call('erfassung_setzen', it.id, res); erfZeichnen(); continue;
      }
      try {
        const r = await ERK.erkenne(it.img, T);
        if (!r.ok) res = { fehler: r.error, loc: erfOrt(it.loc) };
        else {
          let roh = '', at = null, hinweis = '';
          let roh2 = '';
          let qt = null;
          try { roh = await ERK.nameLesen(r.nameBild); if (r.titelBild) roh2 = await ERK.nameLesen(r.titelBild); at = await ERK.mengeLesen(r.mengeBild); qt = await ERK.qLesen(r.qBild); } catch (e) { hinweis = e.message; }
          if (r.q == null && qt != null && qt <= 1000) r.q = qt;
          const m = ERK.mengeKombi(r.amt, at), mat = erfMat([roh2, roh]);
          const rohs = [roh2, roh];
          if (roh2) roh = roh2 + ' / ' + roh;
          res = { matRoh: roh, rohs, mat: mat ? mat.id : '', matErkannt: mat ? mat.name : '', matName: mat ? mat.name : roh, q: r.q, amt: m.v, loc: erfOrt(it.loc), hinweis,
            unsicher: { q: r.q == null || (qt != null && qt !== r.q), amt: !m.sicher, mat: !mat } };   // gelb, wenn die zwei Lesarten nicht übereinstimmen
        }
      } catch (e) { res = { fehler: e.message, loc: erfOrt(it.loc) }; }
      it.res = res;
      call('erfassung_setzen', it.id, res);
      erfZeichnen();
    }
  } finally { ERF.busy = false; }
}
// nur neu zeichnen, wenn die Liste sichtbar ist und gerade nichts darin bearbeitet wird
function erfZeichnen() {
  const el = $('#erf');
  if (el && !el.contains(document.activeElement)) { el.outerHTML = erfHtml(); erfBind($('#erf').parentElement); }
  const k = document.querySelector('[data-lt="scan"]'); if (k) k.textContent = '📷 Erfassung' + (erfOffen() ? ' · ' + erfOffen() : '');
}

const erfIstBp = it => /^bp-/.test(it.name || it.id || '');
function bpChoices(q) {
  q = q.toLowerCase();
  return (R.blueprints || []).filter(b => !q || b.name.toLowerCase().includes(q)).slice(0, 40).map(b => ({ label: b.name, value: b.id, hint: isOwned(b.id) ? '✓ hab ich schon' : (b.type_de || b.type || '') }));
}
function erfBpZeile(it, img, zeit) {
  const r = it.res, u = r.unsicher || {}, schon = r.bp && isOwned(r.bp);
  return `<div class="erfrow bp ${r.fehler ? 'bad' : ''}" data-id="${esc(it.id)}">
    <div class="erfimg">${img}</div>
    <div class="erff bpn"><label>Blueprint</label><span><input data-f="bp" class="${u.bp ? 'unsicher' : ''}" value="${esc(r.bpName || '')}" placeholder="${esc(r.roh ? '„' + r.roh + '“?' : 'Blueprint-Name')}"></span></div>
    <div class="erff k"><label>Status</label><b class="${schon ? '' : r.bp ? 'ok' : 'warn'}">${schon ? '✓ hab ich schon' : r.bp ? '→ wird „hab ich“' : '?'}</b></div>
    <div class="erfx"><span class="dim erfzeit">${zeit}</span><button class="k sm x" data-weg="${esc(it.id)}" title="Verwerfen">✕</button></div>
    ${r.fehler ? `<div class="erfhint bad">${esc(r.fehler)}</div>` : ''}</div>`;
}
function erfZeile(it) {
  const r = it.res;
  const img = it.img ? `<img src="${it.img}" alt="" title="Drüberfahren/Antippen = groß">` : '<span class="dim">kein Bild</span>';
  const zeit = new Date(it.ts * 1000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  if (!r) return `<div class="erfrow" data-id="${esc(it.id)}"><div class="erfimg">${img}</div><div class="dim">wird gelesen …</div><span class="dim erfzeit">${zeit}</span></div>`;
  if (r.art === 'bp') return erfBpZeile(it, img, zeit);
  const u = r.unsicher || {}, k = erfKiste(r.amt);
  return `<div class="erfrow ${r.fehler ? 'bad' : ''}" data-id="${esc(it.id)}">
    <div class="erfimg">${img}</div>
    <div class="erff"><label>Material</label><span><input data-f="mat" class="${u.mat ? 'unsicher' : ''}" value="${esc(r.matName || '')}" data-value="${esc(r.mat || '')}" placeholder="${esc(r.matRoh ? '„' + r.matRoh + '“?' : 'Material')}"></span></div>
    <div class="erff q"><label>Qualität</label><input data-f="q" type="number" min="0" max="1000" class="${u.q ? 'unsicher' : ''}" value="${r.q ?? ''}"></div>
    <div class="erff a"><label>Menge SCU</label><input data-f="amt" inputmode="decimal" class="${u.amt ? 'unsicher' : ''}" value="${r.amt ?? ''}"></div>
    <div class="erff k"><label>Kiste</label><b class="${k ? '' : 'warn'}">${k ? k + ' SCU' + (r.amt < 1 ? ' · angebrochen' : '') : '?'}</b></div>
    <div class="erff o"><label>Ort</label><span><input data-f="loc" value="${esc(r.loc || '')}" placeholder="Lagerort"></span></div>
    <div class="erfx"><span class="dim erfzeit">${zeit}</span><button class="k sm x" data-weg="${esc(it.id)}" title="Diese Kiste verwerfen">✕</button></div>
    ${r.fehler ? `<div class="erfhint bad">${esc(r.fehler)} – Werte bitte selbst eintragen oder verwerfen.</div>` : r.hinweis ? `<div class="erfhint warn">${esc(r.hinweis)}</div>` : ''}
  </div>`;
}
function erfHtml() {
  const items = ERF.d.items || [], key = (ERF.key && ERF.key.hotkey) || 'Pause';
  const scu = items.reduce((a, it) => a + (it.res && it.res.amt > 0 ? +it.res.amt : 0), 0);
  const nBp = items.filter(erfIstBp).length, nK = items.length - nBp;
  const unsicher = items.filter(it => it.res && (it.res.fehler || Object.values(it.res.unsicher || {}).some(Boolean))).length;
  const head = `<span class="pill">📷 Erfassung</span><span class="sub">${nK} ${nK === 1 ? 'Kiste' : 'Kisten'} · ${F(scu, 3)} SCU${nBp ? ` · ${nBp} Blueprint${nBp === 1 ? '' : 's'}` : ''}${unsicher ? ` · <span class="warn">${unsicher} prüfen</span>` : ''}</span>`;
  if (!erfOk()) return `<div id="erf" class="win tight">${head}<div class="hint">Die Erfassung braucht den Pliskin-Server (Pi oder fertiges Programm).</div></div>`;
  const fern = `<div class="row2" style="margin:6px 0"><button class="k sm pri" id="erf-fern">📷 Jetzt am PC erfassen</button><span class="erfpc ${ERF.pc ? 'ok' : 'dim'}" style="font:12px var(--vdu)">${erfPcText()}</span><span class="dim" id="erf-fernw" style="font:12px var(--vdu)"></span></div>`;
  const how = fern + `<div class="hint">So geht's: Im Spiel Inventar oder Freight Manager öffnen, Maus über eine Kiste halten (Tooltip sichtbar) und <b>${esc(key)}</b> drücken – jeder Druck = eine Kiste.
    Hoher Ton = erfasst, tiefer Ton = kein Tooltip gefunden.
    <b>Traktorstrahl:</b> Kiste mit dem Multi-Tool festhalten (Anzeige „100.0% TITANIUM [AVG 295Q]“ + Gewicht) und Taste drücken – die Kistengröße kommt aus dem Gewicht.
    <b>Blueprints:</b> im Fabrication Kiosk mit der Maus über einen Blueprint fahren (Name erscheint) und dieselbe Taste drücken → wird hier als „hab ich“ vorgeschlagen. Hier prüfen, dann „Passt – einlagern“. ${ERF.key ? '' : '<br>Die Taste gibt es im Programm (Pliskin Industrie.exe) auf dem Spiele-PC.'}
    <span class="unsicher" style="padding:0 4px">gelb</span> = bitte kurz prüfen.<br>
    <b>Wichtig:</b> Läuft Star Citizen (bzw. der RSI-Launcher) als Administrator, kommt die Taste im Spiel nur an, wenn Pliskin auch als Administrator läuft
    (Einstellungen → Programm → „Als Administrator neu starten“). Alternativ vom Handy auslösen: „+“ → 📷 Kiste am PC erfassen.</div>`;
  if (!items.length) return `<div id="erf" class="win tight">${head}${how}<div class="empty">Noch nichts erfasst.</div></div>`;
  return `<div id="erf" class="win tight">${head}${how}
    <div class="row2" style="margin:8px 0"><span class="dim" style="font:12px var(--vdu)">Ort für alle:</span><span><input id="erf-ort" placeholder="Lagerort" style="width:240px"></span><button class="k sm" id="erf-ort-go">Übernehmen</button></div>
    <div class="erflist">${items.slice().reverse().map(erfZeile).join('')}</div>
    <div class="foot" style="margin-top:10px"><button class="k x" id="erf-alle-weg">Alle verwerfen</button>${APP && APP.edition === 'release' ? '' : '<button class="k" id="erf-lern" title="Korrigierte Werte als Lernmuster übernehmen, aber nichts ins Lager buchen (nur private Ausgabe – Gelerntes kommt mit ins Release)">Nur lernen</button>'}<button class="k pri" id="erf-go">Passt – ${[nK ? nK + ' ' + (nK === 1 ? 'Kiste' : 'Kisten') + ' einlagern' : '', nBp ? nBp + ' Blueprint' + (nBp === 1 ? '' : 's') + ' übernehmen' : ''].filter(Boolean).join(' + ')}</button></div></div>`;
}
function erfBind(root) {
  const el = $('#erf', root) || $('#erf'); if (!el) return;
  const item = n => ERF.d.items.find(x => x.id === n.closest('.erfrow').dataset.id);
  const setz = (it, f, v) => { it.res = it.res || {}; it.res[f] = v; if (it.res.unsicher) it.res.unsicher[f] = false; call('erfassung_setzen', it.id, it.res); };
  $$('.erfrow input[data-f="mat"]', el).forEach(i => attachAC(i, materialChoices, p => { const it = item(i); setz(it, 'mat', p.value); it.res.matName = p.label; i.classList.remove('unsicher'); }));
  $$('.erfrow input[data-f="loc"]', el).forEach(i => attachAC(i, locationChoices, p => setz(item(i), 'loc', p.label)));
  $$('.erfrow input[data-f="bp"]', el).forEach(i => attachAC(i, bpChoices, p => { const it = item(i); setz(it, 'bp', p.value); it.res.bpName = p.label; i.classList.remove('unsicher'); erfZeichnenSofort(); }));
  $$('.erfrow input', el).forEach(i => i.onchange = () => {
    const it = item(i), f = i.dataset.f;
    if (f === 'bp') { const b = ERK.bpFinden(i.value, R.blueprints || []); setz(it, 'bp', b ? b.id : ''); it.res.bpName = b ? b.name : i.value.trim(); if (!b) { i.classList.add('unsicher'); return; } }
    else if (f === 'mat') { const m = erfMat(i.value) || { id: i.dataset.value || ('uex:' + i.value.trim()), name: i.value.trim() }; setz(it, 'mat', m.id); it.res.matName = m.name; }
    else if (f === 'q') setz(it, 'q', i.value === '' ? null : Math.max(0, Math.min(1000, Math.round(num(i.value)))));
    else if (f === 'amt') setz(it, 'amt', num(i.value) > 0 ? num(i.value) : null);
    else setz(it, 'loc', i.value.trim());
    i.classList.remove('unsicher');
    if (f === 'amt') { const r = i.closest('.erfrow'), k = erfKiste(it.res.amt); $('.erff.k b', r).textContent = k ? k + ' SCU' + (it.res.amt < 1 ? ' · angebrochen' : '') : '?'; }
  });
  const ort = $('#erf-ort', el); if (ort) attachAC(ort, locationChoices);
  const og = $('#erf-ort-go', el); if (og) og.onclick = () => {
    const v = ort.value.trim(); if (!v) { ort.focus(); return; }
    ERF.d.items.forEach(it => { if (it.res) { it.res.loc = v; call('erfassung_setzen', it.id, it.res); } });
    el.outerHTML = erfHtml(); erfBind(root);
  };
  $$('.erfimg img', el).forEach(im => im.onclick = () => im.closest('.erfrow').classList.toggle('gross'));
  $$('[data-weg]', el).forEach(b => b.onclick = async () => { await call('erfassung_fertig', [b.dataset.weg], null, true); erfLaden(true); });
  const aw = $('#erf-alle-weg', el); if (aw) aw.onclick = async () => {
    if (!await ask(`Alle ${erfOffen()} erfassten Kisten verwerfen? (Die Bilder bleiben im Ordner „verworfen“.)`, 'Verwerfen', true)) return;
    await call('erfassung_fertig', ERF.d.items.map(x => x.id), null, true); erfLaden(true);
  };
  const go = $('#erf-go', el); if (go) go.onclick = () => erfEinlagern(false);
  const ln = $('#erf-lern', el); if (ln) ln.onclick = () => erfEinlagern(true);
  const fb = $('#erf-fern', el); if (fb) fb.onclick = async () => {
    const w = $('#erf-fernw'); try { await erfFernFoto(t => w && (w.textContent = t)); } catch (e) { const w2 = $('#erf-fernw'); if (w2) w2.textContent = '⚠ ' + e.message; }
  };
}
function erfZeichnenSofort() { const el = $('#erf'); if (el) { el.outerHTML = erfHtml(); erfBind($('#erf').parentElement); } }
async function erfEinlagern(nurLernen) {
  if (ERF.d.items.some(it => !it.res)) { toast('Es wird noch gelesen – kurz warten'); return; }
  const bps = ERF.d.items.filter(it => it.res.art === 'bp');
  if (bps.some(it => !it.res.bp)) { toast('Bei einem Blueprint fehlt noch der Name'); return; }
  let neuBp = 0;
  if (!nurLernen) for (const it of bps) if (!isOwned(it.res.bp)) { S.owned[it.res.bp] = { src: 'bild', ts: now() }; neuBp++; hist('Blueprint per Erfassung: ' + (BP[it.res.bp] || {}).name); }
  if (bps.length && ERF.d.items.length === bps.length) {   // nur Blueprints
    await call('erfassung_fertig', bps.map(it => it.id), null, !!nurLernen);
    if (!nurLernen) toast(`${neuBp} Blueprint${neuBp === 1 ? '' : 's'} als „hab ich“ übernommen${bps.length > neuBp ? ` (${bps.length - neuBp} hattest du schon)` : ''}`);
    save(); await erfLaden(true); render(); return;
  }
  if (bps.length) await call('erfassung_fertig', bps.map(it => it.id), null, !!nurLernen);
  const items = ERF.d.items.filter(it => it.res && it.res.art !== 'bp');
  const fehlt = items.filter(it => !it.res.mat || !(it.res.amt > 0));
  if (fehlt.length) { toast(`${fehlt.length} ${fehlt.length === 1 ? 'Kiste hat' : 'Kisten haben'} noch kein Material oder keine Menge`); return; }
  const ohneOrt = nurLernen ? 0 : items.filter(it => !(it.res.loc || '').trim()).length;
  if (ohneOrt && !await ask(`${ohneOrt} ${ohneOrt === 1 ? 'Kiste hat' : 'Kisten haben'} keinen Lagerort. Trotzdem einlagern?`, 'Einlagern')) return;
  // zusammenfassen: gleiches Material + Qualität + Ort = ein Lagerposten (Kisten werden mitgezählt)
  const gruppen = new Map();
  for (const it of items) {
    const r = it.res, loc = (r.loc || '').trim(), key = [r.mat, r.q ?? '', loc].join('|');
    const g = gruppen.get(key) || { mat: r.mat, q: r.q ?? null, loc, amount: 0, boxes: {}, n: 0 };
    g.amount += +r.amt; g.n++;
    const k = erfKiste(+r.amt) || 1; g.boxes[k] = (g.boxes[k] || 0) + 1;
    gruppen.set(key, g);
  }
  for (const g of (nurLernen ? [] : gruppen.values())) {
    g.amount = Math.round(g.amount * 1000) / 1000;
    const ex = S.stacks.find(s => s.mat === g.mat && (s.q ?? null) === g.q && (s.loc || '') === g.loc);
    if (ex) { ex.amount = Math.round((ex.amount + g.amount) * 1000) / 1000; ex.boxes = ex.boxes || {}; for (const [k, n] of Object.entries(g.boxes)) ex.boxes[k] = (ex.boxes[k] || 0) + n; }
    else S.stacks.push({ id: uid(), mat: g.mat, amount: g.amount, unit: resUnit(g.mat), q: g.q, loc: g.loc, boxes: g.boxes, note: 'Erfassung', auto: true, keep: !autoSell(g.q) });
    hist(`Eingebucht (Erfassung, ${g.n} ${g.n === 1 ? 'Kiste' : 'Kisten'}): ${fmtAmt(g.amount, resUnit(g.mat))} ${resName(g.mat)}${g.q != null ? ' Q' + g.q : ''}${g.loc ? ' → ' + g.loc : ''}`);
  }
  // Material korrigiert? → Lesart merken (nächstes Mal sofort richtig)
  S.settings.erfNamen = S.settings.erfNamen || {};
  for (const it of items) { const r = it.res; if (r.rohs && r.matName && r.matName !== r.matErkannt) for (const x of r.rohs) { const k = (x || '').toLowerCase().trim(); if (k.length >= 2) S.settings.erfNamen[k] = r.matName; } }
  // bestätigte Werte = Lernmuster (Text genau wie im Tooltip: „0.898SCU“, „4SCU“)
  const lernen = items.filter(it => it.res.art !== 'traktor' && it.res.q != null && it.res.amt > 0 && !it.res.fehler)
    .map(it => ({ id: it.id, q: String(it.res.q), a: (it.res.amt < 1 ? (+it.res.amt).toFixed(3) : String(+it.res.amt)) + 'SCU' }));
  await call('erfassung_fertig', items.map(it => it.id), lernen, !!nurLernen);
  ERF.T = null;
  if (nurLernen) toast(`${lernen.length} Kisten als Lernmuster übernommen – nichts eingelagert`);
  else {
    setComm(`EINGELAGERT · ${items.length} KISTEN`);
    toast(`${items.length} ${items.length === 1 ? 'Kiste' : 'Kisten'} eingelagert (${gruppen.size} Posten)${neuBp ? ` · ${neuBp} Blueprint${neuBp === 1 ? '' : 's'} übernommen` : ''}`);
  }
  save(); await erfLaden(true); render();
}

/* Fern-Auslöser: auf diesem Gerät tippen → das Programm auf dem Spiele-PC macht das Foto (Maus muss dort über der Kiste sein).
   Wartet, bis die neue Kiste erkannt ist, und liefert sie zurück. */
const erfPcText = () => ERF.pc ? 'PC verbunden' : 'PC nicht verbunden (Programm am Spiele-PC starten)';
async function erfFernFoto(status) {
  const vorher = new Set((ERF.d.items || []).map(x => x.id));
  const r = await call('erfassung_ausloesen');
  if (!r || !r.ok) throw new Error('Server antwortet nicht');
  if (!r.pc) status && status('⚠ PC nicht verbunden – läuft Pliskin Industrie.exe am Spiele-PC?');
  else status && status('📷 Foto wird am PC gemacht …');
  erfMuster(); ERK.vorladen && ERK.vorladen();   // Erkennung schon mal laden, während der PC fotografiert
  for (let i = 0; i < 80; i++) {   // bis 20 s
    await new Promise(res => setTimeout(res, 250));
    await erfLaden(true);
    const neu = ERF.d.items.find(x => !vorher.has(x.id));
    if (neu && neu.res) return neu;
    if (neu) status && status('🔍 Kiste wird gelesen …');
  }
  throw new Error(r.pc ? 'Kein Bild gekommen – war die Maus über einer Kiste (Tooltip sichtbar)?' : 'PC nicht verbunden');
}
// Kiste, die über das Einbuchen-Fenster gebucht wurde: aus der Erfassung nehmen + Lernmuster
async function erfErledigt(id, q, amt) {
  const lern = q != null && amt > 0 ? [{ id, q: String(q), a: (amt < 1 ? (+amt).toFixed(3) : String(+amt)) + 'SCU' }] : null;
  await call('erfassung_fertig', [id], lern, false); ERF.T = null; erfLaden(true);
}
// Knopf im Einbuchen-Fenster (Handy „+“): f = {setMat(id,name), setAmt(scu), setQ(q), setLoc(loc), setBox(size), done(id)}
function erfQbBind(box, f) {
  const b = $('#qb-cam', box); if (!b) return;
  if (!erfOk()) { b.style.display = 'none'; return; }
  const w = $('#qb-camw', box); w.textContent = erfPcText();
  b.onclick = async () => {
    if (b.dataset.busy) return; b.dataset.busy = '1'; b.classList.add('on');
    try {
      const it = await erfFernFoto(t => w.textContent = t), r = it.res;
      if (r.fehler) throw new Error(r.fehler);
      if (r.mat) f.setMat(r.mat, r.matName);
      if (r.amt > 0) f.setAmt(+r.amt);
      if (r.q != null) f.setQ(r.q);
      if (r.loc) f.setLoc(r.loc);
      const k = erfKiste(+r.amt); if (k) f.setBox(k);
      f.done(it.id);
      const u = r.unsicher || {};
      w.textContent = `✓ ${r.matName || '?'} · Q ${r.q ?? '?'} · ${r.amt ?? '?'} SCU` + (u.mat || u.q || u.amt ? ' – bitte prüfen' : '');
    } catch (e) { w.textContent = '⚠ ' + e.message; }
    delete b.dataset.busy; b.classList.remove('on');
  };
}

/* Einstellungen → Programm: Erfassungs-Taste (nur im Programm auf dem Spiele-PC) */
const erfKeyApi = () => window.pywebview && window.pywebview.api && typeof window.pywebview.api.hotkey_get === 'function' ? window.pywebview.api : null;
async function erfKeyInfo() {
  const api = erfKeyApi(); if (!api) return null;
  try { ERF.key = await api.hotkey_get(S.settings.logDir || null); } catch (e) { ERF.key = null; }
  return ERF.key;
}
function erfKeyHtml() {
  const k = ERF.key;
  return `<div class="flbl" style="margin-top:10px">Erfassungs-Taste (Kisten im Spiel erfassen)</div>` + (k
    ? `<div class="row2"><b style="font:15px var(--vdu)">${esc(k.hotkey)}</b> <span class="${k.aktiv ? 'ok' : 'bad'}">${k.aktiv ? 'aktiv' : 'nicht aktiv' + (k.fehler ? ' – ' + esc(k.fehler) : '')}</span>
        <button class="k sm" id="erf-key">Ändern</button></div>
       <div class="row2" style="margin-top:6px"><span class="dim" style="font:12px var(--vdu)">Ton:</span>
        <select id="erf-ton">${[['wc4_lock', 'WC4: Raketen-Lock'], ['wc4_vdu', 'WC4: Display umschalten'], ['wc4_nav', 'WC4: Autopilot / NAV'], ['zielerfassung', 'Sci-Fi: Ziel-Erfassung'], ['funk', 'Sci-Fi: Funk-Kanal'], ['bordcomputer', 'Sci-Fi: Bordcomputer'], ['scanner', 'Scanner'], ['kamera', 'Kamera-Verschluss'], ['glas', 'Glas-Akkord'], ['chip', 'Retro: Chiptune (DOS)'], ['adlib', 'Retro: AdLib-Glocke'], ['terminal', 'Retro: Cockpit-Computer'], ['aus', 'Aus']].map(([v, l]) => `<option value="${v}" ${k.ton === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input id="erf-vol" type="range" min="5" max="100" step="5" value="${k.tonVol ?? 50}" style="width:140px" title="Lautstärke"><span class="dim" id="erf-volw" style="font:12px var(--vdu)">${k.tonVol ?? 50} %</span>
        <button class="k sm" id="erf-ton-ok">▶ erfasst</button><button class="k sm" id="erf-ton-f">▶ Fehler</button></div>
       <div class="hint">${k.eigenerTon ? '<b>Eigener Ton aktiv</b> (ton-ok.wav im Daten-Ordner). ' : ''}Eigenen Ton nutzen: WAV-Dateien <b>ton-ok.wav</b> und <b>ton-fehler.wav</b> in den Daten-Ordner legen (${esc(k.daten || '')}).</div>
       ${!k.admin ? `<div class="row2" style="margin-top:6px"><button class="k sm" id="erf-admin">Als Administrator neu starten</button>
         <span class="${k.spielAdmin ? 'warn' : 'dim'}" style="font:12px var(--vdu)">${k.spielAdmin ? 'Das Spiel läuft mit höheren Rechten – dann kommt die Taste im Spiel nicht an. Hiermit klappt es.' : 'Läuft Star Citizen / der RSI-Launcher als Administrator, muss Pliskin auch als Administrator laufen – sonst kommt die Taste im Spiel nicht an. Läuft das Spiel normal, geht es ohne. Alternative: vom Handy auslösen.'}</span></div>` : '<div class="hint ok">Pliskin läuft als Administrator.</div>'}
       <div class="hint">Gilt überall in Windows, auch im Spiel. Ort kommt aus dem Game.log${k.ort ? ` (zuletzt: <b>${esc(erfOrt(k.ort))}</b>)` : ''}. Erfasste Kisten: Lager → 📷 Erfassung.</div>`
    : `<div class="hint" style="margin-top:0">Gibt es im Programm (Pliskin Industrie.exe) unter Windows. Im Browser: Lager → 📷 Erfassung zeigt die erfassten Kisten.</div>`);
}
function erfKeyBind(el) {
  const b = $('#erf-key', el); if (!b) return;
  const api = erfKeyApi(), sel = $('#erf-ton', el), vol = $('#erf-vol', el);
  const speichern = async () => { $('#erf-volw', el).textContent = vol.value + ' %'; if (api && api.ton_set) { await api.ton_set(sel.value, +vol.value); ERF.key.ton = sel.value; ERF.key.tonVol = +vol.value; } };
  if (sel) { sel.onchange = async () => { await speichern(); api.ton_test(true); }; vol.oninput = () => $('#erf-volw', el).textContent = vol.value + ' %'; vol.onchange = async () => { await speichern(); api.ton_test(true); }; }
  const ad = $('#erf-admin', el); if (ad) ad.onclick = async () => { const r = await api.als_admin_neustarten(); if (!r.ok) toast('⚠ ' + (r.error || 'geht nicht')); };
  const p1 = $('#erf-ton-ok', el), p2 = $('#erf-ton-f', el);
  if (p1) p1.onclick = () => api.ton_test(true);
  if (p2) p2.onclick = () => api.ton_test(false);
  b.onclick = () => {
    let combo = '';
    const name = e => {
      if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3);
      if (/^Digit\d$/.test(e.code)) return e.code.slice(5);
      if (/^F\d{1,2}$/.test(e.code)) return e.code;
      if (/^Numpad\d$/.test(e.code)) return 'Num' + e.code.slice(6);
      return { PrintScreen: 'Druck', Pause: 'Pause', Insert: 'Einfg', Home: 'Pos1', End: 'Ende', PageUp: 'Bild↑', PageDown: 'Bild↓', ScrollLock: 'Rollen' }[e.code] || null;
    };
    const onKey = e => {
      e.preventDefault(); e.stopPropagation();
      const n = name(e); if (!n) return;
      combo = [e.ctrlKey && 'Strg', e.altKey && 'Alt', e.shiftKey && 'Umschalt', e.metaKey && 'Win', n].filter(Boolean).join('+');
      $('#erf-combo').textContent = combo;
    };
    openModal(`<h3>Erfassungs-Taste ändern</h3><div>Drück jetzt die neue Taste, z. B. <b>Pause</b>, <b>Rollen</b> oder eine Sondertaste (F13–F24, z. B. an Maus/Tastatur per Software belegt).</div>
      <div id="erf-combo" style="font:22px var(--vdu);margin:14px 0;color:var(--gold)">…</div>
      <div class="hint">Nimm eine Taste, die im Spiel nicht belegt ist – Kombis mit Buchstaben (z. B. Strg+Alt+S) lösen im Spiel die Buchstaben-Taste mit aus. Einzelne Tasten: F1–F24, Pause, Rollen, Druck.</div>
      <div class="foot"><button class="k" data-a="0">Abbrechen</button><button class="k pri" data-a="1">Übernehmen</button></div>`, box => {
      window.addEventListener('keydown', onKey, true);
      const zu = () => { window.removeEventListener('keydown', onKey, true); closeModal(); };
      $$('button', box).forEach(x => x.onclick = async () => {
        if (x.dataset.a !== '1') return zu();
        if (!combo) { toast('Erst eine Taste drücken'); return; }
        const r = await erfKeyApi().hotkey_set(combo);
        if (!r.ok) { toast('⚠ ' + (r.error || 'geht nicht')); return; }
        zu(); await erfKeyInfo(); toast('Erfassungs-Taste: ' + r.hotkey); render();
      });
    });
  };
}

// Start: Liste laden, Taste abfragen, dann alle 4 s nachsehen
(function erfStart() {
  const los = async () => {
    if (typeof BOOTED === 'undefined' || !BOOTED) return setTimeout(los, 1000);
    await erfKeyInfo();
    erfLaden(true);
    ERF.timer = setInterval(() => { if (document.visibilityState === 'visible') erfLaden(false); }, 4000);
  };
  setTimeout(los, 1500);
  window.addEventListener('pywebviewready', () => setTimeout(async () => { await erfKeyInfo(); erfZeichnen(); }, 500));
})();
