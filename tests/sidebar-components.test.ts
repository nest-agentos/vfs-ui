// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {Sidebar, FilterPanel} from '../src';

const cleanup: Array<() => void> = [];
afterEach(() => {for (const close of cleanup.splice(0).reverse()) close(); document.body.replaceChildren(); vi.restoreAllMocks();});
it('retains navigation views, restores selection and reports resizing without owning storage', () => {
    const host = document.createElement('aside'), changed = vi.fn(); document.body.append(host);
    const sidebar = new Sidebar({container: host, title: 'Resources', state: {view: 'agents', width: 300}, changed});
    cleanup.push(() => sidebar.destroy());
    const content = document.createElement('input'); content.value = 'draft';
    sidebar.addDrawer('agents', 'Agents', content);
    expect(sidebar.activeView).toBe('agents'); expect(host.contains(content)).toBe(true);
    host.querySelector<HTMLElement>('[data-sidebar-view=agents]')!.dispatchEvent(new KeyboardEvent('keydown', {key: 'Home', bubbles: true}));
    expect(sidebar.activeView).toBe('navigation'); expect(content.value).toBe('draft');
    const resize = host.querySelector<HTMLElement>('[role=separator]')!;
    resize.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}));
    expect(changed).toHaveBeenLastCalledWith({view: 'navigation', width: 316});
});
it('exposes a single window callback and unsubscribes exactly once on destruction', () => {
    const host = document.createElement('aside'), open = vi.fn(), unsubscribe = vi.fn(); document.body.append(host);
    const sidebar = new Sidebar({container: host, title: 'Resources', windowManagement: {open, count: () => 3, subscribe: () => unsubscribe}});
    cleanup.push(() => sidebar.destroy());
    const button = host.querySelector<HTMLButtonElement>('.vfs-window-management')!;
    expect(button.getAttribute('aria-label')).toBe('窗口列表 (3)'); button.click(); expect(open).toHaveBeenCalledWith(button);
    sidebar.destroy(); sidebar.destroy(); expect(unsubscribe).toHaveBeenCalledOnce();
});
it('keeps filter content mounted, escapes chip text and restores focus when closed', () => {
    HTMLDialogElement.prototype.showModal = function () {this.open = true;};
    HTMLDialogElement.prototype.close = function () {this.open = false; this.dispatchEvent(new Event('close'));};
    const filters = new FilterPanel({label: 'Filters', iconOnly: true}), remove = vi.fn();
    cleanup.push(() => filters.destroy()); document.body.append(filters.trigger, filters.summary);
    const input = document.createElement('input'); input.value = 'draft'; filters.content.append(input);
    filters.update([{label: '<img src=x>', remove}]);
    expect(filters.summary.querySelector('img')).toBeNull(); filters.summary.querySelector('button')!.click(); expect(remove).toHaveBeenCalledOnce();
    filters.trigger.click(); expect(document.querySelector('dialog')!.open).toBe(true);
    expect(filters.trigger.getAttribute('aria-expanded')).toBe('true'); document.querySelector('dialog')!.close();
    expect(document.activeElement).toBe(filters.trigger); expect(filters.content.firstChild).toBe(input); expect(input.value).toBe('draft');
});
