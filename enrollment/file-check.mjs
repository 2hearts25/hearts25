// Portable (browser + Deno + Node) checks for supporting-document uploads (B§13).
// The browser runs these as a convenience; the Edge Function runs them again on the bytes it actually received, so nothing
// the browser claims (name, MIME type, size) is trusted. This is structural validation and quarantine, NOT antivirus:
// every accepted file stays "quarantined / structure-checked" until authorized staff review it (see docs/RELEASE_1_3_0_ENROLLMENT_COMPLETION.md).
export const MAX_FILE_BYTES = 10 * 1024 * 1024;           // 10 MB per document (B§13 proposal)
export const MAX_SESSION_BYTES = 60 * 1024 * 1024;        // 60 MB per application
export const MAX_SESSION_FILES = 30;
export const TYPES = { 'application/pdf': ['pdf'], 'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'] };
export const ACCEPT = 'application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png';
export const CATEGORIES = ['insurance-front', 'insurance-back', 'immunization', 'physical-exam', 'health-care-plan', 'medication-authorization', 'dietary-statement', 'custody', 'pfcc', 'other'];

const startsWith = (b, sig, at = 0) => sig.every((x, i) => b[at + i] === x);
export function sniff(bytes) {
  const b = bytes;
  if (b.length >= 5 && startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';            // %PDF-
  if (b.length >= 8 && startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (b.length >= 3 && startsWith(b, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  return null;
}
export const extOf = name => (String(name || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/) || [])[1] || '';

const latin1 = b => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return s; };
// Active or embedded content that has no place in an enrollment document. A PDF containing any of these is refused.
const PDF_BLOCK = [/\/JavaScript\b/, /\/JS\b/, /\/Launch\b/, /\/EmbeddedFiles?\b/, /\/RichMedia\b/, /\/XFA\b/, /\/SubmitForm\b/, /\/ImportData\b/, /\/GoToE\b/];

// Returns { ok, mime, reason }. reason ∈ type | ext | empty | size | structure | active | encrypted | polyglot
export function inspect(bytes, name) {
  if (!bytes || !bytes.length) return { ok: false, reason: 'empty' };
  if (bytes.length > MAX_FILE_BYTES) return { ok: false, reason: 'size' };
  const mime = sniff(bytes);
  if (!mime) return { ok: false, reason: 'type' };
  const ext = extOf(name);
  if (ext && !TYPES[mime].includes(ext)) return { ok: false, reason: 'ext', mime };
  if (mime === 'application/pdf') {
    const s = latin1(bytes);
    if (!/%%EOF\s*$/.test(s.slice(-2048))) return { ok: false, reason: 'structure', mime };
    if (/\/Encrypt\b/.test(s)) return { ok: false, reason: 'encrypted', mime };
    if (PDF_BLOCK.some(re => re.test(s))) return { ok: false, reason: 'active', mime };
    // Object streams can hide dictionaries from the scan above; they are allowed but the file stays quarantined for staff review.
    return { ok: true, mime, objectStreams: /\/ObjStm\b/.test(s) };
  }
  // images: complete file, and no second file format smuggled inside
  if (mime === 'image/png') { if (!latin1(bytes.subarray(-12)).includes('IEND')) return { ok: false, reason: 'structure', mime }; }
  if (mime === 'image/jpeg') { const tail = bytes.subarray(-64); let eoi = false; for (let i = 0; i < tail.length - 1; i++) if (tail[i] === 0xff && tail[i + 1] === 0xd9) eoi = true; if (!eoi) return { ok: false, reason: 'structure', mime }; }
  const head = latin1(bytes.subarray(0, Math.min(bytes.length, 4 * 1024 * 1024)));
  if (/%PDF-|<script|<html|<svg/i.test(head.slice(16))) return { ok: false, reason: 'polyglot', mime };
  return { ok: true, mime };
}
// Filenames are shown to the family only and stored encrypted; they never become storage object names.
export const safeName = name => String(name || 'document').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, '_').slice(-120);
