import type { ICommandPort } from '../../../../contracts/ports';
import type { VFSNodeUI } from '../../../../contracts/types';
import type { VFSRowActionOptions } from '../../../../contracts/options';
import type { ActionRunner } from '../../../../interaction/ActionRunner';
import { resolveRowPolicy, resolveQuickDeletePolicy } from '../../../../utils/row-policy';
import { generateShortUUID } from '../../../../utils/local';

interface RowMutationContext {
    commands: ICommandPort;
    actions: ActionRunner;
    find(id: string): VFSNodeUI | null;
    readOnly(): boolean;
    sorted: boolean;
    onQuickDelete?: VFSRowActionOptions['onQuickDelete'];
    confirmDelete?: VFSRowActionOptions['confirmDelete'];
    allows(action: string, node: VFSNodeUI): boolean;
}

/** Resolve current nodes at dispatch time; DOM flags are presentation, not authority. */
export function createRowMutationPort(context: RowMutationContext): ICommandPort {
    return { execute: (command, payload) => {
        if (command === 'file:delete') return deleteRow(context, payload as { itemIds: string[] });
        if (command === 'file:move') return moveRows(context, payload as MoveRequest);
        return context.commands.execute(command, payload);
    } };
}

type MoveRequest = import('../../../../contracts/commands').CommandMap['file:move'];

function deleteRow(context: RowMutationContext, payload: { itemIds: string[] }): Promise<void> | void {
    if (payload.itemIds.length !== 1) return;
    const node = context.find(payload.itemIds[0]);
    if (!node) return;
    const policy = resolveQuickDeletePolicy(context.readOnly(), node, context.allows);
    if (!policy.inlineDelete) return;
    // The row's own control is the confirmation: its first click arms, the second one
    // runs. Re-entering the context-menu action here would ask the very same question
    // again, so the click goes straight to the deletion pipeline. Menu availability
    // still gates ordinary files; host-owned entries carry their policy through
    // `onQuickDelete` instead.
    return context.actions.run(`delete:${node.id}`, () => deleteCurrent(context, node.id));
}

async function deleteCurrent(context: RowMutationContext, id: string): Promise<void> {
    const started = performance.now(), operationId = generateShortUUID();
    const trace = (stage: string, result: string, category?: string): void => console.debug('[vfs-ui:row-delete]', {
        operation: 'quickDelete', operationId, stage, result, category, durationMs: Math.round(performance.now() - started),
    });
    const current = context.find(id);
    if (!current) { trace('authorize', 'blocked', 'missing-row'); return; }
    const policy = resolveQuickDeletePolicy(context.readOnly(), current, context.allows);
    if (!policy.inlineDelete) { trace('authorize', 'blocked', 'delete-policy'); return; }
    let stage = 'confirm';
    try {
        if (context.confirmDelete && !await context.confirmDelete(current)) {trace(stage, 'cancelled'); return;}
        const latest = context.find(id);
        if (!latest || !resolveQuickDeletePolicy(context.readOnly(), latest, context.allows).inlineDelete) {trace('authorize', 'blocked', 'delete-policy'); return;}
        stage = resolveRowPolicy(context.readOnly(), latest).hostOwnedDelete && context.onQuickDelete ? 'host-delete' : 'file-delete';
        trace(stage, 'started');
        if (stage === 'host-delete') await context.onQuickDelete!(latest);
        else await context.commands.execute('file:delete', { itemIds: [latest.id] });
        // File deletion reports failures inside its existing command pipeline.
        trace(stage, stage === 'host-delete' ? 'succeeded' : 'dispatched');
    } catch (error) {
        trace(stage, 'failed', deleteFailureCategory(error));
        throw error;
    }
}

/** Keep diagnostics useful without copying provider messages or request parameters. */
function deleteFailureCategory(error: unknown): string {
    const codes = new Set(['EACCES', 'EPERM', 'EROFS', 'EBUSY', 'ENOENT', 'ENOSPC', 'EIO', 'ETIMEDOUT']);
    const names = new Set(['QuotaExceededError', 'NetworkError', 'NotAllowedError', 'AbortError', 'TypeError']);
    let current = error;
    for (let depth = 0; depth < 8 && current instanceof Error; depth++) {
        const code = (current as Error & { code?: string }).code;
        if (code && codes.has(code)) return code;
        if (names.has(current.name)) return current.name;
        current = current.cause;
    }
    return 'unknown-error';
}

function moveRows(context: RowMutationContext, payload: MoveRequest): Promise<void> {
    return context.actions.run('move', async () => {
        const target = context.find(payload.targetId ?? '');
        if (!target || resolveRowPolicy(context.readOnly(), target).readOnly || target.kind === 'group') return;
        if (context.sorted && payload.position !== 'into') return;
        if (!payload.itemIds.length || !payload.itemIds.every(id => {
            const node = context.find(id);
            return !!node && context.allows('moveTo', node);
        })) return;
        await context.commands.execute('file:move', payload);
    });
}
