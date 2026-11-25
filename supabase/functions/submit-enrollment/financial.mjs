// Optional card-information section (management 11/25/2026). SHARED by the browser and the Edge Function.
// What this module does: local format checks only (digits, Luhn checksum, length, expiry not in the past, required address parts).
// What it never does: contact a card network, verify or authorize a card, accept a CVV/PIN/magnetic-stripe value, or log a value.
// Card data is NEVER part of the general application answers (schema `data`); it travels in a separate request field and is stored
// only in the restricted financial store (supabase/migrations/…_v130_financial_store.sql).
import { PAYMENT_FOLLOW_UP_DAYS } from './agreements.mjs';

export const normalizePan = v => String(v ?? '').replace(/[\s-]/g, '');
export function luhn(pan) {
  let sum = 0, alt = false;
  for (let i = pan.length - 1; i >= 0; i--) { let d = pan.charCodeAt(i) - 48; if (alt) { d *= 2; if (d > 9) d -= 9; } sum += d; alt = !alt; }
  return pan.length > 0 && sum % 10 === 0;
}
export function brandOf(pan) {
  if (/^4/.test(pan)) return 'visa';
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(pan)) return 'mastercard';
  if (/^3[47]/.test(pan)) return 'amex';
  if (/^(6011|65|64[4-9])/.test(pan)) return 'discover';
  return 'card';
}
export const lastFour = pan => normalizePan(pan).slice(-4);
export const maskPan = pan => { const p = normalizePan(pan); return p ? '•'.repeat(Math.max(0, p.length - 4)) + p.slice(-4) : ''; };           // on screen
export const maskPanPlain = pan => { const p = normalizePan(pan); return p ? '*'.repeat(Math.max(0, p.length - 4)) + p.slice(-4) : ''; };         // PDF / email: ASCII only

export const FIELDS = ['name', 'number', 'expM', 'expY', 'addr', 'city', 'state', 'zip'];
// Returns {} when valid, else { field: 'required' | 'card' | 'exp' | 'zip' | 'choice' }.
export function validateCard(c = {}, today = new Date()) {
  const e = {}, pan = normalizePan(c.number);
  if (!String(c.name ?? '').trim() || String(c.name).length > 100) e.name = 'required';
  if (!pan) e.number = 'required'; else if (!/^\d{13,19}$/.test(pan) || !luhn(pan)) e.number = 'card';
  const m = Number(c.expM), y = Number(c.expY);
  if (!c.expM || !c.expY) e.exp = 'required';
  else if (!(m >= 1 && m <= 12) || !(y >= 2000 && y <= 2100)) e.exp = 'exp';
  else if (y < today.getFullYear() || (y === today.getFullYear() && m < today.getMonth() + 1)) e.exp = 'exp';
  if (!String(c.addr ?? '').trim() || String(c.addr).length > 100) e.addr = 'required';
  if (!String(c.city ?? '').trim() || String(c.city).length > 60) e.city = 'required';
  if (!/^[A-Z]{2}$/.test(String(c.state ?? ''))) e.state = 'choice';
  if (!String(c.zip ?? '').trim()) e.zip = 'required'; else if (!/^\d{5}(-\d{4})?$/.test(String(c.zip).trim())) e.zip = 'zip';
  return e;
}
// Defensive: reject any attempt to pass extra card fields (CVV/PIN/track data) — they are never accepted or stored.
export const hasForbiddenFields = c => Object.keys(c || {}).some(k => !FIELDS.includes(k));

// Follow-up deadline: 30 days after the (requested) enrollment date; the Director confirms the enrollment date.
export function followUpDue(startIso, days = PAYMENT_FOLLOW_UP_DAYS) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startIso ?? ''))) return null;
  const d = new Date(startIso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
}
