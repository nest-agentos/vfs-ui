import { resolveDirectoryPresentation, type DirectoryPresentationOptions } from './presentation';

export interface DirectoryBreadcrumb { id: string; label: string }

/** Keep directory identity separate from its presentation label. */
export function createDirectoryBreadcrumbs(items: DirectoryBreadcrumb[], open: (id: string) => void, options?: DirectoryPresentationOptions): HTMLElement {
    const presentation = resolveDirectoryPresentation(options);
    const navigation = document.createElement('nav'); navigation.className = 'workbench-directory__path';
    navigation.setAttribute('aria-label', presentation.t('directoryPath'));
    const list = document.createElement('ol');
    items.forEach((item, index) => {
        const entry = document.createElement('li');
        if (index) {
            const separator = document.createElement('span'); separator.textContent = ' / '; separator.setAttribute('aria-hidden', 'true'); entry.append(separator);
        }
        const current = index === items.length - 1;
        const label = document.createElement(current ? 'span' : 'button'); label.textContent = item.label;
        if (label instanceof HTMLButtonElement) { label.type = 'button'; label.dataset.directoryPath = item.id; label.onclick = () => open(item.id); }
        else label.setAttribute('aria-current', 'page');
        entry.append(label); list.append(entry);
    });
    navigation.append(list); return navigation;
}
