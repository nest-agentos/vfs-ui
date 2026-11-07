// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {createVFS, MemoryBackend} from '@nestos/vfs-core';
import {createVFSUI} from '../src';
const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => {for (const close of cleanup.splice(0).reverse()) await close(); document.body.replaceChildren(); vi.unstubAllGlobals();});
async function fixture(readOnly = false) {
    const {manager} = await createVFS({rootBackend: new MemoryBackend()}); cleanup.push(() => manager.dispose());
    const fs = await manager.openFileSystem('/');
    await fs.driver.createFile({name: 'entry.md', content: 'Keep'}); await fs.driver.createDirectory({name: 'folder'});
    const root = document.createElement('div'); document.body.append(root);
    const ui = createVFSUI({sessionListContainer: root, persistence: false, readOnly}, fs); cleanup.push(() => ui.destroy()); await ui.start();
    const menu = (id: string) => root.querySelector<HTMLButtonElement>(`[data-item-id="${id}"] [data-action=item-menu]`)!;
    const actions = () => [...document.querySelectorAll<HTMLElement>('.vfs-context-menu [data-action]')].map(button => button.dataset.action);
    return {fs, ui, root, menu, actions};
}
it.each(['/entry.md', '/folder'])('opens the same menu as right-click without activating the row: %s', async id => {
    const f = await fixture(), opened = vi.fn(); f.ui.on('sessionSelected', opened);
    expect(f.menu(id)).not.toBeNull(); expect(f.menu(id).getAttribute('aria-haspopup')).toBe('menu');
    f.menu(id).click(); const fromButton = f.actions();
    expect(fromButton).toContain('moveTo'); expect(fromButton).toContain('delete'); expect(opened).not.toHaveBeenCalled();
    f.root.querySelector<HTMLElement>(`[data-item-id="${id}"]`)!.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true, clientX: 10, clientY: 10}));
    expect(f.actions()).toEqual(fromButton);
});
it('executes deletion through the original confirmation and file lifecycle', async () => {
    const f = await fixture(), confirm = vi.fn(() => true); vi.stubGlobal('confirm', confirm);
    f.menu('/entry.md').click(); document.querySelector<HTMLButtonElement>('.vfs-context-menu [data-action=delete]')!.click();
    await vi.waitFor(async () => expect(await f.fs.driver.exists('/entry.md')).toBe(false));
    expect(confirm).toHaveBeenCalledOnce(); expect(await f.fs.driver.exists('/folder')).toBe(true);
});
it('does not expose mutation actions in a read-only sidebar', async () => {
    const f = await fixture(true); f.menu('/entry.md').click();
    expect(f.actions()).not.toContain('moveTo'); expect(f.actions()).not.toContain('delete'); expect(f.actions()).not.toContain('rename');
    expect(await f.fs.driver.exists('/entry.md')).toBe(true);
});
