import type { DirectoryPresentation } from './presentation';
import { decorateButton } from './controls';
import type { ResolvedDirectoryListOptions } from './directory-list';

/** Source queries and local filters share one responsive toolbar and search lifecycle. */
export class DirectoryToolbar {
    readonly element = document.createElement('div');
    readonly input = document.createElement('input');
    private readonly group = document.createElement('div');
    private readonly presentation: DirectoryPresentation;
    private focused = false;
    private localSearch?: HTMLButtonElement;
    constructor(private readonly options: ResolvedDirectoryListOptions, refresh: () => void, private readonly render: () => void) {
        this.presentation = options.presentation;
        this.element.className = 'workbench-directory__toolbar'; this.element.dataset.overflow = String(!!options.menu);
        if (options.parent && !options.breadcrumbs) this.element.append(this.button(this.presentation.t('parent'), options.parent, this.presentation.icons.up));
        if (options.refresh) this.element.append(this.button(this.presentation.t('refresh'), refresh, this.presentation.icons.refresh));
        this.addActions(); this.addSearch(); this.addMenu();
    }
    get query(): string { return this.input.value; }
    get filtering(): boolean { return !!this.options.search && !!this.query.trim(); }
    get searching(): boolean { return !!this.query.trim() || this.focused; }
    sync(): void {
        this.element.dataset.searching = String(this.searching);
        if (this.localSearch) decorateButton(this.localSearch, this.searching ? this.presentation.icons.close : this.presentation.icons.search,
            this.presentation.t(this.searching ? 'clearSearch' : 'filter'), true);
    }
    private button(label: string, run: () => void, icon?: string, iconOnly = true): HTMLButtonElement {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.onclick = run;
        return icon ? decorateButton(button, icon, label, iconOnly) : button;
    }
    private addActions(): void {
        for (const entry of this.options.actions ?? []) {
            const button = this.button(entry.label, entry.run, entry.icon, entry.iconOnly ?? true);
            button.disabled = !!entry.disabled; button.dataset.directoryAction = entry.disabled ? 'disabled' : 'enabled';
            if (entry.disabled && entry.disabledReason) button.title = entry.disabledReason;
            if (entry.id) button.dataset.action = entry.id;
            if (entry.primary) button.dataset.variant = 'primary';
            this.element.append(button);
        }
    }
    private addMenu(): void {
        if (!this.options.menu) return;
        const more = this.button(this.presentation.t('actions'), () => {
            const rect = more.getBoundingClientRect(); this.options.menu!(new MouseEvent('contextmenu', {clientX: rect.left, clientY: rect.bottom}));
        }, this.presentation.icons.more);
        more.dataset.action = 'directory-menu'; this.element.append(more);
    }
    private addSearch(): void {
        this.group.className = 'workbench-directory__search'; this.input.type = 'search';
        this.input.placeholder = this.presentation.t(this.options.search ? 'search' : 'filter');
        this.input.setAttribute('aria-label', this.input.placeholder); this.group.append(this.input);
        if (this.options.search?.controls) this.group.append(this.options.search.controls);
        else {
            this.localSearch = this.button(this.presentation.t('filter'), () => this.searching ? this.apply('') : this.input.focus(), this.presentation.icons.search);
            this.localSearch.dataset.action = 'toggle-search'; this.group.append(this.localSearch);
        }
        this.element.append(this.group);
        this.options.search?.controls?.addEventListener('change', () => this.input.focus());
        this.input.oninput = () => this.changed();
        this.group.addEventListener('focusin', event => { if (event.target === this.input) this.focused = true; this.render(); });
        this.group.addEventListener('focusout', () => queueMicrotask(() => {
            if (!this.group.contains(document.activeElement)) this.focused = false;
            this.render();
        }));
        this.group.onkeydown = event => { if (event.key === 'Escape') this.apply(''); };
    }
    private apply(query: string): void {
        this.input.value = query;
        if (!query) { this.focused = false; this.input.blur(); }
        this.changed();
    }
    private changed(): void {
        this.options.search?.setQuery(this.query, query => this.apply(query)); this.render();
    }
}
