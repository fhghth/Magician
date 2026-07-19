import { jsx as _jsx } from "react/jsx-runtime";
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { $connection, setCurrentCwd } from '@/store/session';
import { resetProjectTreeState } from './files/use-project-tree';
import { RightSidebarPane } from './index';
const readDir = vi.fn();
function installBridge() {
    ;
    window.hermesDesktop = { readDir };
}
describe('RightSidebarPane', () => {
    beforeEach(() => {
        $connection.set(null);
        resetProjectTreeState();
        readDir.mockReset();
        readDir.mockResolvedValue({ entries: [{ isDirectory: false, name: 'README.md', path: '/repo/README.md' }] });
        installBridge();
    });
    afterEach(() => {
        cleanup();
        $connection.set(null);
        setCurrentCwd('');
        resetProjectTreeState();
        delete window.hermesDesktop;
    });
    it('renders the tree whenever the session has a working dir (repo or not) — no picker', async () => {
        setCurrentCwd('/repo');
        render(_jsx(RightSidebarPane, { onActivateFile: vi.fn(), onActivateFolder: vi.fn() }));
        const refresh = await screen.findByRole('button', { name: 'Refresh tree' });
        readDir.mockClear();
        fireEvent.click(refresh);
        await waitFor(() => expect(readDir).toHaveBeenCalledWith('/repo'));
        // The freeform folder picker is retired.
        expect(screen.queryByRole('button', { name: 'Open folder' })).toBeNull();
    });
    it('shows no tree for a detached chat (no working dir)', async () => {
        setCurrentCwd('');
        render(_jsx(RightSidebarPane, { onActivateFile: vi.fn(), onActivateFolder: vi.fn() }));
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Refresh tree' })).toBeNull());
        expect(readDir).not.toHaveBeenCalled();
    });
});
