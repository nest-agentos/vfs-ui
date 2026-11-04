import { expect, it, vi } from 'vitest';
import { SourceAdapter } from '../src/browser/SourceAdapter';
import { VFSStore } from '../src/services/VFSStore';
import type { BrowserNode, SourceChange } from '../src/contracts/source';

it('refreshes only affected loaded parents and retains sibling subtrees', async () => {
  const directory = (id: string): BrowserNode => ({ id, parentId: null, kind: 'directory', label: id });
  let changed!: (event: SourceChange) => void;
  const children = vi.fn(async (id: string | null): Promise<BrowserNode[]> => id === null
    ? [directory('a'), directory('b'), directory('unopened')]
    : [{ id: id + '-child', parentId: id, kind: 'file', label: id + '-child' }]);
  const source = { children, get: async () => undefined, subscribe: (cb: typeof changed) => { changed = cb; return () => {}; } };
  const store = new VFSStore(), adapter = new SourceAdapter(source, store);
  adapter.connectEngineEvents(); await adapter.loadData();
  await adapter.expandDirectory('a'); await adapter.expandDirectory('b'); children.mockClear();
  changed({ parentIds: ['a', 'a', 'unopened'] });
  await vi.waitFor(() => expect(children).toHaveBeenCalledOnce());
  expect(children.mock.calls[0][0]).toBe('a');
  expect(store.getState().items.find(node => node.id === 'b')?.children?.[0].id).toBe('b-child');
  children.mockClear(); changed({ parentIds: [null] });
  await vi.waitFor(() => expect(children).toHaveBeenCalledOnce());
  expect(children.mock.calls[0][0]).toBeNull();
  expect(store.getState().items.find(node => node.id === 'b')?.children?.[0].id).toBe('b-child');
  adapter.destroy();
});

it('maps moves to both parents and ignores changes outside a scoped VFS root', async () => {
  const { fromVFS } = await import('../src/browser/from-vfs');
  const events = new Map<string, (event: any) => void>(), listener = vi.fn();
  const fs = { on: (name: string, callback: (event: any) => void) => { events.set(name, callback); return () => events.delete(name); } };
  const unsubscribe = fromVFS(fs as any, { root: '/scope' }).subscribe(listener);
  events.get('node:moved')!({ payload: { nodes: [{ oldPath: '/scope/a/file', newPath: '/scope/b/file' }] } });
  expect(listener).toHaveBeenLastCalledWith({ parentIds: ['/scope/a', '/scope/b'] });
  events.get('node:updated')!({ payload: { nodes: [{ path: '/elsewhere/file' }] } });
  expect(listener).toHaveBeenCalledOnce();
  events.get('node:created')!({ payload: { nodes: [{ path: '/scope/new' }] } });
  expect(listener).toHaveBeenLastCalledWith({ parentIds: [null] });
  unsubscribe(); expect(events.size).toBe(0);
});

it('publishes a refreshed loaded tree once and keeps user collapse choices made during loading', async () => {
  let finish!: (nodes: BrowserNode[]) => void;
  let refreshing = false;
  const children = vi.fn(async (id: string | null): Promise<BrowserNode[]> => {
    if (id === null) return [{ id: 'group', parentId: null, kind: 'directory', label: 'group' }];
    if (refreshing) return new Promise(resolve => { finish = resolve; });
    return [{ id: 'old', parentId: 'group', kind: 'file', label: 'old' }];
  });
  const store = new VFSStore();
  const adapter = new SourceAdapter({ children, get: async () => undefined, subscribe: () => () => {} }, store);
  await adapter.loadData(); await adapter.expandDirectory('group');
  const updates: string[][] = [];
  store.subscribe(state => updates.push(state.items[0].children?.map(item => item.id) ?? []));
  refreshing = true;
  const pending = adapter.loadData({ silent: true });
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  expect(updates).toEqual([]);
  expect(store.getState().items[0].children?.[0].id).toBe('old');
  store.dispatch({ type: 'FOLDER_TOGGLE', payload: { folderId: 'group' } });
  finish([{ id: 'new', parentId: 'group', kind: 'file', label: 'new' }]);
  await pending;
  expect(updates).toEqual([['old'], ['new']]);
  expect(store.getState().expandedFolderIds.has('group')).toBe(false);
  adapter.destroy();
});

it('retains transparent loaded groups and keeps the old tree when refresh fails', async () => {
  let fail = false;
  const children = async (id: string | null): Promise<BrowserNode[]> => {
    if (id === null) return [{ id: 'group', parentId: null, kind: 'directory', label: 'group' }];
    if (fail) throw new Error('Unavailable');
    return [{ id: 'child', parentId: 'group', kind: 'file', label: 'child' }];
  };
  const store = new VFSStore();
  const adapter = new SourceAdapter({ children, get: async () => undefined, subscribe: () => () => {} }, store);
  await adapter.loadData(); await adapter.expandDirectory('group', { expand: false });
  await adapter.loadData({ silent: true });
  expect(store.getState().items[0].children?.[0].id).toBe('child');
  expect(store.getState().expandedFolderIds.has('group')).toBe(false);
  const before = store.getState().items;
  fail = true;
  const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await expect(adapter.loadData({ silent: true })).rejects.toThrow('Unavailable');
  expect(store.getState().items).toBe(before);
  expect(log).toHaveBeenCalledWith('[SourceAdapter] refresh failed', expect.objectContaining({ stage: 'prepare', category: 'Error', result: 'failure' }));
  log.mockRestore(); adapter.destroy();
});
