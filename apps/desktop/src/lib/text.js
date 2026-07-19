// Canonical text micro-helpers. Do not redefine these per-page.
export const asText = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
export const includesQuery = (v, q) => asText(v).toLowerCase().includes(q);
export const prettyName = (v) => v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
/** Search-key normalization: the exact `value.trim().toLowerCase()` idiom that
 *  was hand-written at ~30 filter/lookup sites. */
export const normalize = (v) => asText(v).trim().toLowerCase();
/** Uppercase the first character, leave the rest. Matches the
 *  `s.charAt(0).toUpperCase() + s.slice(1)` idiom (empty-safe). */
export const capitalize = (v) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : v);
