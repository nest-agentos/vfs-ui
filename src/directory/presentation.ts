import { defaultPresentation } from '../contracts/presentation';
import { ACTION_ICONS, FILE_BROWSER_ICONS, fileTypeIcon } from '../utils/icons';
import type { DirectoryEntry } from './directory-list';

const labels = {
    name: 'Name', size: 'Size', modified: 'Modified', type: 'Type', created: 'Created',
    directoryPath: 'Directory path', directoryMissing: 'This directory no longer exists',
    parent: 'Parent directory', refresh: 'Refresh', actions: 'Actions', search: 'Search', filter: 'Filter',
    clearSearch: 'Clear search', selectAll: 'Select all', clearSelection: 'Clear selection', select: 'Select',
    selectedCount: 'Selected: {count}', resizeColumn: 'Resize column', empty: 'No items',
    folder: 'Folder', file: 'File', favorite: 'Favorite', unfavorite: 'Remove favorite',
};
export type DirectoryLabel = keyof typeof labels;
export interface DirectoryPresentationOptions {
    locale?: string;
    t?(key: DirectoryLabel, params?: Record<string, string | number>): string;
    /** Icons are trusted markup; resource labels are always rendered as text. */
    icons?: Partial<Record<'up' | 'refresh' | 'close' | 'search' | 'more' | 'favorite', string>>;
    fileIcon?(filename: string, directory: boolean): string;
    trace?<T>(operation: string, work: () => Promise<T>): Promise<T>;
    entryType?(entry: DirectoryEntry): string;
}
export interface DirectoryPresentation extends Omit<DirectoryPresentationOptions, 't' | 'icons' | 'fileIcon' | 'trace'> {
    trace: NonNullable<DirectoryPresentationOptions['trace']>;
    t: NonNullable<DirectoryPresentationOptions['t']>;
    icons: Required<NonNullable<DirectoryPresentationOptions['icons']>>;
    fileIcon: NonNullable<DirectoryPresentationOptions['fileIcon']>;
}
export function resolveDirectoryPresentation(options: DirectoryPresentationOptions = {}): DirectoryPresentation {
    return {...options, trace: options.trace ?? (async (_operation, work) => work()), icons: {up: FILE_BROWSER_ICONS.up, refresh: FILE_BROWSER_ICONS.refresh,
        close: FILE_BROWSER_ICONS.close, search: defaultPresentation.icon('filter'), more: FILE_BROWSER_ICONS.more,
        favorite: ACTION_ICONS.favorite, ...options.icons}, fileIcon: options.fileIcon ?? fileTypeIcon,
        t: options.t ?? ((key, params) => labels[key].replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? '')))};
}
