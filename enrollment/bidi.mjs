// Minimal, dependency-free bidi helper for PDF text: splits a line into direction runs so that
// Arabic runs are shaped by the font (which reverses them) and numbers / Latin stay left-to-right.
export const isArabicLetter = cp =>
  ((cp >= 0x0600 && cp <= 0x06FF) || (cp >= 0x0750 && cp <= 0x077F) || (cp >= 0x08A0 && cp <= 0x08FF) || (cp >= 0xFB50 && cp <= 0xFDFF) || (cp >= 0xFE70 && cp <= 0xFEFF))
  && !(cp >= 0x0660 && cp <= 0x0669) && !(cp >= 0x06F0 && cp <= 0x06F9) && cp !== 0x066B && cp !== 0x066C;
const isNeutral = cp => cp === 0x20 || cp === 0xA0 || (cp >= 0x21 && cp <= 0x2F) || (cp >= 0x3A && cp <= 0x40) || (cp >= 0x5B && cp <= 0x60) || (cp >= 0x7B && cp <= 0x7E)
  || cp === 0x060C || cp === 0x061B || cp === 0x061F || (cp >= 0x2010 && cp <= 0x2027) || cp === 0x200C || cp === 0x200D || cp === 0x200E || cp === 0x200F;

export const classOf = cp => (isArabicLetter(cp) ? 'R' : isNeutral(cp) ? 'N' : 'L');
export const baseDirection = text => { for (const ch of text) { const c = classOf(ch.codePointAt(0)); if (c === 'R') return 'rtl'; if (c === 'L' && /[\p{L}\p{N}]/u.test(ch)) return 'ltr'; } return 'ltr'; };

// Returns runs in LOGICAL order: [{ text, rtl }]
export function logicalRuns(text, base = baseDirection(text)) {
  const chars = Array.from(text);
  const cls = chars.map(ch => classOf(ch.codePointAt(0)));
  const dflt = base === 'rtl' ? 'R' : 'L';
  for (let i = 0; i < cls.length; i++) {
    if (cls[i] !== 'N') continue;
    let a = i - 1; while (a >= 0 && cls[a] === 'N') a--;
    let b = i + 1; while (b < cls.length && cls[b] === 'N') b++;
    const prev = a >= 0 ? cls[a] : null, next = b < cls.length ? cls[b] : null;
    cls[i] = prev && prev === next ? prev : (prev === null && next === null ? dflt : dflt);
  }
  const runs = [];
  chars.forEach((ch, i) => { const rtl = cls[i] === 'R'; const last = runs[runs.length - 1]; if (last && last.rtl === rtl) last.text += ch; else runs.push({ text: ch, rtl }); });
  return runs;
}
// Visual left-to-right order of runs for a line with the given base direction.
export const visualRuns = (text, base = baseDirection(text)) => { const r = logicalRuns(text, base); return base === 'rtl' ? r.reverse() : r; };
