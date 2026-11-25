// Deep-merges a release's additions into a language file (later releases override earlier wording of the same key).
export function merge(base, add) {
  const out = { ...base };
  for (const [k, v] of Object.entries(add || {})) out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' ? merge(base[k], v) : v;
  return out;
}
