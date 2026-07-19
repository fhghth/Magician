import { TRANSLATIONS } from './catalog';
import { DEFAULT_LOCALE } from './languages';
let runtimeLocale = DEFAULT_LOCALE;
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function resolvePath(catalog, key) {
    return key.split('.').reduce((current, part) => {
        if (!isRecord(current)) {
            return undefined;
        }
        return current[part];
    }, catalog);
}
function renderTranslation(value, args) {
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'function') {
        return value(...args);
    }
    return null;
}
export function setRuntimeI18nLocale(locale) {
    runtimeLocale = locale;
}
export function translateNow(key, ...args) {
    const active = renderTranslation(resolvePath(TRANSLATIONS[runtimeLocale], key), args);
    if (active !== null) {
        return active;
    }
    if (runtimeLocale !== DEFAULT_LOCALE) {
        const fallback = renderTranslation(resolvePath(TRANSLATIONS[DEFAULT_LOCALE], key), args);
        if (fallback !== null) {
            return fallback;
        }
    }
    return key;
}
