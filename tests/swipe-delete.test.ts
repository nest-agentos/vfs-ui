// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createVFS, MemoryBackend } from '@nestos/vfs-core';
import { createVFSUI, type VFSNodeUI } from '../src';

beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value) });
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(fn, 0));
    vi.stubGlobal('cancelAnimationFrame', clearTimeout);
});
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

type Options = Parameters<typeof createVFSUI>[0];
async function fixture(overrides: Partial<Options> = {}) {
    const { manager } = await createVFS({ rootBackend: new MemoryBackend() });
    const fs = await manager.openFileSystem('/');
    for (const name of ['a.md', 'b.md']) await fs.driver.createFile({ parentPath: '/', name, content: 'private body' });
    await fs.driver.createDirectory({ parentPath: '/', name: 'folder', recursive: true });
    const container = document.createElement('div'); document.body.append(container);
    const ui = createVFSUI({ sessionListContainer: container, scopeId: 'swipe-delete', autoSelectFirst: false,
        toolbar: 'hidden', sort: { by: 'title', direction: 'asc' }, ...overrides }, fs);
    await ui.start();
    const row = (id = '/a.md') => container.querySelector<HTMLElement>(`[data-item-id="${id}"] > .vfs-node-item__main-row`)!;
    const button = (id = '/a.md') => row(id).querySelector<HTMLButtonElement>('[data-swipe-delete]');
    return { fs, ui, container, row, button, async destroy() { ui.destroy(); await manager.dispose(); } };
}

/** jsdom has no native PointerEvent, so dispatch its real DOM event with pointer fields. */
function pointer(target: EventTarget, type: string, x: number, y = 0, extras: Record<string, unknown> = {}) {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y });
    Object.defineProperties(event, Object.fromEntries(Object.entries({ pointerId: 1, isPrimary: true,
        pointerType: 'touch', ...extras }).map(([key, value]) => [key, { value }])));
    target.dispatchEvent(event); return event;
}
function swipe(row: HTMLElement, dx = -60, dy = 0, pointerType = 'touch') {
    pointer(row, 'pointerdown', 100, 100, { pointerType });
    const move = pointer(row, 'pointermove', 100 + dx, 100 + dy, { pointerType });
    pointer(row, 'pointerup', 100 + dx, 100 + dy, { pointerType });
    return move;
}
function physicalClick(button: HTMLElement) {
    pointer(button, 'pointerdown', 20); pointer(button, 'pointerup', 20);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
}

it.each(['touch', 'mouse', 'pen'])('reveals a delete icon only after a %s swipe and confirms before deleting exactly once', async type => {
    const activate = vi.fn(), confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    const f = await fixture({ presentation: { icons: { delete: '<b>trash</b>', confirm: '<b>check</b>' } } });
    f.ui.on('resourceActivated', activate);
    try {
        const remove = vi.spyOn(f.fs.driver, 'delete');
        expect(f.button()!.hidden).toBe(true);
        expect(swipe(f.row(), -60, 0, type).defaultPrevented).toBe(true);
        expect(f.button()!.hidden).toBe(false); expect(f.button()!.textContent).toBe('trash');
        physicalClick(f.button()!);
        expect(f.button()!.dataset.action).toBe('delete-direct');
        expect(f.button()!.textContent).toBe('check'); expect(f.button()!.getAttribute('aria-label')).toBe('再次点击删除');
        expect(remove).not.toHaveBeenCalled();
        const stale = f.button()!; physicalClick(stale); stale.click();
        await vi.waitFor(() => expect(f.container.querySelector('[data-item-id="/a.md"]')).toBeNull());
        expect(remove).toHaveBeenCalledTimes(1); expect(activate).not.toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled();
    } finally { await f.destroy(); }
});

it.each([[-47, 0], [47, 0], [-60, 50], [0, 70], [0, -70]])('ignores insufficient or vertical gestures (%s, %s) without activating a row', async (dx, dy) => {
    const activate = vi.fn(); const f = await fixture(); f.ui.on('resourceActivated', activate);
    try {
        const row = f.row(); const move = swipe(row, dx, dy);
        row.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
        expect(f.button()!.hidden).toBe(true); expect(activate).not.toHaveBeenCalled();
        if (Math.abs(dy) >= Math.abs(dx)) expect(move.defaultPrevented).toBe(false);
    } finally { await f.destroy(); }
});

it('locks vertical intent, ignores other pointers and cancels interrupted gestures', async () => {
    const activate = vi.fn(); const f = await fixture(); f.ui.on('resourceActivated', activate);
    try {
        pointer(f.row(), 'pointerdown', 100, 100);
        pointer(f.row(), 'pointermove', 100, 120);
        expect(pointer(f.row(), 'pointermove', 0, 125).defaultPrevented).toBe(false);
        pointer(f.row(), 'pointerup', 0, 125);
        expect(f.button()!.hidden).toBe(true);
        pointer(f.row(), 'pointerdown', 100);
        pointer(f.row(), 'pointerup', 0, 0, { pointerId: 2 });
        expect(f.button()!.hidden).toBe(true);
        pointer(f.row(), 'pointermove', 0); pointer(f.row(), 'pointercancel', 0);
        pointer(f.row(), 'pointerup', 0);
        f.row().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
        expect(f.button()!.hidden).toBe(true); expect(activate).not.toHaveBeenCalled();
    } finally { await f.destroy(); }
});

it('suppresses trailing click/double-click after swiping and preserves ordinary selection and activation', async () => {
    const activate = vi.fn(); const f = await fixture(); f.ui.on('resourceActivated', activate);
    try {
        const row = f.row(); swipe(row);
        for (const type of ['click', 'dblclick']) row.dispatchEvent(new MouseEvent(type, { bubbles: true, detail: 1 }));
        expect(f.button()!.hidden).toBe(false); expect(activate).not.toHaveBeenCalled();
        physicalClick(f.row()); expect(f.button()!.hidden).toBe(true); expect(activate).not.toHaveBeenCalled();
        physicalClick(f.row().querySelector<HTMLElement>('[data-action="select-and-open"]')!);
        expect(activate).toHaveBeenCalledOnce();
        f.ui.setSelectionMode(true);
        physicalClick(f.row('/b.md'));
        expect(f.row('/b.md').querySelector<HTMLInputElement>('input')!.checked).toBe(true);
        expect(activate).toHaveBeenCalledOnce();
    } finally { await f.destroy(); }
});

it('uses exact open/close thresholds, keeps at most one row open and clears confirmation on close', async () => {
    const f = await fixture();
    try {
        swipe(f.row(), -48); expect(f.button()!.hidden).toBe(false);
        physicalClick(f.button()!); expect(f.button()!.dataset.action).toBe('delete-direct');
        swipe(f.row('/b.md'), -48);
        expect(f.button()!.hidden).toBe(true); expect(f.button()!.dataset.action).toBe('delete-init');
        expect(f.button('/b.md')!.hidden).toBe(false);
        swipe(f.row('/b.md'), 31); expect(f.button('/b.md')!.hidden).toBe(false);
        swipe(f.row('/b.md'), 32); expect(f.button('/b.md')!.hidden).toBe(true);
        swipe(f.row()); physicalClick(f.button()!);
        f.row().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
        expect(f.button()!.hidden).toBe(true); expect(f.button()!.dataset.action).toBe('delete-init');
        swipe(f.row()); document.body.click(); expect(f.button()!.hidden).toBe(true);
    } finally { await f.destroy(); }
});

it.each(['_readOnly', '_fixedEntry', '_disabled'])('never offers a swipe entry for %s rows', async flag => {
    const f = await fixture();
    try {
        await f.fs.driver.updateMetadata('/a.md', { [flag]: true }); await f.ui.refresh();
        swipe(f.row()); expect(f.button()).toBeNull();
        expect(f.row().querySelector('[data-action="delete-init"]')).toBeNull();
    } finally { await f.destroy(); }
});

it('rejects menu-disabled and explicitly excluded rows, while virtual groups opt in through quickDelete', async () => {
    const onQuickDelete = vi.fn(async () => {});
    const listItems = (items: VFSNodeUI[]) => items.map(node => node.type === 'directory'
        ? { ...node, kind: 'group' as const, presentation: { quickDelete: true } }
        : node.id === '/b.md' ? { ...node, presentation: { quickDelete: false } } : node);
    const f = await fixture({ listItems, onQuickDelete,
        contextMenu: { items: (_node, defaults) => defaults.filter(entry => entry.type === 'separator' || entry.id !== 'delete') } });
    try {
        for (const id of ['/a.md', '/b.md']) { swipe(f.row(id)); expect(f.button(id)).toBeNull(); }
        swipe(f.row('/folder')); expect(f.button('/folder')!.hidden).toBe(false);
        physicalClick(f.button('/folder')!); expect(onQuickDelete).not.toHaveBeenCalled();
        physicalClick(f.button('/folder')!); await vi.waitFor(() => expect(onQuickDelete).toHaveBeenCalledOnce());
    } finally { await f.destroy(); }
});

it('removes the entry and confirmation when permission changes and rejects stale DOM clicks', async () => {
    const f = await fixture();
    try {
        const remove = vi.spyOn(f.fs.driver, 'delete');
        swipe(f.row()); physicalClick(f.button()!); const stale = f.button()!;
        await f.fs.driver.updateMetadata('/a.md', { _readOnly: true }); await f.ui.refresh();
        stale.click(); expect(f.button()).toBeNull(); expect(remove).not.toHaveBeenCalled();
        await f.fs.driver.updateMetadata('/a.md', { _readOnly: false }); await f.ui.refresh();
        expect(f.button()!.hidden).toBe(true); swipe(f.row());
        expect(f.button()!.dataset.action).toBe('delete-init');
    } finally { await f.destroy(); }
});

it('rechecks current menu permission on the second click even without refreshing the DOM', async () => {
    let allowed = true;
    const f = await fixture({ contextMenu: { items: (_node, defaults) => allowed ? defaults
        : defaults.filter(entry => entry.type === 'separator' || entry.id !== 'delete') } });
    try {
        const remove = vi.spyOn(f.fs.driver, 'delete');
        swipe(f.row()); physicalClick(f.button()!); allowed = false; physicalClick(f.button()!);
        expect(remove).not.toHaveBeenCalled(); expect(f.button()).toBeNull();
        allowed = true; await f.ui.refresh(); expect(f.button()!.hidden).toBe(true);
    } finally { await f.destroy(); }
});

it('preserves a failed host row, reports its actionable cause, logs metadata and permits a retry without duplicate calls', async () => {
    const failure = new Error('Source operation failed', { cause: Object.assign(new Error('storage quota exceeded'), { code: 'ENOSPC' }) });
    let reject!: (error: unknown) => void;
    const run = vi.fn().mockImplementationOnce(() => new Promise<void>((_resolve, fail) => { reject = fail; }))
        .mockResolvedValue(undefined);
    const alert = vi.fn(); vi.stubGlobal('alert', alert);
    const logs = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const f = await fixture({ listItems: items => items.map(node => ({ ...node, presentation: { quickDelete: true } })), onQuickDelete: run });
    try {
        swipe(f.row()); physicalClick(f.button()!); physicalClick(f.button()!);
        await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
        await f.ui.refresh(); physicalClick(f.button()!); physicalClick(f.button()!);
        expect(run).toHaveBeenCalledOnce(); reject(failure);
        await vi.waitFor(() => expect(alert).toHaveBeenCalledWith('storage quota exceeded'));
        expect(f.button()!.hidden).toBe(false); expect(f.button()!.dataset.action).toBe('delete-init');
        physicalClick(f.button()!); physicalClick(f.button()!);
        await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
        expect(logs).toHaveBeenCalledWith('[vfs-ui:row-delete]', expect.objectContaining({
            operation: 'quickDelete', operationId: expect.any(String), stage: 'host-delete', result: 'failed', category: 'ENOSPC', durationMs: expect.any(Number) }));
        const serialized = JSON.stringify(logs.mock.calls);
        for (const secret of ['private body', '/a.md', 'storage quota exceeded']) expect(serialized).not.toContain(secret);
    } finally { await f.destroy(); }
});

it('retains a file on delete failure, reports a specific reason and retries through the same pipeline', async () => {
    const alert = vi.fn(); vi.stubGlobal('alert', alert);
    const f = await fixture();
    try {
        const remove = vi.spyOn(f.fs.driver, 'delete').mockRejectedValueOnce(Object.assign(new Error('blocked'), { code: 'EACCES' }));
        swipe(f.row()); physicalClick(f.button()!); physicalClick(f.button()!);
        await vi.waitFor(() => expect(alert).toHaveBeenCalledWith('删除失败: 没有删除该项目的权限'));
        expect(f.button()).not.toBeNull();
        physicalClick(f.button()!); physicalClick(f.button()!);
        await vi.waitFor(() => expect(f.container.querySelector('[data-item-id="/a.md"]')).toBeNull());
        expect(remove).toHaveBeenCalledTimes(2);
    } finally { await f.destroy(); }
});

it('closes and disarms a filtered row, then restores it collapsed', async () => {
    let visible = true;
    const f = await fixture({ listItems: items => visible ? items : items.filter(node => node.id !== '/a.md') });
    try {
        swipe(f.row()); physicalClick(f.button()!); await f.ui.refresh();
        expect(f.button()!.hidden).toBe(false); expect(f.button()!.dataset.action).toBe('delete-direct');
        visible = false; await f.ui.refresh(); expect(f.container.querySelector('[data-item-id="/a.md"]')).toBeNull();
        visible = true; await f.ui.refresh();
        expect(f.button()!.hidden).toBe(true); expect(f.button()!.dataset.action).toBe('delete-init');
    } finally { await f.destroy(); }
});

it('rechecks menu authorization in the queued operation before crossing the delete port', async () => {
    let allowed = true;
    const f = await fixture({ contextMenu: { items: (_node, defaults) => allowed ? defaults
        : defaults.filter(entry => entry.type === 'separator' || entry.id !== 'delete') } });
    try {
        const remove = vi.spyOn(f.fs.driver, 'delete');
        swipe(f.row()); physicalClick(f.button()!); physicalClick(f.button()!); allowed = false;
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(remove).not.toHaveBeenCalled(); expect(f.row()).not.toBeNull();
    } finally { await f.destroy(); }
});

it('requires current permission at gesture completion and excludes a read-only view', async () => {
    const f = await fixture();
    try {
        pointer(f.row(), 'pointerdown', 100); pointer(f.row(), 'pointermove', 0);
        await f.fs.driver.updateMetadata('/a.md', { _fixedEntry: true }); await f.ui.refresh();
        pointer(document, 'pointerup', 0); expect(f.button()).toBeNull();
    } finally { await f.destroy(); }
    const readonly = await fixture({ readOnly: true });
    try { swipe(readonly.row()); expect(readonly.button()).toBeNull(); }
    finally { await readonly.destroy(); }
});

it('keeps nested row gestures independent of the parent drawer', async () => {
    const f = await fixture({ listItems: items => items.map(node => node.type === 'directory'
        ? { ...node, presentation: { quickDelete: true, layout: 'drawer' as const } } : node) });
    try {
        await f.fs.driver.createFile({ parentPath: '/folder', name: 'child.md', content: '' });
        await f.ui.expandPath('/folder');
        swipe(f.row('/folder/child.md'));
        expect(f.button('/folder/child.md')!.hidden).toBe(false); expect(f.button('/folder')!.hidden).toBe(true);
        swipe(f.row('/folder'));
        expect(f.button('/folder/child.md')!.hidden).toBe(true); expect(f.button('/folder')!.hidden).toBe(false);
    } finally { await f.destroy(); }
});

it('rejects hidden control clicks and allows a small tap to activate normally', async () => {
    const activate = vi.fn(); const f = await fixture(); f.ui.on('resourceActivated', activate);
    try {
        f.button()!.click(); expect(f.button()!.dataset.action).toBe('delete-init');
        const content = f.row().querySelector<HTMLElement>('[data-action="select-and-open"]')!;
        swipe(content, -4, 3);
        content.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
        expect(activate).toHaveBeenCalledOnce(); expect(f.button()!.hidden).toBe(true);
    } finally { await f.destroy(); }
});

it('releases document listeners, cancels an in-flight gesture and leaves a second mounted list functional on destroy', async () => {
    const addListener = vi.spyOn(document, 'addEventListener');
    const first = await fixture();
    const pointerListeners = addListener.mock.calls.filter(([type]) => ['pointermove', 'pointerup', 'pointercancel'].includes(type));
    const signals = pointerListeners.map(([, , options]) => (options as AddEventListenerOptions).signal!);
    expect(signals).toHaveLength(3); expect(signals.every(signal => !signal.aborted)).toBe(true);
    const second = await fixture();
    try {
        pointer(first.row(), 'pointerdown', 100); pointer(first.row(), 'pointermove', 0);
        const staleBody = first.row().parentElement!, staleRow = first.row();
        first.ui.destroy(); expect(signals.every(signal => signal.aborted)).toBe(true);
        pointer(document, 'pointerup', 0); swipe(staleRow); staleBody.click();
        expect(staleBody.querySelector('.vfs-node-item__main-row--swipe-open')).toBeNull();
        swipe(second.row()); expect(second.button()!.hidden).toBe(false);
    } finally { await first.destroy(); await second.destroy(); }
});
it('uses the current confirmation callback after swipe without adding inline confirmation', async () => {
    const confirmDelete = vi.fn(async () => false), f = await fixture({confirmDelete});
    try {
        const remove = vi.spyOn(f.fs.driver, 'delete'); swipe(f.row()); physicalClick(f.button()!);
        await vi.waitFor(() => expect(confirmDelete).toHaveBeenCalledOnce());
        expect(f.button()!.dataset.action).toBe('delete-init'); expect(remove).not.toHaveBeenCalled();
        confirmDelete.mockResolvedValueOnce(true); physicalClick(f.button()!);
        await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce());
        expect(confirmDelete).toHaveBeenCalledTimes(2);
    } finally {await f.destroy();}
});
