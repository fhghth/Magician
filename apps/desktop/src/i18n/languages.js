import { normalize } from '@/lib/text';
export const DEFAULT_LOCALE = 'en';
export const LOCALE_OPTIONS = [
    {
        id: 'en',
        name: 'English',
        englishName: 'English',
        configValue: 'en'
    },
    {
        id: 'zh',
        name: '简体中文',
        englishName: 'Simplified Chinese',
        configValue: 'zh'
    },
    {
        id: 'zh-hant',
        name: '繁體中文',
        englishName: 'Traditional Chinese',
        configValue: 'zh-hant'
    },
    {
        id: 'ja',
        name: '日本語',
        englishName: 'Japanese',
        configValue: 'ja'
    }
];
// `name` is the endonym (native name) shown in the picker so users recognize
// their language regardless of the current UI language. No country flags:
// languages are not countries. `englishName` is search-only (not shown) so an
// English speaker can type "japanese"/"traditional" to filter the list.
export const LOCALE_META = Object.fromEntries(LOCALE_OPTIONS.map(locale => [locale.id, { name: locale.name, englishName: locale.englishName }]));
const LOCALE_ALIASES = {
    en: 'en',
    'en-us': 'en',
    en_us: 'en',
    zh: 'zh',
    'zh-cn': 'zh',
    zh_cn: 'zh',
    'zh-hans': 'zh',
    zh_hans: 'zh',
    'zh-hans-cn': 'zh',
    zh_hans_cn: 'zh',
    'zh-tw': 'zh-hant',
    zh_tw: 'zh-hant',
    'zh-hk': 'zh-hant',
    zh_hk: 'zh-hant',
    'zh-mo': 'zh-hant',
    zh_mo: 'zh-hant',
    'zh-hant': 'zh-hant',
    zh_hant: 'zh-hant',
    'zh-hant-tw': 'zh-hant',
    zh_hant_tw: 'zh-hant',
    'zh-hant-hk': 'zh-hant',
    zh_hant_hk: 'zh-hant',
    ja: 'ja',
    'ja-jp': 'ja',
    ja_jp: 'ja'
};
export function isLocale(value) {
    return typeof value === 'string' && LOCALE_OPTIONS.some(locale => locale.id === value);
}
export function normalizeLocale(value) {
    if (typeof value !== 'string') {
        return DEFAULT_LOCALE;
    }
    return LOCALE_ALIASES[normalize(value)] ?? DEFAULT_LOCALE;
}
export function isSupportedLocaleValue(value) {
    return typeof value === 'string' && LOCALE_ALIASES[normalize(value)] != null;
}
export function localeConfigValue(locale) {
    return LOCALE_OPTIONS.find(item => item.id === locale)?.configValue ?? DEFAULT_LOCALE;
}
