// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {deleteBrowserResource} from '../src/browser/deletion';
const node = {id: 'resource', parentId: null, kind: 'file' as const, label: 'Resource'};
afterEach(() => {document.body.replaceChildren(); vi.restoreAllMocks();});
function modal() {
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
        const element = create(tag); if (tag === 'dialog') Object.assign(element, {showModal: () => element.setAttribute('open', '')}); return element;
    }) as typeof document.createElement);
}

it('confirms lifecycle deletion with selected cleanup choices and safely renders text', async () => {
    modal(); const remove = vi.fn(async (..._args: unknown[]) => {}), preview = vi.fn(async () => ({message: '<script>unsafe</script>', choices: [{id: 'cleanup', label: 'Clean resources', checked: true}]}));
    const work = deleteBrowserResource({label: 'Delete', cancelLabel: 'Cancel', preview, remove}, node, new AbortController().signal);
    await vi.waitFor(() => expect(document.querySelector('dialog')).not.toBeNull());
    expect(document.querySelector('script')).toBeNull();
    document.querySelectorAll<HTMLButtonElement>('dialog button')[1].click(); await work;
    expect(remove).toHaveBeenCalledOnce(); expect(remove.mock.calls[0][2]).toEqual(new Set(['cleanup']));
});
it('blocks unsafe deletion, and cancel or destruction never invokes the lifecycle', async () => {
    modal(); const remove = vi.fn(async (..._args: unknown[]) => {}), abort = new AbortController();
    const work = deleteBrowserResource({label: 'Delete', cancelLabel: 'Cancel', preview: async () => ({message: 'Running', blocked: true}), remove}, node, abort.signal);
    await vi.waitFor(() => expect(document.querySelector('dialog')).not.toBeNull());
    expect(document.querySelectorAll<HTMLButtonElement>('dialog button')[1].disabled).toBe(true);
    abort.abort(); await work; expect(remove).not.toHaveBeenCalled(); expect(document.querySelector('dialog')).toBeNull();
});
it('replaces the default second step with a caller confirmation, including cancellation', async () => {
    const remove = vi.fn(async () => {}), confirm = vi.fn(async () => undefined as ReadonlySet<string> | undefined);
    const port = {label: 'Delete', cancelLabel: 'Cancel', preview: async () => ({message: 'Impact'}), confirm, remove};
    await deleteBrowserResource(port, node, new AbortController().signal);
    expect(confirm).toHaveBeenCalledOnce(); expect(document.querySelector('dialog')).toBeNull(); expect(remove).not.toHaveBeenCalled();
    confirm.mockResolvedValueOnce(new Set()); await deleteBrowserResource(port, node, new AbortController().signal);
    expect(remove).toHaveBeenCalledOnce(); expect(document.querySelector('dialog')).toBeNull();
});
it('opens exactly one confirmation from a logical resource row, without the inline second click', async () => {
    modal(); const {createVFSBrowser} = await import('../src');
    const remove = vi.fn(async () => {}), root = document.createElement('div'); document.body.append(root);
    const file = {...node, deletable: true};
    const browser = createVFSBrowser({container: root, source: {get: async () => file, children: async () => [file], subscribe: () => () => {}},
        deletion: {label: 'Delete', cancelLabel: 'Cancel', preview: async () => ({message: 'Impact'}), remove}});
    try {
        await browser.start(); root.querySelector<HTMLElement>('[data-action="delete-init"]')!.click();
        await vi.waitFor(() => expect(document.querySelectorAll('dialog')).toHaveLength(1));
        expect(root.querySelector('[data-action="delete-direct"]')).toBeNull();
        document.querySelectorAll<HTMLButtonElement>('dialog button')[1].click();
        await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce());
        expect(document.querySelector('dialog')).toBeNull();
    } finally {browser.destroy();}
});
