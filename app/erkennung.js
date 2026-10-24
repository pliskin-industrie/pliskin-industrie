/* Pliskin Industrie – Bilderkennung für Kisten-Tooltips (Inventar / Freight Manager)
   Eingang: Ausschnitt um den Tooltip (macht die .exe per Tastenkürzel). Darin: violetter Balken = Material,
   türkis = Qualität, oliv = Menge („0.898 SCU“). Qualität + Menge liest ein eigener Muster-Vergleich (Spiel-Schrift,
   Muster in data/ziffern.json), das Material Tesseract.js (vom CDN) + Abgleich mit der Materialliste.
   Ohne DOM-Abhängigkeit außer Canvas – läuft auch im Test (daten/ocr-test/erk_test.html). */
const ERK = (() => {
  const GW = 12, GH = 20;
  const cls = (r, g, b) => {
    if (r > g + 30 && b > g + 30 && b > 0.75 * r) return 'n';
    if (g > r + 35 && b > r + 35) return 'q';
    if (r > b + 22 && g > b + 22 && Math.abs(r - g) < 28) return 'a';
    if (Math.min(r, g, b) > 160) return 't';
    return '';
  };
  function bild(src) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => {
        const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
        const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0);
        res({ w: c.width, h: c.height, d: x.getImageData(0, 0, c.width, c.height).data, canvas: c });
      };
      im.onerror = () => rej(new Error('Bild nicht lesbar'));
      im.src = src;
    });
  }
  const px = (I, x, y) => { const i = (y * I.w + x) * 4; return cls(I.d[i], I.d[i + 1], I.d[i + 2]); };

  // Balken finden und in Felder zerlegen
  function felder(I) {
    const runs = [];
    for (let y = 0; y < I.h; y++) { let n = 0; for (let x = 0; x < I.w; x++) if (px(I, x, y) === 'n') n++; runs.push(n); }
    const m = Math.max(...runs); if (m < 15) return null;
    let a = runs.indexOf(m), b = a;
    while (a > 0 && runs[a - 1] >= 0.3 * m) a--;
    while (b < I.h - 1 && runs[b + 1] >= 0.3 * m) b++;
    const y = Math.round((a + b) / 2);
    const row = []; for (let x = 0; x < I.w; x++) row.push(px(I, x, y));
    // violett: längster Lauf aus Feld+Text, der Feldfarbe enthält
    let best = null, s = -1;
    for (let x = 0; x <= I.w; x++) {
      const c = x < I.w ? row[x] : '';
      if ((c === 'n' || c === 't') && s < 0) s = x;
      if (!(c === 'n' || c === 't') && s >= 0) {
        if (row.slice(s, x).includes('n') && (!best || x - 1 - s > best[1] - best[0])) best = [s, x - 1];
        s = -1;
      }
    }
    if (!best) return null;
    const sp = { n: best };
    let x = best[1] + 1; const lim = Math.min(I.w, best[0] + 360);
    for (const k of ['q', 'a']) {
      while (x < lim && row[x] !== k) x++;
      if (x >= lim) return null;
      const s0 = x; let gap = 0, e = x;
      while (x < I.w && gap < 12) { if (row[x] === k || row[x] === 't') { gap = 0; e = x; } else gap++; x++; }
      sp[k] = [s0, e];
    }
    let t = I.h, bo = 0;
    for (let yy = Math.max(0, y - 30); yy < Math.min(I.h, y + 31); yy++)
      for (let xx = sp.n[0]; xx <= sp.n[1]; xx += 2) if (px(I, xx, yy) === 'n') { t = Math.min(t, yy); bo = Math.max(bo, yy); }
    // jedes Feld eigene Höhe (das Mengen-Feld sitzt oft etwas tiefer als das Material-Feld)
    const hn = bo - t, hoehe = (s, k) => { let tt = I.h, bb = -1; for (let yy = Math.max(0, Math.round(t - 0.5 * hn)); yy <= Math.min(I.h - 1, Math.round(bo + 0.5 * hn)); yy++) { let n = 0; for (let xx = s[0]; xx <= s[1]; xx += 2) if (px(I, xx, yy) === k) n++; if (n >= 0.25 * (s[1] - s[0]) / 2) { tt = Math.min(tt, yy); bb = Math.max(bb, yy); } } return bb < tt ? [t, bo] : [tt, bb]; };
    return { ...sp, t, b: bo, y, qh: hoehe(sp.q, 'q'), ah: hoehe(sp.a, 'a') };
  }
  // Text (hell, auch kleinster Kanal) → 1, Rest 0
  function binar(I, x0, y0, x1, y1) {
    x0 = Math.max(0, x0); x1 = Math.min(I.w - 1, x1);
    const w = x1 - x0 + 1, h = y1 - y0 + 1, o = new Uint8Array(w * h), g = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * I.w + x0 + x) * 4;
      const v = Math.min(I.d[i], I.d[i + 1], I.d[i + 2]);
      o[y * w + x] = v > 165 ? 1 : 0; g[y * w + x] = Math.max(0, Math.min(1, (v - 90) / 140));   // Grauwert für die Muster (weicher als 0/1)
    }
    return { w, h, o, g };
  }
  // Zeichen trennen: Spalten mit Tinte, Rand weg, zusammengewachsene Zeichen nach Breite teilen
  function glyphen(B) {
    const col = x => { for (let y = 0; y < B.h; y++) if (B.o[y * B.w + x]) return true; return false; };
    let runs = [], s = -1;
    for (let x = 0; x <= B.w; x++) { const c = x < B.w && col(x); if (c && s < 0) s = x; if (!c && s >= 0) { runs.push([s, x - 1]); s = -1; } }
    runs = runs.filter(r => r[0] > 1 && r[1] < B.w - 2);
    const yr = (a, b) => { let t = B.h, bo = -1; for (let y = 0; y < B.h; y++) for (let x = a; x <= b; x++) if (B.o[y * B.w + x]) { t = Math.min(t, y); bo = Math.max(bo, y); } return [t, bo]; };
    let H = 0; for (const [a, b] of runs) { const [t, bo] = yr(a, b); if (bo >= t) H = Math.max(H, bo - t + 1); }
    if (!H) return [];
    const parts = [];
    for (const [a, b] of runs) {
      const [t] = yr(a, b);
      const n = Math.max(1, Math.round((b - a + 1) / (0.62 * H)));
      const st = (b - a + 1) / n;
      for (let i = 0; i < n; i++) parts.push([Math.floor(a + i * st), Math.floor(a + (i + 1) * st) - 1, t]);
    }
    const out = [];
    for (const [a, b] of parts) {
      const [t, bo] = yr(a, b); if (bo < t) continue;
      const gw = b - a + 1, gh = bo - t + 1;
      if (gh < 0.45 * H) { if (gw <= 0.5 * H && bo > 0.6 * H) out.push({ dot: true, x: a, x1: b }); continue; }   // Punkt unten
      const f = new Array(GW * GH).fill(0);
      const bil = (x, y) => {   // bilinear im Grauwert-Bild
        x = Math.max(0, Math.min(B.w - 1.001, x)); y = Math.max(0, Math.min(B.h - 1.001, y));
        const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, G = B.g, W = B.w;
        return G[y0 * W + x0] * (1 - fx) * (1 - fy) + G[y0 * W + x0 + 1] * fx * (1 - fy) + G[(y0 + 1) * W + x0] * (1 - fx) * fy + G[(y0 + 1) * W + x0 + 1] * fx * fy;
      };
      for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
        let sum = 0;
        for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++)
          sum += bil(a - 0.5 + (gx + (sx + 0.5) / 3) * (gw + 1) / GW, t - 0.5 + (gy + (sy + 0.5) / 3) * (gh + 1) / GH);
        f[gy * GW + gx] = sum / 9;
      }
      const mx = Math.max(...f) || 1; for (let i = 0; i < f.length; i++) f[i] /= mx;   // Strichstärke/Helligkeit angleichen
      out.push({ ar: gw / gh, f, x: a, x1: b });
    }
    return out;
  }
  // Menge „0.246 SCU“: Zahl = alles vor der größten Lücke (zwischen Zahl und „SCU“)
  function zahlTeil(gs) {
    if (gs.length < 2) return gs;
    let best = -1, gi = gs.length;
    const n = gs.filter(g => !g.dot).length;
    for (let i = 0; i < gs.length - 1; i++) {
      const rest = gs.slice(i + 1).filter(g => !g.dot).length;
      if (rest < 2 || rest > 4 || rest >= n) continue;
      const gap = gs[i + 1].x - gs[i].x1; if (gap > best) { best = gap; gi = i + 1; }
    }
    return gs.slice(0, gi);
  }
  const dist = (g, t) => { let d = 0; for (let i = 0; i < g.f.length; i++) { const e = g.f[i] - t.f[i]; d += e * e; } return d + 6 * (g.ar - t.ar) ** 2; };
  function lies(gs, T) {
    let s = '', worst = 0;
    for (const g of gs) {
      if (g.dot) { s += '.'; continue; }
      const ds = T.map(t => [dist(g, t), t.c]).sort((x, y) => x[0] - y[0]).slice(0, 3);
      if (!ds.length) { s += '?'; continue; }
      const votes = {}; ds.forEach(([d, c], i) => votes[c] = (votes[c] || 0) + 1 / (1 + d) * (i === 0 ? 1.5 : 1));
      const c = Object.keys(votes).sort((x, y) => votes[y] - votes[x])[0];
      s += c;
      const other = ds.find(x => x[1] !== c);
      worst = Math.max(worst, other ? ds[0][0] / other[0] : 0);   // nahe 1 = unsicher
    }
    return { s, unsicher: worst };
  }
  // ein Ausschnitt → Rohdaten
  async function zerlege(src) {
    const I = await bild(src);
    const F = felder(I); if (!F) return { ok: false, error: 'Kein Tooltip-Balken erkannt' };
    const pad = 7;
    return {
      ok: true, I, F,
      q: glyphen(binar(I, F.q[0] - pad, F.t, F.q[1] + pad, F.b)),   // Qualität: Höhe vom Material-Feld (bewährt)
      a: glyphen(binar(I, F.a[0] - pad, F.ah[0], F.a[1] + pad, F.ah[1])),
      nBox: [F.n[0] - 2, F.t, F.n[1] + 2, F.b]
    };
  }
  async function erkenne(src, T) {
    const Z = await zerlege(src); if (!Z.ok) return Z;
    const tq = T.filter(t => /\d/.test(t.c));
    const q = lies(Z.q, tq), a = lies(zahlTeil(Z.a), tq);
    const qn = /^\d{1,4}$/.test(q.s) ? Math.min(1000, +q.s) : null;
    const am = (a.s.match(/^[\d.]+/) || [''])[0];
    const amt = am && !isNaN(+am) ? +am : null;
    // Material- und Mengen-Feld als eigene Bilder (schwarz auf weiß, ×4) für Tesseract
    // Bild für Tesseract: Grauwert (Text dunkel), weich ×4 vergrößert, dann Schwelle – wie im Python-Test (dort Menge 37/37)
    const alsBild = ([x0, y0, x1, y1], k = 4) => {
      x0 = Math.max(0, Math.round(x0)); y0 = Math.max(0, Math.round(y0)); x1 = Math.min(Z.I.w - 1, Math.round(x1)); y1 = Math.min(Z.I.h - 1, Math.round(y1));
      const w = x1 - x0 + 1, h = y1 - y0 + 1, s = document.createElement('canvas'); s.width = w; s.height = h;
      const sg = s.getContext('2d'), id = sg.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = ((y0 + y) * Z.I.w + x0 + x) * 4, o = (y * w + x) * 4;
        const v = Math.min(Z.I.d[i], Z.I.d[i + 1], Z.I.d[i + 2]), g = 255 - Math.max(0, Math.min(255, (v - 90) * 255 / 140));
        id.data[o] = id.data[o + 1] = id.data[o + 2] = g; id.data[o + 3] = 255;
      }
      sg.putImageData(id, 0, 0);
      const c = document.createElement('canvas'); c.width = w * k + 40; c.height = h * k + 40;
      const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(s, 20, 20, w * k, h * k);
      const d = g.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < d.data.length; i += 4) { const v = d.data[i] < 128 ? 0 : 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; }
      g.putImageData(d, 0, 0);
      return c.toDataURL('image/png');
    };
    const hh = Z.F.b - Z.F.t;
    return { ok: true, q: qn, qRoh: q.s, amt, aRoh: a.s, unsicher: Math.max(q.unsicher, a.unsicher),
      nameBild: alsBild(Z.nBox), titelBild: Z.F.y > hh * 3 ? alsBild([Z.F.n[0] - 8, Z.F.y - 3.0 * hh, Z.F.n[0] + 14 * hh, Z.F.y - 1.8 * hh]) : null,
      mengeBild: alsBild([Z.F.a[0] - 7, Z.F.ah[0] - 1, Z.F.a[1] + 7, Z.F.ah[1] + 1]), qBild: alsBild([Z.F.q[0] - 7, Z.F.t, Z.F.q[1] + 7, Z.F.b]) };
  }
  // Muster aus bekannten Bildern lernen: [{src, q:'521', a:'0.898SCU'}] → [{c, ar, f}]
  async function lerne(beispiele) {
    const T = [];
    for (const b of beispiele) {
      const Z = await zerlege(b.src); if (!Z.ok) continue;
      for (const [gs, txt] of [[Z.q, b.q], [zahlTeil(Z.a), String(b.a).replace(/SCU$/i, '')]]) {
        const ohne = gs.filter(g => !g.dot), zeichen = txt.replace(/\./g, '').split('');
        if (ohne.length !== zeichen.length) continue;
        ohne.forEach((g, i) => T.push({ c: zeichen[i], ar: +g.ar.toFixed(3), f: g.f.map(v => +v.toFixed(2)) }));
      }
    }
    return T;
  }
  // Material per Tesseract.js (lädt bei Bedarf vom CDN)
  let werker = null;   // nur ein Tesseract-Werker, auch wenn mehrere gleichzeitig fragen
  function tess() {
    if (werker) return werker;
    werker = (async () => {
      if (!window.Tesseract) await new Promise((res, rej) => {
        const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
        s.onload = res; s.onerror = () => rej(new Error('Texterkennung nicht ladbar (Internet?)')); document.head.appendChild(s);
      });
      const w = await Tesseract.createWorker('eng');
      await w.setParameters({ tessedit_pageseg_mode: '7' });
      return w;
    })();
    werker.catch(() => { werker = null; });
    return werker;
  }
  async function nameLesen(dataUrl) {
    const w = await tess(); await w.setParameters({ tessedit_char_whitelist: '' });
    const r = await w.recognize(dataUrl);
    return (r.data.text || '').replace(/\s+/g, ' ').trim();
  }
  async function qLesen(dataUrl) {
    const w = await tess(); await w.setParameters({ tessedit_char_whitelist: '0123456789' });
    const r = await w.recognize(dataUrl); await w.setParameters({ tessedit_char_whitelist: '' });
    const m = (r.data.text || '').replace(/\s+/g, '').match(/^\d{1,4}$/);
    return m ? +m[0] : null;
  }
  // Menge per Tesseract (zweite Meinung zum Muster-Vergleich): „0.898 SCU“ → 0.898
  async function mengeLesen(dataUrl) {
    const w = await tess(); await w.setParameters({ tessedit_char_whitelist: '0123456789.SCU ' });
    const r = await w.recognize(dataUrl); await w.setParameters({ tessedit_char_whitelist: '' });
    const m = (r.data.text || '').replace(/\s+/g, '').match(/^(\d+(?:\.\d+)?)/);
    return m ? +m[1] : null;
  }
  // Ähnlichster Name aus einer Liste (Tippfehler der Erkennung: „Carundum“, „Hum“ → Aluminum …)
  function lev(a, b) {
    const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  // Material aus einer oder mehreren Lesarten (Überschrift + Balken). Jedes Wort zählt einzeln, auch Anfang/Ende eines Namens
  // („Titar“ → Titanium, „ninum“ → Aluminum). Gewinner = Name mit den meisten passenden Wörtern, dann kleinster Abstand.
  function naechster(roh, namen) {
    const rohs = Array.isArray(roh) ? roh : [roh];
    const tok = [];
    for (const x of rohs) {
      const s = (x || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
      if (s.length >= 3) tok.push(s);
      tok.push(...s.split(' ').filter(w => w.length >= 3));
    }
    let best = null, bt = 0, bs = 1e9;
    for (const n of namen) {
      const l = n.toLowerCase(); let treffer = 0, summe = 0;
      for (const r of tok) {
        let s = lev(r, l);
        if (r.length >= 4) s = Math.min(s, lev(r, l.slice(0, r.length)) + 0.5, lev(r, l.slice(-r.length)) + 0.5);
        if (s <= Math.max(1, Math.floor(r.length * 0.34)) + 0.5) { treffer++; summe += s; }
      }
      if (treffer > bt || (treffer === bt && treffer && summe < bs)) { bt = treffer; bs = summe; best = n; }
    }
    return bt ? best : null;
  }
  // Menge aus zwei Lesarten: gültig = ganze Kiste (1…32 SCU) oder angebrochen (< 1 SCU, max. 3 Nachkommastellen)
  const KISTEN = [1, 2, 4, 8, 16, 24, 32];
  const norm = v => v == null || isNaN(v) ? null : Math.floor(v * 1000 + 1e-6) / 1000;
  const gueltig = v => v != null && ((v > 0 && v < 1) || KISTEN.includes(v));
  function mengeKombi(muster, tess) {
    const a = norm(muster), b = norm(tess);
    if (a != null && a === b) return { v: a, sicher: true };
    if (gueltig(b)) return { v: b, sicher: false };
    if (gueltig(a)) return { v: a, sicher: false };
    if (b != null && b > 1 && b < 2) return { v: norm(b - 1), sicher: false };   // „1.978“ = „0.978“ (Null als Eins gelesen)
    return { v: b ?? a, sicher: false };
  }
  const vorladen = () => tess().catch(() => null);
  return { qLesen, felder, bild, vorladen, mengeKombi, KISTEN, erkenne, lerne, zerlege, nameLesen, mengeLesen, naechster, lies };
})();
