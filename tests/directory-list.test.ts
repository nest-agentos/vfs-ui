// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {FSError} from '@itookit/vfs-core';
import {createDirectoryList, refreshDirectoryList, relocateDirectoryList} from '../src/index';

afterEach(() => document.body.replaceChildren());

it('shows creation time last, sorts timestamps chronologically and keeps missing values readable', () => {
    const list = createDirectoryList({title: 'Resources', path: '/', open() {}, entries: [
        {id: '/a', name: 'A', type: 'file', created: '2026-02-01T00:00:00Z'},
        {id: '/b', name: 'B', type: 'file', created: 1700000000000},
        {id: '/c', name: 'C', type: 'file', created: 'invalid'},
        {id: '/d', name: 'D', type: 'file'},
    ], presentation: {locale: 'en-US'}});
    expect([...list.querySelectorAll('th')].map(cell => cell.dataset.column)).toEqual(['name', 'size', 'modified', 'type', 'created']);
    expect(list.querySelector('[data-resource-id="/b"] td:last-child')?.textContent).toBe(new Date(1700000000000).toLocaleString('en-US'));
    expect(list.querySelector('[data-resource-id="/c"] td:last-child')?.textContent).toBe('—');
    expect(list.querySelector('[data-resource-id="/d"] td:last-child')?.textContent).toBe('—');
    const sort = list.querySelector<HTMLButtonElement>('th[data-column="created"] button')!;
    sort.click(); expect([...list.querySelectorAll('tbody tr')].map(row => (row as HTMLElement).dataset.resourceId)).toEqual(['/c', '/d', '/b', '/a']);
    sort.click(); expect(list.querySelector('tbody tr')?.getAttribute('data-resource-id')).toBe('/a');
});

it('injects presentation and business actions independently for each instance', async () => {
    const open = vi.fn(), toggle = vi.fn(async () => {}), trace = vi.fn(async (_name, work) => work());
    const make = (prefix: string) => createDirectoryList({title: prefix, path: '/', open, entries: [{id: 'resource', name: '<script>', type: 'custom'}],
        favorite: {state: () => false, toggle}, presentation: {t: key => `${prefix}:${key}`, entryType: () => `${prefix}:custom`,
            fileIcon: () => '<svg data-custom-icon="yes"></svg>', trace}});
    const first = make('first'), second = make('second');
    expect(first.querySelector('th')?.textContent).toBe('first:name'); expect(second.querySelector('th')?.textContent).toBe('second:name');
    expect(first.querySelector('td:nth-child(4)')?.textContent).toBe('first:custom');
    expect(first.querySelector('script')).toBeNull(); expect(first.querySelector('[data-custom-icon]')).not.toBeNull();
    first.querySelector<HTMLButtonElement>('.workbench-directory__name')!.click(); expect(open).toHaveBeenCalledWith('resource');
    first.querySelector<HTMLButtonElement>('[data-action="favorite-toggle"]')!.click();
    await vi.waitFor(() => expect(toggle).toHaveBeenCalledWith('resource'));
    expect(trace).toHaveBeenCalledWith('directory.favorite', expect.any(Function));
});

it('exposes refresh failures to the host trace, handles missing directories and retains five-column empty state', async () => {
    const trace = vi.fn(async (_name, work) => work());
    const refresh = vi.fn(async () => {throw new FSError('ENOENT', 'Gone', 'list', '/');});
    const list = createDirectoryList({title: 'Resources', path: '/', entries: [], open() {}, refresh, presentation: {trace}});
    await refreshDirectoryList(list);
    expect(list.querySelector('[role="status"]')?.hasAttribute('hidden')).toBe(false);
    expect(list.querySelector('tbody td')?.colSpan).toBe(5);
    expect(trace).toHaveBeenCalledWith('directory.refresh', expect.any(Function));
    refresh.mockRejectedValueOnce(new FSError('EACCES', 'Access denied', 'list', '/'));
    await expect(refreshDirectoryList(list)).rejects.toMatchObject({code: 'EACCES'});
});

it('discards a refresh from the previous directory after relocation', async () => {
    let finish!: (entries: never[]) => void;
    const refresh = vi.fn().mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}))
        .mockResolvedValue([{id: '/new/note.md', name: 'note.md', type: 'file'}]);
    const list = createDirectoryList({title: 'old', path: '/old', entries: [], open() {}, refresh});
    const pending = refreshDirectoryList(list);
    relocateDirectoryList(list, '/new', 'new', [{id: '/new', label: 'new'}]); finish([]); await pending;
    expect(refresh).toHaveBeenCalledTimes(2); expect(list.querySelector('tbody tr')?.getAttribute('data-resource-id')).toBe('/new/note.md');
});
