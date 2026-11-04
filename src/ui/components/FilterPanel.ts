import {createPresentation, type VFSPresentation, type VFSPresentationOptions} from '../../contracts/presentation';
import {escapeHTML} from '../../utils/html';

export interface FilterPanelOptions {label: string; iconOnly?: boolean; iconHTML?: string}
export interface FilterChip { label: string; remove(): void }

/** A shared filter surface keeps the same controls mounted across screen sizes. */
export class FilterPanel {
    readonly trigger = document.createElement('button');
    readonly summary = document.createElement('div');
    readonly content = document.createElement('div');
    private readonly dialog = document.createElement('dialog');
    private readonly abort = new AbortController();
    private readonly label: string;
    private readonly ui: VFSPresentation;
    constructor(private readonly options: FilterPanelOptions, presentation?: VFSPresentationOptions) {
        this.label = options.label; this.ui = createPresentation(presentation);
        const label = this.label;
        this.trigger.type = 'button'; this.trigger.className = 'vfs-filter-panel__trigger';
        this.trigger.setAttribute('aria-haspopup', 'dialog'); this.trigger.setAttribute('aria-expanded', 'false');
        this.renderTrigger(label);
        this.trigger.classList.toggle('vfs-filter-panel__trigger--icon', !!options.iconOnly);
        this.summary.className = 'vfs-filter-panel__summary'; this.summary.hidden = true;
        this.content.className = 'vfs-filter-panel__content'; this.dialog.className = 'vfs-filter-panel';
        this.dialog.setAttribute('aria-label', label);
        const header = document.createElement('div'), title = document.createElement('strong'), close = document.createElement('button');
        header.className = 'vfs-filter-panel__header'; title.textContent = label; close.type = 'button';
        close.innerHTML = this.ui.icon('close'); close.title = this.ui.t('action.close'); close.setAttribute('aria-label', close.title);
        close.onclick = () => this.dialog.close(); header.append(title, close); this.dialog.append(header, this.content);
        this.trigger.onclick = () => this.open();
        this.dialog.addEventListener('close', () => { this.trigger.setAttribute('aria-expanded', 'false'); this.trigger.focus(); });
        this.dialog.addEventListener('click', event => { if (event.target === this.dialog) this.dialog.close(); });
        window.addEventListener('resize', () => this.position(), {signal: this.abort.signal});
    }
    update(chips: FilterChip[]): void {
        const label = this.label + (chips.length ? ` (${chips.length})` : '');
        this.renderTrigger(label);
        this.trigger.setAttribute('aria-label', label); this.summary.hidden = !chips.length;
        this.summary.replaceChildren(...chips.map(chip => {
            const button = document.createElement('button'); button.type = 'button'; button.textContent = chip.label;
            button.title = this.ui.t('workbench.removeFilter', {name: chip.label}); button.setAttribute('aria-label', button.title);
            button.onclick = chip.remove; return button;
        }));
    }
    private renderTrigger(label: string): void {
        this.trigger.innerHTML = (this.options.iconHTML ?? this.ui.icon('filter')) + (this.options.iconOnly ? '' : `<span>${escapeHTML(label)}</span>`);
        this.trigger.title = label; this.trigger.setAttribute('aria-label', label);
    }
    private open(): void {
        if (this.dialog.open) return;
        if (!this.dialog.isConnected) document.body.append(this.dialog);
        this.position(); this.dialog.showModal(); this.trigger.setAttribute('aria-expanded', 'true');
    }
    private position(): void {
        const rect = this.trigger.getBoundingClientRect();
        this.dialog.style.setProperty('--filter-top', `${Math.min(rect.bottom + 8, Math.max(8, window.innerHeight - 360))}px`);
        this.dialog.style.setProperty('--filter-left', `${Math.max(8, Math.min(rect.right - 320, window.innerWidth - 328))}px`);
    }
    destroy(): void { this.abort.abort(); if (this.dialog.open) this.dialog.close(); this.dialog.remove(); }
}
