// Embed provider model. Detection is pure, synchronous, and dependency-free so
// it is safe to run during render and trivial to unit-test. Rendering lives in
// the lazy renderers (see ../registry.tsx) keyed off `renderer`.
/** Strip a leading `www.`/`m.`/`mobile.` so host checks read cleanly. */
export function bareHost(host) {
    return host.replace(/^(?:www|m|mobile)\./i, '').toLowerCase();
}
