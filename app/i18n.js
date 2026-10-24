'use strict';
/* Pliskin Industrie – Sprachen. Die Oberfläche ist auf Deutsch geschrieben; für Englisch übersetzt diese Schicht
   jeden angezeigten Text (Textknoten, Platzhalter, Tooltips) über das Wörterbuch in i18n_en.js
   (genaue Texte mit # = Zahl, Muster mit # = beliebiger Text). Item-, Material- und Ortsnamen sind ohnehin englisch.
   Neue Texte: werkzeuge/i18n/*.json ergänzen und werkzeuge/i18n_bauen.py ausführen. */

let LANG = 'de', I18N_OBS = null, I18N_RX = null;
const I18N_NUM = /[+−-]?\d+(?:[.,]\d+)*/g;
function i18nPatterns() {
  if (I18N_RX) return I18N_RX;
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  I18N_RX = Object.entries(typeof I18N_EN_MUSTER !== 'undefined' ? I18N_EN_MUSTER : {})
    .sort((a, b) => b[0].length - a[0].length)
    .map(([de, en]) => [new RegExp('^' + esc(de).replace(/#/g, '(.+?)') + '$'), en]);
  return I18N_RX;
}
// Einen Text übersetzen (gibt ihn unverändert zurück, wenn es keine Übersetzung gibt)
function tr(text) {
  if (LANG !== 'en' || !text || typeof I18N_EN === 'undefined') return text;
  const m = text.match(/^(\s*)([\s\S]*?)(\s*)$/), core = m[2].replace(/\s+/g, ' ');
  if (!core || !/[A-Za-zÄÖÜäöüß]/.test(core)) return text;
  let out = I18N_EN[core];
  if (out == null) {
    const nums = core.match(I18N_NUM) || [], key = core.replace(I18N_NUM, '#');
    const t = I18N_EN[key];
    if (t != null) { let i = 0; out = t.replace(/#/g, () => nums[i++] ?? '#'); }
  }
  if (out == null) for (const [rx, en] of i18nPatterns()) {
    const r = core.match(rx); if (!r) continue;
    let i = 1; out = en.replace(/#/g, () => tr(r[i++] || '')); break;
  }
  if (out == null && /\s·\s/.test(core)) {   // „Leicht · Jäger · 8 Skins“: Teile zwischen „·“ einzeln übersetzen
    const parts = core.split(/\s·\s/), t = parts.map(p => tr(p));
    if (t.some((x, i) => x !== parts[i])) out = t.join(' · ');
  }
  return out == null ? text : m[1] + out + m[3];
}
function i18nNode(root) {
  if (LANG !== 'en' || !root) return;
  if (root.nodeType === 3) { const t = tr(root.nodeValue); if (t !== root.nodeValue) root.nodeValue = t; return; }
  if (root.nodeType !== 1 || root.closest && root.closest('[data-notr],script,style')) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) { if (n.parentElement && n.parentElement.closest('[data-notr],script,style')) continue; const t = tr(n.nodeValue); if (t !== n.nodeValue) n.nodeValue = t; }
  const els = root.querySelectorAll ? [root, ...root.querySelectorAll('[placeholder],[title],[aria-label]')] : [root];
  for (const e of els) for (const a of ['placeholder', 'title', 'aria-label']) {
    if (!e.getAttribute || !e.hasAttribute(a)) continue;
    const v = e.getAttribute(a), t = tr(v); if (t !== v) e.setAttribute(a, t);
  }
}
// Sprache anwenden: Englisch = Beobachter übersetzt alles, was gezeichnet wird. Zurück auf Deutsch = Seite neu laden.
function applyLang() {
  let want = (S && S.settings && S.settings.lang) || 'de';
  try { if (DEMO && localStorage.getItem('pliskin-lang')) want = localStorage.getItem('pliskin-lang'); } catch (e) { /* egal */ }
  document.documentElement.lang = want;
  if (want === LANG) return;
  if (LANG === 'en' && want === 'de') { LANG = 'de'; if (I18N_OBS) I18N_OBS.disconnect(); location.reload(); return; }
  LANG = want;
  if (LANG !== 'en') return;
  i18nNode(document.body);
  document.title = tr(document.title);
  I18N_OBS = new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'characterData') i18nNode(m.target);
      else if (m.type === 'attributes') i18nNode(m.target);
      else m.addedNodes.forEach(i18nNode);
    }
  });
  I18N_OBS.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title'] });
}
// Sprache wechseln (Einstellungen / Ersteinrichtung): speichern und anwenden
async function setLang(l) {
  S.settings.lang = l;
  try { localStorage.setItem('pliskin-lang', l); } catch (e) { /* egal */ }
  clearTimeout(saveTimer); await doSave();
  if (l === 'de' && LANG === 'en') { location.reload(); return; }
  applyLang(); render();
}
