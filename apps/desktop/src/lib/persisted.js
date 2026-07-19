import { atom } from 'nanostores';
import { readKey, writeKey } from './storage';
export const Codecs = {
    bool: { decode: raw => raw === 'true', encode: (value) => String(value) },
    nullableText: { decode: raw => raw, encode: value => value },
    text: { decode: raw => raw, encode: (value) => value },
    // Mirrors storedStringArray/persistStringArray: drops non-strings, empty → removed.
    stringArray: {
        decode: raw => {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed)
                ? parsed.filter((item) => typeof item === 'string' && item.length > 0)
                : [];
        },
        encode: value => (value.length === 0 ? null : JSON.stringify(value))
    },
    // Mirrors storedStringRecord/persistStringRecord: keeps only string values.
    stringRecord: {
        decode: raw => {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return {};
            }
            return Object.fromEntries(Object.entries(parsed).filter((entry) => typeof entry[1] === 'string'));
        },
        encode: value => JSON.stringify(value)
    },
    /** JSON with an optional sanitizer for untrusted persisted shapes. */
    json(sanitize) {
        return {
            decode: raw => {
                const parsed = JSON.parse(raw);
                return sanitize ? sanitize(parsed) : parsed;
            },
            encode: value => JSON.stringify(value)
        };
    }
};
export function persistentAtom(key, fallback, codec = Codecs.json()) {
    const raw = readKey(key);
    let initial = fallback;
    if (raw !== null) {
        try {
            initial = codec.decode(raw);
        }
        catch {
            initial = fallback;
        }
    }
    const $value = atom(initial);
    $value.subscribe(value => writeKey(key, codec.encode(value)));
    return $value;
}
