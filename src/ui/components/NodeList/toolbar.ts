import { defaultPresentation, type VFSPresentation } from '../../../contracts/presentation';
import type { VFSNodeUI, MenuItem } from '../../../contracts/types';
import { escapeHTML } from '../../../utils/local';

export type VFSToolbarAction = string;
export interface VFSToolbarContext { selectedIds: string[]; activeId: string | null; parentPath: string | null }
export interface VFSActionContext extends VFSToolbarContext {
    origin: 'toolbar' | 'menu';
    target: VFSNodeUI | null;
    readonly: boolean;
}
export type VFSActionPlacement = 'toolbar' | 'menu' | 'both' | 'hidden';
/** One host-owned command definition shared by toolbar and resource menu. */
export interface VFSActionDefinition {
    id: string;
    label: string;
    iconHTML?: string;
    placement: VFSActionPlacement | ((context: VFSActionContext) => VFSActionPlacement);
    disabled?(context: VFSActionContext): boolean;
    run(context: VFSActionContext, signal: AbortSignal): Promise<void>;
}
export function actionVisible(action: VFSActionDefinition, context: VFSActionContext): boolean {
    const placement = typeof action.placement === 'function' ? action.placement(context) : action.placement;
    return placement === 'both' || placement === context.origin;
}
export function actionMenuItems(definitions: readonly VFSActionDefinition[], context: VFSActionContext,
    run: (id: string, item: VFSNodeUI) => Promise<void>): MenuItem[] {
    return definitions.filter(action => actionVisible(action, context)).map(action => ({
        id: action.id, label: action.label, iconHTML: action.iconHTML, disabled: action.disabled?.(context),
        onClick: item => run(action.id, item),
    }));
}
export interface VFSToolbarOptions {
    /** Compact toolbars default to a menu; inline keeps controls in the title bar. */
    compactLayout?: 'menu' | 'inline';
    /** Inline compact primary action stays visible independently of action ordering. */
    primaryAction?: VFSToolbarAction;
    extraItems?: readonly { id: string; label: string; iconHTML?: string; placement?: 'toolbar' | 'overflow'; after?: VFSToolbarAction }[];
    /** Keep infrequent built-in actions in the menu at every viewport width. */
    overflowActions?: readonly VFSToolbarAction[];
    /** Keep selected actions on the bar at every viewport width. */
    inlineActions?: readonly VFSToolbarAction[];
    /** A visible touch-friendly switch for the browser's selection mode. */
    selectionToggle?: boolean;
    /** Compact borderless controls for a host-owned header. */
    variant?: 'default' | 'plain';
    definitions?: readonly VFSActionDefinition[];
    items?: readonly { id: string; label: string; disabled?: boolean }[];
    hiddenActions?: VFSToolbarAction[];
    iconOnlyActions?: readonly VFSToolbarAction[];
    fileLabel?: string;
    fileTitle?: string;
    directoryLabel?: string;
    directoryFirst?: boolean;
    /** Optional root navigation beside the built-in refresh control. */
    root?: { label: string; title: string; run(): Promise<void> };
    actions?: Partial<Record<VFSToolbarAction, (context: VFSToolbarContext) => Promise<void>>>;
    /** A compact title-bar action, such as returning to the navigation list. */
    secondary?: { label: string; run(): void };
}

/** Inline navigation uses icons and keeps explicitly declared toolbar actions visible. */
export function inlineToolbarOptions(options: VFSToolbarOptions): VFSToolbarOptions {
    const builtins = ['create-file', 'create-directory', 'open-root', 'refresh'];
    const declared = options.definitions?.map(action => action.id) ?? options.items?.map(item => item.id) ?? builtins;
    const extra = options.extraItems?.filter(item => item.placement !== 'overflow').map(item => item.id) ?? [];
    const defaults = [...declared, ...extra].filter(id => id !== 'import' && id !== 'export' && !options.overflowActions?.includes(id));
    return {variant: 'plain', ...options, inlineActions: options.inlineActions ?? defaults,
        iconOnlyActions: options.iconOnlyActions ?? [...declared, ...extra]};
}

export function toolbarHTML(options: VFSToolbarOptions, fileLabel: string, ui: VFSPresentation = defaultPresentation): string {
    const select = options.selectionToggle ? `<button type="button" class="vfs-node-list__new-btn" data-action="select-items" title="${escapeHTML(ui.t('vfs.toolbar.selectHint'))}" aria-pressed="false">${escapeHTML(ui.t('vfs.toolbar.select'))}</button>` : '';
    if (options.definitions) return options.definitions.map(action => {
        const iconOnly = !!action.iconHTML && options.iconOnlyActions?.includes(action.id);
        return `<button type="button" class="vfs-node-list__new-btn${action.iconHTML ? ' vfs-node-list__new-btn--icon' : ''}${iconOnly ? ' vfs-node-list__new-btn--icon-only' : ''}" data-action="${escapeHTML(action.id)}"${overflowAttribute(options, action.id)} title="${escapeHTML(action.label)}" aria-label="${escapeHTML(action.label)}">${action.iconHTML ?? ''}<span class="vfs-node-list__button-label">${escapeHTML(action.label)}</span></button>`;
    }).join('') + select;
    if (options.items) return options.items.map(item => `<button type="button" class="vfs-node-list__new-btn" data-action="${escapeHTML(item.id)}"${overflowAttribute(options, item.id)} ${item.disabled ? 'disabled' : ''}>${escapeHTML(item.label)}</button>`).join('') + select;
    const labels: Record<string, string> = { 'create-file': options.fileLabel ?? fileLabel, 'create-directory': options.directoryLabel ?? ui.t('vfs.toolbar.directory'),
        import: ui.t('vfs.toolbar.import'), export: ui.t('vfs.toolbar.export'), refresh: ui.t('vfs.toolbar.refresh') };
    const order: VFSToolbarAction[] = options.directoryFirst
        ? ['create-directory', 'create-file', 'refresh', 'import', 'export'] : ['create-file', 'create-directory', 'refresh', 'import', 'export'];
    const buttons = order.filter(action => !options.hiddenActions?.includes(action)).map(action => {
        const create = action.startsWith('create-'), label = labels[action];
        const title = action === 'create-file' && options.fileTitle ? options.fileTitle : create ? ui.t('vfs.toolbar.create', { name: label }) : label;
        const icon = action === 'create-file' ? 'addFile' : action === 'create-directory' ? 'addFolder' : action as 'import' | 'export' | 'refresh';
        const iconOnly = options.iconOnlyActions?.includes(action);
        return { action, create, html: `<button type="button" class="vfs-node-list__new-btn ${create ? '' : 'vfs-node-list__new-btn--icon'}${iconOnly ? ' vfs-node-list__new-btn--icon-only' : ''}" data-action="${action}"${overflowAttribute(options, action)} title="${escapeHTML(title)}" aria-label="${escapeHTML(title)}">${ui.icon(icon)}<span class="vfs-node-list__button-label">${escapeHTML(create ? title : label)}</span></button>` };
    });
    if (options.root) {
        const index = buttons.findIndex(button => button.action === 'refresh');
        buttons.splice(index < 0 ? buttons.length : index, 0, { action: 'open-root', create: false,
            html: `<button type="button" class="vfs-node-list__new-btn vfs-node-list__new-btn--icon vfs-node-list__new-btn--icon-only" data-action="open-root"${overflowAttribute(options, 'open-root')} title="${escapeHTML(options.root.title)}" aria-label="${escapeHTML(options.root.title)}"><span aria-hidden="true">${escapeHTML(options.root.label)}</span><span class="vfs-node-list__button-label">${escapeHTML(ui.t('vfs.transfer.root'))}</span></button>` });
    }
    for (const item of options.extraItems ?? []) {
        const iconOnly = !!item.iconHTML && options.iconOnlyActions?.includes(item.id);
        const index = item.after ? buttons.findIndex(button => button.action === item.after) : -1;
        buttons.splice(index < 0 ? buttons.length : index + 1, 0, { action: item.id, create: false,
            html: `<button type="button" class="vfs-node-list__new-btn${iconOnly ? ' vfs-node-list__new-btn--icon-only' : ''}" data-action="${escapeHTML(item.id)}"${overflowAttribute(options, item.id, item.placement)} title="${escapeHTML(item.label)}" aria-label="${escapeHTML(item.label)}">${item.iconHTML ?? ''}<span class="vfs-node-list__button-label">${escapeHTML(item.label)}</span></button>` });
    }
    if (options.variant === 'plain') return buttons.map(button => button.html).join('') + select;
    return [true, false].map(create => {
        const html = buttons.filter(button => button.create === create).map(button => button.html).join('');
        return html ? `<span class="vfs-node-list__toolbar-group vfs-node-list__toolbar-group--${create ? 'create' : 'transfer'}">${html}</span>` : '';
    }).join('') + select;
}

function overflowAttribute(options: VFSToolbarOptions, id: string, placement?: 'toolbar' | 'overflow'): string {
    if (placement === 'toolbar' || options.inlineActions?.includes(id)) return ' data-toolbar-overflow="never"';
    return placement === 'overflow' || options.overflowActions?.includes(id) ? ' data-toolbar-overflow="always"' : '';
}
