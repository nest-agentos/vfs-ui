import { DirectoryToolbar } from './directory-toolbar';
import { installColumnResize } from './column-resize';
import { resolveDirectoryPresentation, type DirectoryPresentation, type DirectoryPresentationOptions } from './presentation';
import { decorateButton } from './controls';
import { formatDisplayLabel } from '../utils/display-label';
import { formatFileSize } from '../utils/file-size';
import { DirectorySelection, type DirectoryBulkAction } from './directory-selection';
import { FSError, matchesKeywords, searchKeywords } from '@nestos/vfs-core';
import { createDirectoryBreadcrumbs, type DirectoryBreadcrumb } from './directory-breadcrumbs';

export interface DirectoryEntry {
    id: string; name: string; type: string; created?: string | number; modified?: string | number;
    size?: number; icon?: string; disabled?: boolean; description?: string; priority?: number;
}
export type DirectorySortKey = 'name' | 'size' | 'modified' | 'type' | 'created';
export interface DirectoryListOptions {
    title: string; path: string; entries: DirectoryEntry[];
    presentation?: DirectoryPresentationOptions;
    breadcrumbs?: DirectoryBreadcrumb[];
    openDirectory?(id: string): void;
    initialSort?: {key: DirectorySortKey; ascending: boolean};
    open(id: string): void; parent?: () => void; refresh?: () => Promise<DirectoryEntry[]>;
    actions?: { id?: string; primary?: boolean; label: string; run(): void; disabled?: boolean; disabledReason?: string; icon?: string; iconOnly?: boolean }[];
    menu?: (event: MouseEvent) => void;
    contextMenu?: (event: MouseEvent, id: string) => void;
    favorite?: { state(id: string): boolean | undefined; toggle(id: string): Promise<void> };
    select?: (ids: string[]) => void;
    selectedIds?: () => readonly string[];
    bulkActions?: DirectoryBulkAction[];
    search?: {element: HTMLElement; controls?: HTMLElement; setQuery(query: string, apply?: (query: string) => void): void; refresh(): void};
}
export type ResolvedDirectoryListOptions = Omit<DirectoryListOptions, 'presentation'> & {presentation: DirectoryPresentation};
const refreshers = new WeakMap<HTMLElement, () => Promise<void>>();
const selectionRefreshers = new WeakMap<HTMLElement, () => void>();
const relocators = new WeakMap<HTMLElement, (path: string, title: string, breadcrumbs: DirectoryBreadcrumb[]) => void>();
export function relocateDirectoryList(panel: HTMLElement, path: string, title: string, breadcrumbs: DirectoryBreadcrumb[]): void {
    const list = panel.matches('.workbench-directory') ? panel : panel.querySelector<HTMLElement>('.workbench-directory');
    if (list) relocators.get(list)?.(path, title, breadcrumbs);
}
export function refreshDirectorySelection(panel: HTMLElement): void {
    const list = panel.matches('.workbench-directory') ? panel : panel.querySelector<HTMLElement>('.workbench-directory');
    if (list) selectionRefreshers.get(list)?.();
}
export async function refreshDirectoryList(panel: HTMLElement): Promise<void> {
    const list = panel.matches('.workbench-directory') ? panel : panel.querySelector<HTMLElement>('.workbench-directory');
    if (list) await refreshers.get(list)?.();
}
const date = (presentation: DirectoryPresentation, value?: string | number) => value !== undefined && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString(presentation.locale) : '—';

/** Display labels are bounded; full names and creation time remain in the tooltip. */
export function createDirectoryList(input: DirectoryListOptions): HTMLElement {
    const options: ResolvedDirectoryListOptions = {...input, presentation: resolveDirectoryPresentation(input.presentation)};
    const presentation = options.presentation;
    const {panel, heading, header, path, missing, fail} = createDirectoryLayout(options);
    const refresh = async () => { await refreshEntries(options, missing, toolbar.element, () => render()); options.search?.refresh(); };
    refreshers.set(panel, refresh);
    const toolbar = new DirectoryToolbar(options, () => { void refresh().catch(fail); }, () => render());
    const scroll = document.createElement('div'); scroll.className = 'workbench-directory__table-scroll';
    const table = document.createElement('table'); scroll.append(table); table.className = 'workbench-directory__table';
    const head = table.createTHead().insertRow(), body = table.createTBody();
    let sort: DirectorySortKey = options.initialSort?.key ?? 'name', ascending = options.initialSort?.ascending ?? true;
    const selection = options.select ? new DirectorySelection(options.select, () => render(), options.bulkActions ?? [], refresh, fail, presentation) : undefined;
    addHeaders(head, selection, presentation, key => { ascending = sort === key ? !ascending : true; sort = key; render(); });
    const render = () => {
        if (options.selectedIds) selection?.restore(options.selectedIds(), options.entries.map(entry => entry.id));
        const searching = toolbar.filtering;
        toolbar.sync(); panel.dataset.searching = String(toolbar.searching);
        table.hidden = searching; scroll.hidden = searching;
        if (selection) selection.bar.hidden = searching;
        if (!searching) renderEntries(body, options, toolbar.query, sort, ascending, selection);
    };
    selectionRefreshers.set(panel, render);
    bindDirectoryRelocation(options, panel, heading, path, render);
    panel.append(header, path, toolbar.element, missing);
    if (selection) panel.append(selection.bar); if (options.search) panel.append(options.search.element); panel.append(scroll);
    render(); return panel;
}
function createDirectoryLayout(options: ResolvedDirectoryListOptions) {
    const presentation = options.presentation;
    const panel = document.createElement('section'); panel.className = 'workbench-directory';
    const heading = document.createElement('h2'); heading.textContent = options.title;
    const header = document.createElement('div'); header.className = 'workbench-directory__heading'; header.append(heading); header.hidden = !!options.breadcrumbs; panel.setAttribute('aria-label', options.title);
    const path = options.breadcrumbs ? createDirectoryBreadcrumbs(options.breadcrumbs, options.openDirectory ?? options.open, presentation)
        : document.createElement('p');
    if (!options.breadcrumbs) { path.className = 'workbench-directory__path'; path.textContent = options.path; }
    const fail = (error: unknown) => { const notice = document.createElement('p'); notice.setAttribute('role', 'alert'); notice.textContent = error instanceof Error ? error.message : String(error); panel.append(notice); };
    const missing = document.createElement('p'); missing.setAttribute('role', 'status'); missing.hidden = true;
    missing.textContent = presentation.t('directoryMissing');
    return {panel, heading, header, path, missing, fail};
}
function bindDirectoryRelocation(options: ResolvedDirectoryListOptions, panel: HTMLElement, heading: HTMLElement, path: HTMLElement, render: () => void): void {
    const presentation = options.presentation;
    relocators.set(panel, (next, title, breadcrumbs) => {
        const previous = options.path;
        options.entries = options.entries.map(entry => ({...entry, id: next + entry.id.slice(previous.length)}));
        options.path = next; options.title = title; options.breadcrumbs = breadcrumbs;
        heading.textContent = title; panel.setAttribute('aria-label', title);
        const replacement = createDirectoryBreadcrumbs(breadcrumbs, options.openDirectory ?? options.open, presentation);
        path.replaceWith(replacement); path = replacement; render();
    });
}
async function refreshEntries(options: ResolvedDirectoryListOptions, missing: HTMLElement, toolbar: HTMLElement, render: () => void): Promise<void> {
    if (!options.refresh) return;
    const path = options.path;
    try {
        const entries = await options.presentation.trace('directory.refresh', () => options.refresh!());
        if (options.path !== path) return refreshEntries(options, missing, toolbar, render);
        options.entries = entries; missing.hidden = true;
    }
    catch (error) {
        if (options.path !== path) return refreshEntries(options, missing, toolbar, render);
        if (!isMissingDirectory(error)) throw error;
        options.entries = []; missing.hidden = false;
    }
    for (const button of toolbar.querySelectorAll<HTMLButtonElement>('[data-directory-action]'))
        button.disabled = !missing.hidden || button.dataset.directoryAction === 'disabled';
    render();
}
function isMissingDirectory(error: unknown): boolean {
    const seen = new Set<unknown>();
    while (error instanceof Error && !seen.has(error)) {
        seen.add(error);
        if (error instanceof FSError && error.code === 'ENOENT') return true;
        error = error.cause;
    }
    return false;
}
function addHeaders(head: HTMLTableRowElement, selection: DirectorySelection | undefined, presentation: DirectoryPresentation, sort: (key: DirectorySortKey) => void): void {
    for (const key of ['name', 'size', 'modified', 'type', 'created'] as const) {
        const cell = document.createElement('th'); cell.scope = 'col'; cell.dataset.column = key;
        if (key === 'name' && selection) cell.append(selection.all);
        cell.append(action(presentation.t(key), () => sort(key))); installColumnResize(cell, presentation); head.append(cell);
    }
}
function action(label: string, callback: () => void, icon?: string, iconOnly = false): HTMLButtonElement {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.onclick = callback;
    return icon ? decorateButton(button, icon, label, iconOnly) : button;
}
function renderEntries(body: HTMLTableSectionElement, options: ResolvedDirectoryListOptions, query: string, sort: DirectorySortKey, ascending: boolean, selection?: DirectorySelection): void {
    const presentation = options.presentation;
    body.replaceChildren();
    for (const cell of body.parentElement!.querySelectorAll('th')) cell.setAttribute('aria-sort', cell.dataset.column === sort ? ascending ? 'ascending' : 'descending' : 'none');
    const keywords = searchKeywords(query);
    const entries = options.entries.filter(entry => matchesKeywords(`${entry.name} ${entry.description ?? ''}`, keywords))
        .sort((a, b) => compareEntries(a, b, sort, ascending, options.presentation));
    selection?.show(entries.filter(entry => !entry.disabled).map(entry => entry.id), options.entries.map(entry => entry.id));
    for (const entry of entries) renderEntry(body, entry, options, () => renderEntries(body, options, query, sort, ascending, selection), selection);
    if (!entries.length) { const cell = body.insertRow().insertCell(); cell.colSpan = 5; cell.textContent = presentation.t('empty'); }
}
function compareEntries(a: DirectoryEntry, b: DirectoryEntry, sort: DirectorySortKey, ascending: boolean, presentation: DirectoryPresentation): number {
    if (a.priority !== undefined || b.priority !== undefined) {
        const order = (a.priority ?? 0) - (b.priority ?? 0); if (order) return order;
    }
    const directoryOrder = Number(b.type === 'directory') - Number(a.type === 'directory');
    if (directoryOrder) return directoryOrder;
    let comparison: number;
    if (sort === 'size') comparison = (a.size ?? -1) - (b.size ?? -1);
    else if (sort === 'modified' || sort === 'created') comparison = (new Date(a[sort] ?? 0).getTime() || 0) - (new Date(b[sort] ?? 0).getTime() || 0);
    else comparison = String(a[sort] ?? '').localeCompare(String(b[sort] ?? ''), presentation.locale, { numeric: true });
    return comparison * (ascending ? 1 : -1) || a.id.localeCompare(b.id);
}
function renderEntry(body: HTMLTableSectionElement, entry: DirectoryEntry, options: ResolvedDirectoryListOptions, render: () => void, selection?: DirectorySelection): void {
    const presentation = options.presentation;
    const row = body.insertRow(); row.dataset.resourceId = entry.id;
    row.classList.toggle('is-selected', !!selection?.ids.has(entry.id));
    const open = action(entry.name, () => options.open(entry.id), entry.icon ?? options.presentation.fileIcon(entry.name, entry.type === 'directory')); open.className = 'workbench-directory__name'; open.disabled = !!entry.disabled; open.title = entryDetails(entry, options.presentation);
    open.lastElementChild!.textContent = formatDisplayLabel(entry.name);
    open.querySelector('.workbench-icon')!.classList.add('file-type-icon');
    const name = row.insertCell(); name.append(open);
    if (selection) { const checkbox = selection.checkbox(entry.id, entry.name); checkbox.disabled = !!entry.disabled; name.prepend(checkbox); }
    addContextMenu(row, name, entry.id, options.contextMenu, options.presentation);
    addFavorite(name, entry.id, options.favorite, render, options.presentation);
    const size = row.insertCell(); size.textContent = formatFileSize(entry.size); size.dataset.column = 'size';
    if (entry.size !== undefined && Number.isFinite(entry.size) && entry.size >= 0) size.title = `${entry.size.toLocaleString(presentation.locale)} B`;
    row.insertCell().textContent = date(options.presentation, entry.modified);
    row.insertCell().textContent = entryType(entry, options.presentation);
    const created = row.insertCell(); created.dataset.column = 'created'; created.textContent = date(options.presentation, entry.created);
}
function entryDetails(entry: DirectoryEntry, presentation: DirectoryPresentation): string {
    return [entry.name, entry.description,
        `${presentation.t('created')}: ${date(presentation, entry.created)}`,
        `${presentation.t('modified')}: ${date(presentation, entry.modified)}`,
    ].filter(Boolean).join('\n');
}
function entryType(entry: DirectoryEntry, presentation: DirectoryPresentation): string {
    if (entry.type === 'directory') return presentation.t('folder');
    if (presentation.entryType) return presentation.entryType(entry);
    return entry.name.split('.').slice(1).pop()?.toUpperCase() || presentation.t('file');
}
function addContextMenu(row: HTMLTableRowElement, name: HTMLTableCellElement, id: string, contextMenu: DirectoryListOptions['contextMenu'], presentation: DirectoryPresentation): void {
    if (!contextMenu) return;
    row.oncontextmenu = event => contextMenu(event, id);
    const menu = action(presentation.t('actions'), () => {
        const bounds = menu.getBoundingClientRect(); contextMenu(new MouseEvent('contextmenu', { clientX: bounds.left, clientY: bounds.bottom }), id);
    }, presentation.icons.more, true); menu.className = 'workbench-directory__row-action'; name.append(menu);
}
function addFavorite(name: HTMLTableCellElement, id: string, favorite: DirectoryListOptions['favorite'], render: () => void, presentation: DirectoryPresentation): void {
    const state = favorite?.state(id); if (state === undefined || !favorite) return;
    const toggle = action(presentation.t(state ? 'unfavorite' : 'favorite'), () => {
        void presentation.trace('directory.favorite', () => favorite.toggle(id)).then(render).catch(error => {
            const notice = document.createElement('span'); notice.textContent = String(error); notice.setAttribute('role', 'alert'); name.append(notice);
        });
    }, presentation.icons.favorite, true); toggle.className = 'workbench-directory__row-action';
    toggle.dataset.action = 'favorite-toggle'; toggle.setAttribute('aria-pressed', String(state)); name.append(toggle);
}
