import { jsx as _jsx } from "react/jsx-runtime";
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { LanguageSwitcher } from './language-switcher';
// cmdk (the searchable list) wires a ResizeObserver and scrolls the active
// item into view — neither exists in jsdom. Stub them, matching the polyfill
// idiom in tool-approval-group.test.tsx.
class TestResizeObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
}
vi.stubGlobal('ResizeObserver', TestResizeObserver);
Element.prototype.scrollIntoView = function scrollIntoView() { };
describe('LanguageSwitcher', () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });
    it('persists language changes through display.language config', async () => {
        const saveConfig = vi.fn().mockResolvedValue({ ok: true });
        const latestConfig = { display: { language: 'en', skin: 'slate' } };
        const configClient = {
            getConfig: vi.fn().mockResolvedValue(latestConfig),
            saveConfig
        };
        render(_jsx(I18nProvider, { configClient: configClient, children: _jsx(LanguageSwitcher, {}) }));
        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Switch language' }).hasAttribute('disabled')).toBe(false);
        });
        fireEvent.click(screen.getByRole('button', { name: 'Switch language' }));
        fireEvent.click(screen.getByRole('option', { name: /日本語/i }));
        await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(1));
        expect(saveConfig).toHaveBeenCalledWith({ display: { language: 'ja', skin: 'slate' } });
    });
});
