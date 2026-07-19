export function tryFormatJson(raw) {
    const text = raw.trim();
    if (!text) {
        return { ok: true, text: raw };
    }
    try {
        return { ok: true, text: JSON.stringify(JSON.parse(text), null, 2) };
    }
    catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}
