import { translate, type Translate } from '../utils/i18n';
import { ACTION_ICONS, FILE_BROWSER_ICONS, FILE_ICONS, VFS_TOOLBAR_ICONS, fileTypeIcon } from '../utils/icons';

export type VFSIconName = 'delete' | 'confirm' | 'close' | 'favorite' | 'pin' | 'folder' | 'addFile' | 'addFolder' | 'import' | 'export' | 'refresh' | 'more' | 'windows' | 'filter';
export interface VFSPresentationOptions {
    locale?: 'zh-CN' | 'en';
    translate?: Translate;
    /** Trusted SVG or other markup, supplied by the host. */
    icons?: Partial<Record<VFSIconName, string>>;
    fileIcon?(filename: string, directory: boolean): string;
    /** Format labels without changing stable tag identities or search tokens. */
    tagLabel?(tag: string): string;
    trace?<T>(label: string, work: () => Promise<T>): Promise<T>;
}
export interface VFSPresentation {
    t: Translate;
    icon(name: VFSIconName): string;
    fileIcon(filename: string, directory?: boolean): string;
    tagLabel?(tag: string): string;
    trace<T>(label: string, work: () => Promise<T>): Promise<T>;
}
const defaults: Record<VFSIconName, string> = { delete: ACTION_ICONS.delete, confirm: FILE_BROWSER_ICONS.keep, close: ACTION_ICONS.close,
    favorite: ACTION_ICONS.favorite, pin: FILE_ICONS.pin, folder: FILE_ICONS.folder,
    filter: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/></svg>',
    addFile: FILE_BROWSER_ICONS.addFile, addFolder: FILE_BROWSER_ICONS.addFolder,
    import: VFS_TOOLBAR_ICONS.import, export: VFS_TOOLBAR_ICONS.export, refresh: FILE_BROWSER_ICONS.refresh,
    more: FILE_BROWSER_ICONS.more, windows: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 8h18M7 12h.01M10 12h7M7 16h.01M10 16h7"/></svg>' };
export function createPresentation(options: VFSPresentationOptions = {}): VFSPresentation {
    return {
        t: options.translate ?? ((key, params) => translate(key, params, options.locale)),
        icon: name => options.icons?.[name] ?? defaults[name],
        fileIcon: (name, directory = false) => options.fileIcon?.(name, directory) ?? fileTypeIcon(name, directory),
        tagLabel: options.tagLabel,
        trace: options.trace ?? (async (_label, work) => work()),
    };
}
export const defaultPresentation = createPresentation();
