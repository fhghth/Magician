import { en } from './en';
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function mergeTranslations(base, overrides) {
    if (!isRecord(base) || !isRecord(overrides)) {
        return (overrides ?? base);
    }
    const result = { ...base };
    for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined) {
            continue;
        }
        const baseValue = result[key];
        result[key] = isRecord(baseValue) && isRecord(value) ? mergeTranslations(baseValue, value) : value;
    }
    return result;
}
export function defineLocale(overrides) {
    return mergeTranslations(en, overrides);
}
