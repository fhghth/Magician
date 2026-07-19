import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getHermesConfigRecord, saveHermesConfig } from '@/hermes';
import { TRANSLATIONS } from './catalog';
import { DEFAULT_LOCALE, localeConfigValue, normalizeLocale } from './languages';
import { setRuntimeI18nLocale } from './runtime';
export { LOCALE_META } from './languages';
const defaultConfigClient = {
    getConfig: () => {
        if (typeof window === 'undefined' || !window.hermesDesktop?.api) {
            return Promise.resolve({});
        }
        return getHermesConfigRecord();
    },
    saveConfig: config => {
        if (typeof window === 'undefined' || !window.hermesDesktop?.api) {
            return Promise.resolve({ ok: true });
        }
        return saveHermesConfig(config);
    }
};
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function getConfigDisplayLanguage(config) {
    return isRecord(config.display) ? config.display.language : undefined;
}
export function withConfigDisplayLanguage(config, locale) {
    const display = isRecord(config.display) ? config.display : {};
    return {
        ...config,
        display: {
            ...display,
            language: localeConfigValue(locale)
        }
    };
}
function toError(error) {
    return error instanceof Error ? error : new Error(String(error));
}
const I18nContext = createContext({
    configLoadError: null,
    isLoadingConfig: false,
    isSavingLocale: false,
    locale: DEFAULT_LOCALE,
    saveError: null,
    setLocale: async () => { },
    t: TRANSLATIONS[DEFAULT_LOCALE]
});
export function I18nProvider({ children, configClient = defaultConfigClient, initialLocale }) {
    const [locale, setLocaleState] = useState(() => normalizeLocale(initialLocale));
    const [isLoadingConfig, setIsLoadingConfig] = useState(false);
    const [isSavingLocale, setIsSavingLocale] = useState(false);
    const [configLoadError, setConfigLoadError] = useState(null);
    const [saveError, setSaveError] = useState(null);
    const localeRef = useRef(locale);
    useEffect(() => {
        localeRef.current = locale;
        setRuntimeI18nLocale(locale);
    }, [locale]);
    useEffect(() => {
        if (!configClient) {
            return;
        }
        let cancelled = false;
        setIsLoadingConfig(true);
        setConfigLoadError(null);
        configClient
            .getConfig()
            .then(config => {
            if (!cancelled) {
                setLocaleState(normalizeLocale(getConfigDisplayLanguage(config)));
            }
        })
            .catch(error => {
            if (!cancelled) {
                setConfigLoadError(toError(error));
                setLocaleState(DEFAULT_LOCALE);
            }
        })
            .finally(() => {
            if (!cancelled) {
                setIsLoadingConfig(false);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [configClient, initialLocale]);
    const setLocale = useCallback(async (next) => {
        const previousLocale = localeRef.current;
        setSaveError(null);
        setLocaleState(next);
        if (!configClient) {
            return;
        }
        setIsSavingLocale(true);
        try {
            const latestConfig = await configClient.getConfig();
            const result = await configClient.saveConfig(withConfigDisplayLanguage(latestConfig, next));
            if (!result.ok) {
                throw new Error('Failed to save language');
            }
        }
        catch (error) {
            const nextError = toError(error);
            setLocaleState(previousLocale);
            setSaveError(nextError);
            throw nextError;
        }
        finally {
            setIsSavingLocale(false);
        }
    }, [configClient]);
    const value = useMemo(() => ({
        configLoadError,
        isLoadingConfig,
        isSavingLocale,
        locale,
        saveError,
        setLocale,
        t: TRANSLATIONS[locale]
    }), [configLoadError, isLoadingConfig, isSavingLocale, locale, saveError, setLocale]);
    return _jsx(I18nContext.Provider, { value: value, children: children });
}
export function useI18n() {
    return useContext(I18nContext);
}
