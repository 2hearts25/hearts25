// Shared PDF toolkit for both enrollment documents (Ohio records + Heart to Heart records).
// Portable: pdf-lib, fontkit and font bytes are injected, so the same code runs in Node 22 (tests / samples) and Deno (Edge function).
import { visualRuns, baseDirection } from './bidi.mjs';
import { settle, stepShown, fieldShown } from './core.mjs';
import { inDoc } from './doc-map.mjs';

const NAVY = [0.07, 0.125, 0.31], MAG = [0.753, 0, 0.333], GOLD = [1, 0.835, 0.133], GRAY = [0.36, 0.40, 0.48], LIGHT = [0.96, 0.95, 0.97], INK = [0.1, 0.12, 0.18];
const CORAL = [0.753, 0, 0.333], BLUE = [0.027, 0.357, 0.624], GREEN = [0.071, 0.522, 0.11];
export const COLORS = { NAVY, MAG, GOLD, GRAY, LIGHT, INK };
const PW = 612, PH = 792, MX = 46, TOP = 108, BOT = 50;
const HEART = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';

export const fmtDate = v => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ''); return m ? `${m[2]}/${m[3]}/${m[1]}` : v; };
export const fmtTime = v => { const m = /^(\d\d):(\d\d)$/.exec(v || ''); if (!m) return v; const h = +m[1]; return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`; };
export const easternParts = iso => { try { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' }).format(new Date(iso)); } catch { return iso; } };

export async function createKit({ lib, fonts, schema, en, data: raw, meta, doc: docKey, title, short, subtitle }) {
  const { PDFDocument, rgb, fontkit, PDFName, PDFHexString, PDFOperator } = lib;
  const data = settle(raw, schema);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const embed = async (b, latin) => doc.embedFont(b, latin ? { subset: false, features: { liga: false, clig: false, dlig: false } } : { subset: false });
  const F = { noto: await embed(fonts.notoRegular, true), notoB: await embed(fonts.notoBold, true), ar: await embed(fonts.cairoRegular), arB: await embed(fonts.cairoBold) };
  const cov = { noto: fontkit.create(fonts.notoRegular), ar: fontkit.create(fonts.cairoRegular) };
  let replaced = 0;
  const clean = s => Array.from(String(s ?? '').replace(/[\t\u00ad]/g, ' ').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')).map(ch => {
    const cp = ch.codePointAt(0); if (cp === 10) return ch; if (cp === 0x200c || cp === 0x200d || cp === 0x200e || cp === 0x200f) return ch;
    if (cov.noto.hasGlyphForCodePoint(cp) || cov.ar.hasGlyphForCodePoint(cp)) return ch; replaced++; return '?';
  }).join('');
  const col = c => rgb(c[0], c[1], c[2]);
  doc.setTitle(`${title} — ${meta.applicationId}`);
  doc.setAuthor('Heart to Heart Enrichment Center'); doc.setSubject(`${subtitle} — confidential`);
  doc.setProducer('Heart to Heart enrollment'); doc.setCreator('hearts25.com'); doc.setCreationDate(new Date(meta.submittedAt)); doc.setModificationDate(new Date(meta.submittedAt));
  doc.setLanguage?.('en-US');

  const childName = `${data['c.first'] || ''} ${data['c.last'] || ''}`.trim();
  const parentNames = [data['p1.name'], data['p2.has'] === 'yes' ? data['p2.name'] : ''].filter(Boolean).join(' / ');

  let page, y;
  const printed = new Set();
  const MIR = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<', '«': '»', '»': '«' };
  const mirror = t => t.replace(/[()\[\]{}<>«»]/g, c => MIR[c]);
  const pickFont = (rtl, bold) => (rtl ? (bold ? F.arB : F.ar) : (bold ? F.notoB : F.noto));
  const runText = r => (r.rtl ? mirror(r.text) : r.text);
  const widthOf = (t, size, bold) => visualRuns(t).reduce((s, r) => s + pickFont(r.rtl, bold).widthOfTextAtSize(runText(r), size), 0);
  const fit = (t, size, maxW, bold) => { let s = clean(t).replace(/\n/g, ' '); if (widthOf(s, size, bold) <= maxW) return s; while (s.length > 1 && widthOf(s + '…', size, bold) > maxW) s = s.slice(0, -1); return s + '…'; };

  // ---- logo: the site's four-heart mark + wordmark, drawn as vectors (no raster, no external file)
  function logo(x, top, scale = 1) {
    const cell = 12 * scale, gap = 1.6 * scale, cols = [CORAL, BLUE, GOLD, GREEN];
    cols.forEach((c, i) => {
      const cx = x + (i % 2) * (cell + gap), cy = top - Math.floor(i / 2) * (cell + gap);
      page.drawRectangle({ x: cx, y: cy - cell, width: cell, height: cell, color: col(c) });
      const hs = (cell * 0.62) / 24; page.drawSvgPath(HEART, { x: cx + cell * 0.19, y: cy - cell * 0.17, scale: hs, color: i === 2 ? col(INK) : rgb(1, 1, 1), borderWidth: 0 });
    });
    const tx = x + 2 * cell + gap + 8 * scale;
    page.drawText('Heart to Heart', { x: tx, y: top - 12 * scale, size: 14 * scale, font: F.notoB, color: rgb(1, 1, 1) });
    page.drawText('ENRICHMENT CENTER', { x: tx, y: top - 23 * scale, size: 7 * scale, font: F.notoB, color: col(GOLD) });
  }
  function header() {
    page.drawRectangle({ x: 0, y: PH - 52, width: PW, height: 52, color: col(NAVY) });
    page.drawRectangle({ x: 0, y: PH - 55, width: PW, height: 3, color: col(GOLD) });
    logo(MX, PH - 10, 1.1);
    const t = fit(short, 10, 250, false); page.drawText(t, { x: PW - MX - F.noto.widthOfTextAtSize(t, 10), y: PH - 28, size: 10, font: F.noto, color: rgb(1, 1, 1) });
    // identification strip on every page: application id, submission date, child, parent(s)
    const idLine = `Application ${meta.applicationId}  ·  Submitted ${easternParts(meta.submittedAt)}`;
    page.drawText(idLine, { x: MX, y: PH - 67, size: 7.5, font: F.noto, color: col(GRAY) });
    const names = fit(`Child: ${childName || '—'}   Parent/guardian: ${parentNames || '—'}`, 7.5, PW - 2 * MX, false);
    drawLine(names, MX, PH - 78, 7.5, { color: GRAY });
  }
  const newPage = () => { page = doc.addPage([PW, PH]); header(); y = PH - TOP; };
  const ensure = h => { if (y - h < BOT) newPage(); };

  function wrap(text, size, maxW, bold) {
    const out = [];
    for (const para of clean(text).split('\n')) {
      const words = para.split(/(?<= )/u); let line = '';
      for (const w of words) {
        const cand = line + w;
        if (line && widthOf(cand.trimEnd(), size, bold) > maxW) { out.push(line.trimEnd()); line = w; } else line = cand;
        while (widthOf(line.trimEnd(), size, bold) > maxW && line.length > 1) { // hard-break very long tokens
          let k = line.length - 1; while (k > 1 && widthOf(line.slice(0, k), size, bold) > maxW) k--;
          out.push(line.slice(0, k)); line = line.slice(k);
        }
      }
      out.push(line.trimEnd());
    }
    return out;
  }
  // Draws one line. Lines containing right-to-left runs are wrapped in /ActualText (logical order) so copy, search and
  // text extraction return the family's real words even though glyphs are shaped and placed visually.
  function drawLine(text, x, yy, size, { bold = false, color = INK, width = 0, base } = {}) {
    const b = base || baseDirection(text); const runs = visualRuns(text, b);
    const hasRtl = runs.some(r => r.rtl);
    if (hasRtl && PDFOperator) page.pushOperators(PDFOperator.of('BDC', [PDFName.of('Span'), doc.context.obj({ ActualText: PDFHexString.fromText(text) })]));
    const total = runs.reduce((s, r) => s + pickFont(r.rtl, bold).widthOfTextAtSize(runText(r), size), 0);
    let cx = b === 'rtl' && width ? x + width - total : x;
    for (const r of runs) { const f = pickFont(r.rtl, bold); const t = runText(r); if (t) page.drawText(t, { x: cx, y: yy, size, font: f, color: col(color) }); cx += f.widthOfTextAtSize(t, size); }
    if (hasRtl && PDFOperator) page.pushOperators(PDFOperator.of('EMC'));
  }
  const LH = 12.5;
  function bigTitle(t, sub) {
    page.drawText(t, { x: MX, y, size: 19, font: F.notoB, color: col(NAVY) }); y -= 17;
    if (sub) for (const l of wrap(sub, 8.5, PW - 2 * MX, false)) { page.drawText(l, { x: MX, y, size: 8.5, font: F.noto, color: col(GRAY) }); y -= 11; }
    y -= 3;
  }
  function banner(text, color = MAG) { for (const l of wrap(text, 8.5, PW - 2 * MX, true)) { ensure(11); page.drawText(l, { x: MX, y, size: 8.5, font: F.notoB, color: col(color) }); y -= 11; } y -= 4; }
  function section(n, t) {
    ensure(70); y -= 8;
    page.drawRectangle({ x: MX, y: y - 6, width: PW - 2 * MX, height: 22, color: col(LIGHT) });
    page.drawRectangle({ x: MX, y: y - 6, width: 4, height: 22, color: col(MAG) });
    page.drawText(fit(n ? `${n}. ${t}` : t, 12, PW - 2 * MX - 20, true), { x: MX + 12, y: y + 1, size: 12, font: F.notoB, color: col(NAVY) });
    y -= 26;
  }
  function sub(t) { ensure(40); y -= 4; page.drawText(clean(t), { x: MX, y, size: 10.5, font: F.notoB, color: col(MAG) }); y -= 14; }
  const LW = 172, VX = MX + LW + 8, VW = PW - MX - VX;
  function kv(label, value, { pending = false } = {}) {
    const v = clean(value === '' || value === undefined || value === null ? '—' : value);
    const ll = wrap(label, 8.5, LW, false), vl = wrap(v, 10, VW, pending);
    const rows = Math.max(ll.length, vl.length);
    const rtlVal = baseDirection(v) === 'rtl';
    for (let i = 0; i < rows; i++) {
      ensure(LH + 2);
      if (ll[i] !== undefined) drawLine(ll[i], MX, y, 8.5, { color: GRAY, base: baseDirection(label) === 'rtl' ? 'rtl' : 'ltr', width: LW });
      if (vl[i] !== undefined) drawLine(vl[i], VX, y, 10, { base: rtlVal ? 'rtl' : 'ltr', bold: pending, color: pending ? MAG : INK });
      y -= LH;
    }
    y -= 5; page.drawLine({ start: { x: MX, y: y + 8 }, end: { x: PW - MX, y: y + 8 }, thickness: 0.3, color: rgb(0.88, 0.88, 0.9) });
  }
  function para(text, { size = 9.5, color = INK, bold = false } = {}) { for (const l of wrap(text, size, PW - 2 * MX, bold)) { ensure(LH); drawLine(l, MX, y, size, { color, bold, width: PW - 2 * MX, base: baseDirection(text) }); y -= LH; } y -= 3; }
  function checkbox(x, yy, on) {
    page.drawRectangle({ x, y: yy - 1, width: 9, height: 9, borderWidth: 0.9, borderColor: col(NAVY), color: rgb(1, 1, 1) });
    if (on) { page.drawLine({ start: { x: x + 1.8, y: yy + 3.2 }, end: { x: x + 4, y: yy + 1 }, thickness: 1.4, color: col(MAG) }); page.drawLine({ start: { x: x + 4, y: yy + 1 }, end: { x: x + 7.8, y: yy + 6.8 }, thickness: 1.4, color: col(MAG) }); }
  }
  function tick(text, on, { size = 9.5 } = {}) {
    const lines = wrap(text, size, PW - 2 * MX - 20, false); ensure(lines.length * LH + 4);
    checkbox(MX, y, on); lines.forEach((l, i) => drawLine(l, MX + 18, y - i * LH, size, {})); y -= lines.length * LH + 3;
  }

  // ---- values
  const lk = id => (id === 'p2.has' ? id : id.replace(/^p2\./, 'p1.'));
  const optLabel = (id, v) => en.o[lk(id)]?.[v] ?? en.o._[v] ?? v;
  const label = id => en.f[lk(id)] ?? id;
  function show(f, v, id = f.id) {
    if (v === undefined || v === null || v === '') return null;
    switch (f.t) {
      case 'check': return v ? 'Yes' : 'No';
      case 'radio': case 'select': return optLabel(id, v);
      case 'checks': return v.map(x => optLabel(id, x)).join(', ');
      case 'date': return fmtDate(v);
      case 'time': return fmtTime(v);
      case 'textna': return v === 'N/A' ? 'N/A (nothing to report)' : v;
      default: return String(v);
    }
  }
  const allFields = () => schema.steps.filter(st => stepShown(st, data, schema)).flatMap(st => st.fields.map(f => [st, f]));
  // Print the shown fields of this document, optionally restricted to a list of ids / a prefix. Records what was printed (coverage).
  function printFields({ ids, prefix, skip = [], pendingIf } = {}) {
    let any = false;
    for (const [, f] of allFields()) {
      if (ids && !ids.includes(f.id)) continue; if (prefix && !f.id.startsWith(prefix)) continue; if (skip.includes(f.id)) continue;
      if (!inDoc(f.id, docKey)) continue; if (!fieldShown(f, data, schema)) continue;
      if (f.t === 'rep') {
        const rows = data[f.id] || [];
        rows.forEach((row, i) => {
          sub(f.id === 'ec' ? (i === 0 ? 'Emergency contact #1 (primary — cannot be a parent/guardian)' : `Emergency contact #${i + 1}${i === 1 ? ' (optional)' : ''}`) : `Authorized pickup person ${i + 1}`);
          for (const g of f.f) { const s = show(g, row[g.id], f.id + '.' + g.id); if (s !== null) { kv(en.f[f.id + '.' + g.id] ?? g.id, s); printed.add(f.id + '.' + g.id); } }
        });
        if (rows.length) printed.add(f.id); any = true; continue;
      }
      const s = show(f, data[f.id]);
      if (s === null && f.r === undefined) continue;
      kv(label(f.id), s === null ? '—' : s, { pending: pendingIf ? pendingIf(f.id, data[f.id]) : false });
      if (s !== null) printed.add(f.id); any = true;
    }
    return any;
  }
  const answered = id => data[id] !== undefined && data[id] !== '' && data[id] !== null;

  // ---- signatures (printed identically in both documents, from the same stored signatures)
  async function signatures({ heading = 'Electronic signatures' } = {}) {
    for (const s of meta.signatures || []) {
      ensure(120); sub(`${heading} — ${s.role === 'parent2' ? 'Parent / guardian 2' : 'Parent / guardian 1 (primary applicant)'}`);
      kv('Signer', s.name); kv('Relationship to child', s.relation || '—');
      kv('Signature method', s.method === 'drawn' ? 'Drawn with finger/mouse on screen' : 'Typed name, with agreement that a typed name is a legal electronic signature');
      kv('Date signed (Eastern time)', easternParts(s.signedAt)); kv('Date signed (UTC)', s.signedAt);
      if (s.method === 'drawn' && s.png) {
        const img = await doc.embedPng(s.png); const sc = Math.min(220 / img.width, 70 / img.height); const w = img.width * sc, h = img.height * sc;
        ensure(h + 14); page.drawRectangle({ x: VX, y: y - h - 4, width: w + 8, height: h + 8, borderWidth: 0.5, borderColor: rgb(0.8, 0.8, 0.85) });
        page.drawImage(img, { x: VX + 4, y: y - h, width: w, height: h }); y -= h + 16;
      } else if (s.method === 'typed') { ensure(30); drawLine(clean(s.name), VX, y - 6, 18, { color: NAVY, width: VW }); y -= 28; }
    }
    if (meta.parent2Mode === 'later') { sub(`${heading} — Parent / guardian 2`); kv('Signature status', 'PENDING — Heart to Heart will contact the second parent or guardian to sign.', { pending: true }); }
  }
  // blank lines for a person to sign by hand later (administrator / designee)
  function signLine(labelText, dateLabel = 'Date') {
    ensure(46); y -= 14;
    page.drawLine({ start: { x: MX, y }, end: { x: MX + 300, y }, thickness: 0.7, color: col(INK) });
    page.drawLine({ start: { x: MX + 330, y }, end: { x: PW - MX, y }, thickness: 0.7, color: col(INK) });
    page.drawText(labelText, { x: MX, y: y - 10, size: 8, font: F.noto, color: col(GRAY) });
    page.drawText(dateLabel, { x: MX + 330, y: y - 10, size: 8, font: F.noto, color: col(GRAY) });
    y -= 20;
  }
  function annualTable(rows = 3) {
    ensure(30 + rows * 40);
    const cw = (PW - 2 * MX) / 4, heads = ['Parent/Guardian initials', 'Date of review', 'Administrator/Designee initials', 'Date of review'];
    page.drawRectangle({ x: MX, y: y - 4, width: PW - 2 * MX, height: 16, color: col(LIGHT) });
    heads.forEach((h, i) => page.drawText(h, { x: MX + i * cw + 6, y, size: 8, font: F.notoB, color: col(NAVY) })); y -= 6;
    for (let r = 0; r < rows; r++) {
      y -= 26; page.drawRectangle({ x: MX, y: y - 4, width: PW - 2 * MX, height: 26, borderWidth: 0.5, borderColor: rgb(0.75, 0.75, 0.8) });
      for (let i = 1; i < 4; i++) page.drawLine({ start: { x: MX + i * cw, y: y - 4 }, end: { x: MX + i * cw, y: y + 22 }, thickness: 0.5, color: rgb(0.75, 0.75, 0.8) });
    }
    y -= 14;
  }
  async function finish(extraCheck) {
    if (replaced) para(`Note: ${replaced} character(s) in the family’s answers could not be displayed in this PDF and are shown as “?”. The original text is preserved in the encrypted application record.`, { size: 8.5, color: MAG });
    const pages = doc.getPages();
    pages.forEach((p, i) => {
      p.drawLine({ start: { x: MX, y: 36 }, end: { x: PW - MX, y: 36 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.85) });
      p.drawText(`CONFIDENTIAL · ${meta.applicationId} · ${short}`, { x: MX, y: 24, size: 8, font: F.noto, color: col(GRAY) });
      const t = `Page ${i + 1} of ${pages.length}`; p.drawText(t, { x: PW - MX - F.noto.widthOfTextAtSize(t, 8), y: 24, size: 8, font: F.noto, color: col(GRAY) });
      const c = 'Heart to Heart Enrichment Center · 3095 W. 25th Street, Cleveland, OH 44113 · (216) 938-6771'; p.drawText(c, { x: (PW - F.noto.widthOfTextAtSize(c, 7.5)) / 2, y: 14, size: 7.5, font: F.noto, color: col(GRAY) });
    });
    return { bytes: await doc.save(), pageCount: pages.length, replaced, printed };
  }
  return { data, doc, newPage, ensure, bigTitle, banner, section, sub, kv, para, tick, checkbox, printFields, signatures, signLine, annualTable, finish, show, label, optLabel, answered, printed,
    get y() { return y; }, set y(v) { y = v; }, get page() { return page; }, childName, parentNames, wrap, drawLine };
}
