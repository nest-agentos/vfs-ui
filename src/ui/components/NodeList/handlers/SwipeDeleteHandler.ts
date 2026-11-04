/** Pointer gestures only reveal an existing two-step action; they never delete. */
const AXIS_THRESHOLD = 10;
const HORIZONTAL_RATIO = 1.5;
const OPEN_THRESHOLD = 48;
const CLOSE_THRESHOLD = 32;
const CLICK_GUARD_MS = 700;
const OPEN_CLASS = 'vfs-node-item__main-row--swipe-open';

interface Gesture {
    pointerId: number;
    id: string;
    x: number;
    y: number;
    axis?: 'horizontal' | 'vertical';
}

export class SwipeDeleteHandler {
    private readonly abort = new AbortController();
    private gesture?: Gesture;
    private openId: string | null = null;
    private suppressClick?: { id: string; until: number };

    constructor(private readonly body: HTMLElement, private readonly canDelete: (id: string) => boolean,
        private readonly changed: () => void) {
        const signal = this.abort.signal;
        body.addEventListener('pointerdown', this.start, { signal });
        document.addEventListener('pointermove', this.move, { signal, passive: false });
        document.addEventListener('pointerup', this.end, { signal });
        document.addEventListener('pointercancel', this.cancel, { signal });
        document.addEventListener('click', this.click, { signal, capture: true });
        document.addEventListener('dblclick', this.guardClick, { signal, capture: true });
        body.addEventListener('keydown', this.keyDown, { signal });
        body.addEventListener('dragstart', () => { this.gesture = undefined; }, { signal });
    }

    private start = (event: PointerEvent): void => {
        if (event.isPrimary === false || this.gesture) { this.gesture = undefined; return; }
        if (event.button !== 0) return;
        this.suppressClick = undefined;
        const target = event.target as Element;
        if (target.closest('button, input, textarea, a, select, [contenteditable="true"]')) return;
        const row = target.closest<HTMLElement>('.vfs-node-item__main-row');
        if (!row || !this.body.contains(row)) return;
        const id = row.closest<HTMLElement>('[data-item-id]')?.dataset.itemId;
        if (id) this.gesture = { pointerId: event.pointerId, id, x: event.clientX, y: event.clientY };
    };

    private classify(event: PointerEvent): { dx: number; dy: number } | undefined {
        const gesture = this.gesture;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
        if (!gesture.axis && Math.max(Math.abs(dx), Math.abs(dy)) >= AXIS_THRESHOLD)
            gesture.axis = Math.abs(dx) > Math.abs(dy) * HORIZONTAL_RATIO ? 'horizontal' : 'vertical';
        return { dx, dy };
    }

    private move = (event: PointerEvent): void => {
        if (this.classify(event) && this.gesture?.axis === 'horizontal' && this.canDelete(this.gesture.id))
            event.preventDefault();
    };

    private end = (event: PointerEvent): void => {
        const delta = this.classify(event), gesture = this.gesture;
        if (!delta || !gesture) return;
        this.gesture = undefined;
        if (gesture.axis) this.suppressClick = { id: gesture.id, until: Date.now() + CLICK_GUARD_MS };
        if (gesture.axis !== 'horizontal' || Math.abs(delta.dx) <= Math.abs(delta.dy) * HORIZONTAL_RATIO) return;
        if (delta.dx <= -OPEN_THRESHOLD && this.canDelete(gesture.id)) this.setOpen(gesture.id);
        else if (delta.dx >= CLOSE_THRESHOLD && this.openId === gesture.id) this.setOpen(null);
    };

    private cancel = (event: PointerEvent): void => {
        if (this.gesture?.pointerId !== event.pointerId) return;
        if (this.gesture.axis) this.suppressClick = { id: this.gesture.id, until: Date.now() + CLICK_GUARD_MS };
        this.gesture = undefined;
    };

    private guardClick = (event: MouseEvent): boolean => {
        const id = (event.target as Element).closest<HTMLElement>('[data-item-id]')?.dataset.itemId;
        const guard = this.suppressClick;
        const blocked = !!(event.detail && guard && guard.id === id && Date.now() <= guard.until);
        if (blocked) { event.preventDefault(); event.stopImmediatePropagation(); }
        return blocked;
    };

    private click = (event: MouseEvent): void => {
        if (this.guardClick(event)) return;
        const target = event.target as Element;
        const button = target.closest<HTMLButtonElement>('[data-swipe-delete]');
        const id = target.closest<HTMLElement>('[data-item-id]')?.dataset.itemId;
        if (button && this.body.contains(button)) {
            if (button.hidden || id !== this.openId || !this.canDelete(id)) {
                event.preventDefault(); event.stopImmediatePropagation(); this.setOpen(null);
            }
            return;
        }
        if (id === this.openId && target.closest('[data-action="delete-init"], [data-action="delete-direct"]')) return;
        if (id === this.openId && !target.closest('button, input, a')) {
            event.preventDefault(); event.stopImmediatePropagation(); this.setOpen(null); return;
        }
        if (this.openId) this.setOpen(null);
    };

    private keyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape' && this.openId) { event.preventDefault(); this.setOpen(null); }
    };

    private setOpen(id: string | null): void {
        if (id === this.openId) return;
        this.openId = id;
        this.changed();
    }

    /** Reconcile after every render: permissions and projected rows may have changed. */
    sync(): void {
        const buttons = [...this.body.querySelectorAll<HTMLButtonElement>('[data-swipe-delete]')];
        if (this.openId && (!this.canDelete(this.openId) || !buttons.some(button =>
            button.closest<HTMLElement>('[data-item-id]')?.dataset.itemId === this.openId))) {
            this.setOpen(null); return;
        }
        for (const button of buttons) {
            const row = button.closest<HTMLElement>('.vfs-node-item__main-row')!;
            const id = row.closest<HTMLElement>('[data-item-id]')!.dataset.itemId!;
            row.classList.add('vfs-node-item__main-row--swipe');
            row.classList.toggle(OPEN_CLASS, id === this.openId);
            button.hidden = id !== this.openId;
        }
    }

    destroy(): void {
        this.abort.abort(); this.gesture = undefined; this.suppressClick = undefined; this.openId = null;
        for (const button of this.body.querySelectorAll<HTMLButtonElement>('[data-swipe-delete]')) {
            button.hidden = true;
            button.closest('.vfs-node-item__main-row')?.classList.remove(OPEN_CLASS, 'vfs-node-item__main-row--swipe');
        }
    }
}
