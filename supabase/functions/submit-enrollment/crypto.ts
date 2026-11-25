// Application-level encryption. AES-256-GCM; the key lives only in the H2H_APP_DATA_KEY Edge secret, never in the database.
const enc = new TextEncoder();

export function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", data as BufferSource));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

export type Keys = { aes: CryptoKey; hmac: CryptoKey };
export async function loadKeys(base64Key: string): Promise<Keys> {
  const secret = base64Key.trim();
  if (!secret) throw new Error("H2H_APP_DATA_KEY is not set");
  // Preferred form: 32 random bytes, base64. Any other existing secret value is accepted unchanged and
  // stretched to a 256-bit key with SHA-256 (no secret is modified; rotation to the preferred form is deferred maintenance).
  let raw: Uint8Array | null = null;
  try { const r = unb64(secret); if (r.length === 32) raw = r; } catch { /* not base64 */ }
  if (!raw) raw = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode("h2h-key-derive-v1\u0000" + secret) as BufferSource));
  const aes = await crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
  const hmacRaw = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array([...raw, ...enc.encode("h2h-hmac-v1")]) as BufferSource));
  const hmac = await crypto.subtle.importKey("raw", hmacRaw as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return { aes, hmac };
}
export async function seal(keys: Keys, data: Uint8Array, aad: string): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) as BufferSource }, keys.aes, data as BufferSource));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv); out.set(ct, 12);
  return out;
}
export async function unseal(keys: Keys, blob: Uint8Array, aad: string): Promise<Uint8Array> {
  const iv = blob.subarray(0, 12), ct = blob.subarray(12);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource, additionalData: enc.encode(aad) as BufferSource }, keys.aes, ct as BufferSource));
}
export async function hmacHex(keys: Keys, label: string, value: string): Promise<string> {
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", keys.hmac, enc.encode(label + "\u0000" + value.normalize("NFC").trim().toLowerCase()) as BufferSource));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a), y = enc.encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}
