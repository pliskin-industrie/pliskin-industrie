'use strict';
/* Pliskin Industrie – Datenbank → „✎ Eigene Daten“: die zwei Dinge, die in keiner Spieldatei stehen (der Spiel-Server schickt sie live):
   Raffinerie-Boni (S.refBonus: Raffinerie -> {Erz: Prozent}) und Handelspreise (S.myPrices: [{id, ware, loc, sell, buy, ts}]).
   Eingabe als Tabelle, per Freitext-Import (mehrere Zeilen, auch aus Excel/Sheets eingefügt) und Export als Text zum Teilen. */

/* ---------- Erkennen von Namen ---------- */
const ORE_ALIAS = { quantanium: 'Quantainium', quant: 'Quantainium', aluminium: 'Aluminum', ice: 'Pressurized Ice', eis: 'Pressurized Ice', diamant: 'Hephaestanite', gold: 'Gold' };
function ownRefNames() { return refList().map(r => r.name); }
// Raffinerie am Zeilenanfang finden: voller Name, Kurzname (ARC-L1), ohne „Station“/System-Zusatz
function findRefinery(text) {
  const t = nrm(text); let best = null;
  for (const n of ownRefNames()) {
    for (const k of [n, shortLoc(n), n.replace(/\s*\((Stanton|Pyro|Nyx)\)$/, ''), n.replace(/ Station$/, '')]) {
      const kk = nrm(k);
      if (kk.length >= 3 && (t === kk || t.startsWith(kk + ' ')) && (!best || kk.length > best.len)) best = { name: n, len: kk.length };
    }
  }
  if (!best) return null;
  // Rest der Zeile nach dem Namen (Wortzahl des Namens überspringen)
  const words = text.trim().split(/\s+/), nw = nrm(best.name).split(' ').length;
  let cut = 0, acc = '';
  for (let i = 0; i < words.length; i++) { acc = nrm(words.slice(0, i + 1).join(' ')); if (acc.length >= best.len) { cut = i + 1; break; } }
  return { name: best.name, rest: words.slice(cut || nw).join(' ') };
}
function lev(a, b) {   // Tippfehler-Abstand
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
let ORE_GUESS = false;
function findOre(tok) {
  const t = nrm(tok); ORE_GUESS = false; if (t.length < 3) return null;
  if (ORE_ALIAS[t]) return ORE_ALIAS[t];
  const ores = refOres();
  const hit = ores.find(o => nrm(o) === t) || ores.find(o => nrm(o).startsWith(t) && t.length >= 4);
  if (hit || t.length < 5) return hit || null;
  const best = ores.map(o => [o, lev(t, nrm(o))]).sort((a, b) => a[1] - b[1])[0];   // „Tungstn“ -> Tungsten (vermutet)
  if (best && best[1] <= 2) { ORE_GUESS = true; return best[0]; }
  return null;
}
// Ware: längster bekannter Name in der Zeile (Crafting-Material, Waren aus den Spieldaten, UEX)
let WARE_LIST = null;
function wareList() {
  if (WARE_LIST && WARE_LIST._n === (ORTE.waren || []).length + (U.commodities || []).length) return WARE_LIST;
  const set = new Map();
  Object.values(RES).forEach(r => r.name && set.set(nrm(r.name), r.name));
  (ORTE.waren || []).forEach(w => set.set(nrm(w.name), w.name));
  (U.commodities || []).forEach(c => set.set(nrm(c.name), c.name));
  WARE_LIST = [...set.entries()].sort((a, b) => b[0].length - a[0].length); WARE_LIST._n = (ORTE.waren || []).length + (U.commodities || []).length;
  return WARE_LIST;
}
function findWare(text) {
  const t = ' ' + nrm(text) + ' ';
  for (const [k, n] of wareList()) if (k.length >= 3 && t.includes(' ' + k + ' ')) return n;
  return null;
}
function findLoc(text) {
  const t = ' ' + nrm(text) + ' ';
  const cand = [];
  (ORTE.orte || []).forEach(o => cand.push(o.name));
  (U.terminals || []).forEach(x => cand.push(x.name));
  refList().forEach(r => { cand.push(r.name); cand.push(shortLoc(r.name)); });
  if (S.settings.home) cand.push(S.settings.home);
  S.favs.forEach(f => cand.push(f.loc));
  let best = null;
  for (const c of cand) { const k = nrm(c); if (k.length >= 3 && t.includes(' ' + k + ' ') && (!best || k.length > nrm(best).length)) best = c; }
  if (!best) return null;
  const full = refList().find(r => shortLoc(r.name) === best);   // „ARC-L1“ -> voller Stationsname
  return full ? full.name : best;
}
const numOf = s => { s = String(s).trim().toLowerCase().replace(/\s/g, ''); const k = /k$/.test(s); s = s.replace(/k$/, '');
  if (/^[+−-]?\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, ''); else s = s.replace(',', '.');
  const v = parseFloat(s.replace('−', '-')); return isNaN(v) ? null : (k ? v * 1000 : v); };

/* ---------- Freitext-Import: Zeilen -> Vorschläge ---------- */
function parseOwn(text) {
  const out = [];
  for (let raw of String(text).split(/\r?\n|;/)) {
    const line = raw.replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!line || !/\d/.test(line)) continue;   // Überschriften / leere Zeilen
    const ref = findRefinery(line.replace(/:/g, ' '));
    if (ref) {   // Raffinerie-Boni: „Levski: Gold +5, Quantainium -2“
      const pairs = []; const re = /([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß .()-]*?)\s*[:=]?\s*([+−-]?\d+(?:[.,]\d+)?)\s*%?/g; let m;
      while ((m = re.exec(ref.rest.replace(/,/g, ' , ')))) {
        const w = m[1].trim(); let o = findOre(w.split(' ').slice(-2).join(' ')), g = ORE_GUESS;
        if (!o) { o = findOre(w.split(' ').pop()); g = ORE_GUESS; }
        pairs.push({ ore: o, guess: g, raw: w, v: Math.round(numOf(m[2])) });
      }
      if (pairs.length) { out.push({ kind: 'ref', line, ref: ref.name, pairs, ok: pairs.some(p => p.ore) }); continue; }   // unbekannte Erze werden übersprungen
    }
    // Preis: „Gold 6543 Levski“, „Quantainium verkauf 21000 einkauf 0 @ Port Tressler“
    const ware = findWare(line);
    const at = line.split('@'); const loc = findLoc(at.length > 1 ? at.slice(1).join('@') : line.replace(ware || '', ' '));
    let sell = null, buy = null;
    const kw = (k) => { const m = line.match(new RegExp('(?:' + k + ')\\s*[:=]?\\s*([0-9][0-9.,]*k?)', 'i')); return m ? numOf(m[1]) : null; };
    sell = kw('verkauf|verk\\.?|sell|v'); buy = kw('einkauf|eink\\.?|buy|e');
    if (sell == null && buy == null) {
      const nums = (line.replace(ware || '', ' ').replace(loc || '', ' ').match(/(^|\s)([0-9][0-9.,]*k?)(?=\s|$)/g) || []).map(numOf).filter(v => v != null);
      sell = nums[0] ?? null; buy = nums[1] ?? null;
    }
    out.push({ kind: 'price', line, ware, loc, sell: sell != null ? Math.round(sell) : null, buy: buy != null ? Math.round(buy) : null,
               ok: !!(ware && loc && (sell > 0 || buy > 0)) });
  }
  return out;
}
function applyOwn(rows) {
  let nb = 0, np = 0;
  for (const r of rows) {
    if (!r.ok || r.skip) continue;
    if (r.kind === 'ref') { const o = S.refBonus[r.ref] = Object.assign({}, S.refBonus[r.ref] || {}); r.pairs.forEach(p => { if (p.ore) { o[p.ore] = p.v; nb++; } }); }
    else {
      S.myPrices = (S.myPrices || []).filter(p => !(nrm(p.ware) === nrm(r.ware) && nrm(p.loc) === nrm(r.loc)));
      S.myPrices.push({ id: uid(), ware: r.ware, loc: r.loc, sell: r.sell > 0 ? r.sell : 0, buy: r.buy > 0 ? r.buy : 0, ts: Math.floor(Date.now() / 1000) }); np++;
    }
  }
  if (nb || np) hist(`Eigene Daten importiert: ${nb} Raffinerie-Werte, ${np} Preise`);
  return { nb, np };
}
/* ---------- Export als Text (gleiches Format wie der Import) ---------- */
function exportOwn() {
  const l = [];
  Object.entries(S.refBonus || {}).forEach(([n, o]) => l.push(`${n}: ` + Object.entries(o).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ')));
  (S.myPrices || []).forEach(p => l.push(`${p.ware}${p.sell ? ' verkauf ' + p.sell : ''}${p.buy ? ' einkauf ' + p.buy : ''} @ ${p.loc}`));
  return l.join('\n');
}
function copyText(txt) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(txt).then(() => true, () => false);
  const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } ta.remove(); return Promise.resolve(ok);
}

/* ---------- Seite ---------- */
let OWN_PREVIEW = null;
function dbOwn() {
  const RL = refList(), ores = refOres();
  const sel = RL.some(r => r.name === S.ui.ownRef) ? S.ui.ownRef : (RL.find(r => isHomeLoc(r.name)) || RL[0] || {}).name;
  S.ui.ownRef = sel;
  const r = RL.find(x => x.name === sel) || { p: {}, src: {} }, own = S.refBonus[sel] || {}, ext = extBonus(sel, r.sys);
  const nOwnRef = Object.keys(S.refBonus || {}).length, nOwnP = (S.myPrices || []).length;
  let h = `<div class="win tight"><span class="pill">✎ Eigene Daten</span><span class="sub">${nOwnRef} Raffinerien · ${nOwnP} Preise selbst eingetragen</span>
    <div class="hint" style="margin-top:0">Raffinerie-Boni und Handelspreise stehen in keiner Spieldatei – der Spiel-Server schickt sie live. Was du hier einträgst, gilt immer vor UEX und SCMDB.
      ${S.settings.uexOn || S.settings.extBonus ? `Fremde Daten holst du nur auf Knopfdruck unter Einstellungen → Datenquellen.` : 'UEX und SCMDB sind in den Einstellungen aus.'}</div></div>`;
  // Raffinerie-Boni als Tabelle
  h += `<div class="cols2"><div class="win tight"><span class="pill">Raffinerie-Boni</span><span class="sub">am Raffinerie-Terminal ablesen, in %</span>
      <div class="form"><div class="fld" style="flex:1;min-width:220px"><label>Raffinerie</label><select id="ow-ref">${RL.map(x => `<option value="${esc(x.name)}" ${x.name === sel ? 'selected' : ''}>${esc(x.name)}${S.refBonus[x.name] ? ' ✎' : ''}${x.sys ? ' · ' + esc(x.sys) : ''}</option>`).join('')}</select></div></div>
      <div class="rfgrid">${ores.map(k => `<label>${esc(k)}<input type="number" step="1" data-m="${esc(k)}" value="${own[k] ?? ''}" placeholder="${ext[k] ?? ''}"></label>`).join('')}</div>
      <div class="row2"><button class="k pri" id="ow-rsave">Speichern</button><button class="k x" id="ow-rdel" ${own && Object.keys(own).length ? '' : 'disabled'}>Eigene Werte dieser Raffinerie löschen</button></div>
      <div class="hint">Leer = kein eigener Wert${WX && S.settings.extBonus ? ' (grau = SCMDB-Wert)' : ''}. Die Übersicht aller Raffinerien steht unter „Raffinerien“.</div></div>`;
  // Preise
  const mine = (S.myPrices || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const ageTxt = d => d == null ? '' : d === 0 ? 'heute' : d === 1 ? 'gestern' : `vor ${d} Tagen`;
  h += `<div class="win tight"><span class="pill">Preise</span><span class="sub">so wie du sie am Terminal siehst (aUEC je SCU)</span>
      <div class="form"><div class="fld" style="min-width:160px;flex:2"><label>Ware</label><input id="pr-w" autocomplete="off" placeholder="z. B. Gold" value="${esc(S.ui.priceWare || '')}"></div>
        <div class="fld" style="min-width:160px;flex:2"><label>Ort / Terminal</label><input id="pr-l" autocomplete="off" placeholder="z. B. ARC-L1, Levski" value="${esc(S.ui.priceLoc || '')}"></div></div>
      <div class="form"><div class="fld"><label>Verkauf</label><input id="pr-s" type="number" min="0" step="1" placeholder="was du bekommst"></div>
        <div class="fld"><label>Einkauf</label><input id="pr-b" type="number" min="0" step="1" placeholder="optional"></div>
        <button class="k pri" id="pr-go">Speichern</button></div>
      <table class="ptab" style="margin-top:6px">${mine.slice(0, 40).map(p => `<tr><td class="name">${esc(p.ware)}</td><td class="l">${esc(p.loc)}${locMark(p.loc)}</td><td>${p.sell ? N(p.sell) + ' <span class="dim">Verk.</span>' : ''}</td><td>${p.buy ? N(p.buy) + ' <span class="dim">Eink.</span>' : ''}</td>
        <td class="l dim">${ageTxt(daysAgo(p.ts))}</td><td style="white-space:nowrap"><button class="k sm" data-pe="${p.id}">✎</button> <button class="k sm x" data-px="${p.id}">×</button></td></tr>`).join('') || '<tr><td class="empty">Noch keine eigenen Preise.</td></tr>'}</table>
      ${mine.length > 40 ? `<div class="hint">… und ${mine.length - 40} ältere.</div>` : ''}</div></div>`;
  // Freitext-Import
  const P = OWN_PREVIEW;
  h += `<div class="win tight"><span class="pill">Mehrere auf einmal einfügen</span><span class="sub">Freitext oder Tabelle aus Excel / Google Sheets</span>
    <div class="hint" style="margin-top:0">Eine Zeile je Raffinerie oder Preis, zum Beispiel:<br>
      <code>Levski: Gold +5, Quantainium -2, Laranite 3</code><br><code>ARC-L1 Titanium 5 Quartz 11</code><br>
      <code>Gold 6543 Levski</code><br><code>Quantainium verkauf 21000 einkauf 0 @ Port Tressler</code></div>
    <textarea id="ow-txt" rows="6" style="width:100%;margin-top:8px" placeholder="Hier einfügen …">${esc(S.ui.ownTxt || '')}</textarea>
    <div class="row2"><button class="k pri" id="ow-prev">Vorschau</button>${P ? `<button class="k" id="ow-apply">Übernehmen (${P.filter(x => x.ok && !x.skip).length})</button><button class="k" id="ow-clear">Verwerfen</button>` : ''}</div>
    ${P ? `<table class="ptab" style="margin-top:8px">${P.map((x, i) => `<tr class="${x.ok ? '' : 'dimrow'}"><td><input type="checkbox" data-pk="${i}" ${x.ok && !x.skip ? 'checked' : ''} ${x.ok ? '' : 'disabled'}></td>
      <td class="l">${x.kind === 'ref' ? `⚗ <b>${esc(x.ref)}</b>: ${x.pairs.map(p => p.ore ? `${esc(p.ore)}${p.guess ? ` <span class="warn" title="aus „${esc(p.raw)}“ vermutet">?</span>` : ''} <span class="${bcls(p.v)}">${sgn(p.v)}</span>` : `<span class="bad">„${esc(p.raw)}“ unbekannt</span>`).join(', ')}`
        : `¤ ${x.ware ? '<b>' + esc(x.ware) + '</b>' : '<span class="bad">Ware?</span>'} @ ${x.loc ? esc(x.loc) : '<span class="bad">Ort?</span>'} · ${x.sell ? 'Verkauf ' + N(x.sell) : ''}${x.buy ? ' Einkauf ' + N(x.buy) : ''}${!(x.sell > 0 || x.buy > 0) ? '<span class="bad">Preis?</span>' : ''}`}</td>
      <td class="l dim" style="font-size:12px">${esc(x.line)}</td></tr>`).join('') || '<tr><td class="empty">Nichts erkannt.</td></tr>'}</table>` : ''}</div>`;
  // Teilen
  h += `<div class="win tight"><span class="pill">Teilen</span><span class="sub">z. B. mit deiner Org – die anderen fügen den Text oben ein</span>
    <div class="row2"><button class="k" id="ow-copy" ${nOwnRef || nOwnP ? '' : 'disabled'}>Meine Werte als Text kopieren</button><button class="k" id="ow-show" ${nOwnRef || nOwnP ? '' : 'disabled'}>Text anzeigen</button></div>
    ${S.ui.ownShow ? `<textarea readonly rows="6" style="width:100%;margin-top:8px">${esc(exportOwn())}</textarea>` : ''}</div>`;
  return h;
}
function bindOwn(el) {
  const sel = $('#ow-ref', el); if (sel) sel.onchange = () => { S.ui.ownRef = sel.value; save(); renderDb(); };
  $('#ow-rsave', el).onclick = () => {
    const o = {}; $$('.rfgrid input[data-m]', el).forEach(i => { if (i.value.trim() !== '' && !isNaN(+i.value)) o[i.dataset.m] = Math.round(+i.value); });
    if (Object.keys(o).length) S.refBonus[S.ui.ownRef] = o; else delete S.refBonus[S.ui.ownRef];
    hist('Raffinerie-Boni: ' + S.ui.ownRef); save(); renderDb(); toast('Raffinerie-Boni gespeichert');
  };
  $('#ow-rdel', el).onclick = async () => { if (!(await ask('Eigene Werte für ' + esc(S.ui.ownRef) + ' löschen?', 'Löschen', true))) return; delete S.refBonus[S.ui.ownRef]; save(); renderDb(); };
  // Preise
  const wI = $('#pr-w', el), lI = $('#pr-l', el);
  attachAC(wI, materialChoices); attachAC(lI, locationChoices);
  $('#pr-go', el).onclick = () => {
    const ware = wI.value.trim(), loc = lI.value.trim(), sell = Math.round(num($('#pr-s', el).value)), buy = Math.round(num($('#pr-b', el).value));
    if (!ware || !loc) { toast('Ware und Ort angeben'); return; }
    if (!(sell > 0) && !(buy > 0)) { toast('Mindestens einen Preis eintragen'); return; }
    applyOwn([{ kind: 'price', ok: true, ware, loc, sell, buy }]);
    S.ui.priceWare = ware; S.ui.priceLoc = loc; save(); renderDb(); toast('Preis gespeichert');
  };
  $$('[data-px]', el).forEach(b => b.onclick = () => { S.myPrices = S.myPrices.filter(p => p.id !== b.dataset.px); save(); renderDb(); });
  $$('[data-pe]', el).forEach(b => b.onclick = () => {
    const p = S.myPrices.find(x => x.id === b.dataset.pe); if (!p) return;
    S.ui.priceWare = p.ware; S.ui.priceLoc = p.loc; renderDb();
    const e2 = $('#db'); $('#pr-s', e2).value = p.sell || ''; $('#pr-b', e2).value = p.buy || ''; $('#pr-s', e2).focus();
  });
  // Import
  const ta = $('#ow-txt', el);
  ta.oninput = () => { S.ui.ownTxt = ta.value; };
  $('#ow-prev', el).onclick = () => { S.ui.ownTxt = ta.value; OWN_PREVIEW = parseOwn(ta.value); renderDb(); };
  const ap = $('#ow-apply', el); if (ap) ap.onclick = () => {
    const r = applyOwn(OWN_PREVIEW); OWN_PREVIEW = null; S.ui.ownTxt = ''; save(); renderDb();
    toast(`Übernommen: ${r.nb} Raffinerie-Werte, ${r.np} Preise`);
  };
  const cl = $('#ow-clear', el); if (cl) cl.onclick = () => { OWN_PREVIEW = null; renderDb(); };
  $$('[data-pk]', el).forEach(c => c.onchange = () => { OWN_PREVIEW[+c.dataset.pk].skip = !c.checked; renderDb(); });
  // Teilen
  $('#ow-copy', el).onclick = () => copyText(exportOwn()).then(ok => { if (ok) toast('Kopiert – einfach woanders einfügen'); else { S.ui.ownShow = true; renderDb(); toast('Kopieren ging nicht – Text unten markieren und kopieren'); } });
  $('#ow-show', el).onclick = () => { S.ui.ownShow = !S.ui.ownShow; renderDb(); };
}
