import {defaultPresentation, type VFSPresentation} from '../../contracts/presentation';

export interface WindowManagementOptions {
    open(origin: HTMLButtonElement): void;
    label?: string;
    iconHTML?: string;
    count?(): number;
    subscribe?(changed: () => void): () => void;
}

/** The host owns windows; this component owns their shared entry and accessibility. */
export function createWindowManagement(options: WindowManagementOptions, ui: VFSPresentation = defaultPresentation) {
    const button = document.createElement('button'), count = document.createElement('span');
    const label = options.label ?? ui.t('workbench.opened');
    button.type = 'button'; button.className = 'vfs-window-management';
    button.title = label; button.setAttribute('aria-haspopup', 'dialog');
    button.innerHTML = options.iconHTML ?? ui.icon('windows');
    count.className = 'vfs-window-management__count'; button.append(count);
    const update = (total = options.count?.()) => {
        count.hidden = total === undefined; count.textContent = total === undefined ? '' : String(total);
        button.setAttribute('aria-label', total === undefined ? label : `${label} (${total})`);
    };
    const open = () => options.open(button); button.addEventListener('click', open);
    const unsubscribe = options.subscribe?.(() => update()); update();
    let destroyed = false;
    return {button, update, destroy() {if (destroyed) return; destroyed = true; unsubscribe?.(); button.removeEventListener('click', open); button.remove();}};
}
