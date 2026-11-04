import {createDeleteOperation} from '../interaction/deletion';
import type {BrowserNode} from '../contracts/source';
export interface BrowserDeletionPreview {
  message: string; blocked?: boolean;
  details?: {label: string; text: string};
  choices?: ReadonlyArray<{id: string; label: string; checked?: boolean}>;
  data?: unknown;
}
export interface BrowserDeletion {
  label: string; cancelLabel: string; iconHTML?: string;
  preview(node: BrowserNode, signal: AbortSignal): Promise<BrowserDeletionPreview>;
  /** Replaces the default confirmation; undefined cancels. */
  confirm?(node: BrowserNode, preview: BrowserDeletionPreview, signal: AbortSignal): Promise<ReadonlySet<string> | undefined>;
  remove(node: BrowserNode, preview: BrowserDeletionPreview, choices: ReadonlySet<string>, signal: AbortSignal): Promise<void>;
}
/** Resource providers own validation; the browser owns confirmation and ordered deletion. */
export interface PreparedBrowserDeletion {preview: BrowserDeletionPreview; choices: ReadonlySet<string>}
export async function prepareBrowserDeletion(port: BrowserDeletion, node: BrowserNode, signal: AbortSignal): Promise<PreparedBrowserDeletion | undefined> {
  const preview = await port.preview(node, signal);
  if (signal.aborted) return undefined;
  const choices = port.confirm ? await port.confirm(node, preview, signal) : await confirmResourceDeletion(port, preview, signal);
  return choices && !preview.blocked && !signal.aborted ? {preview, choices} : undefined;
}
export async function removeBrowserResource(port: BrowserDeletion, node: BrowserNode, prepared: PreparedBrowserDeletion, signal: AbortSignal): Promise<void> {
  await createDeleteOperation<BrowserNode>({
    resolve: () => ({resources: [{ids: [node.id], remove: async () => {await port.remove(node, prepared.preview, prepared.choices, signal); return 'completed';}}]}),
  })(node, signal);
}
export async function deleteBrowserResource(port: BrowserDeletion, node: BrowserNode, signal: AbortSignal): Promise<void> {
  const prepared = await prepareBrowserDeletion(port, node, signal);
  if (prepared) await removeBrowserResource(port, node, prepared, signal);
}
export function confirmResourceDeletion(port: Pick<BrowserDeletion, 'label' | 'cancelLabel'>, preview: BrowserDeletionPreview, signal: AbortSignal): Promise<Set<string> | undefined> {
  if (signal.aborted) return Promise.resolve(undefined);
  return new Promise(resolve => {
    const dialog = document.createElement('dialog'), message = document.createElement('p'), actions = document.createElement('div');
    const previousFocus = document.activeElement;
    dialog.className = 'vfs-resource-deletion'; dialog.setAttribute('aria-label', port.label); message.textContent = preview.message; dialog.append(message);
    if (preview.details) {
      const details = document.createElement('details'), summary = document.createElement('summary'), content = document.createElement('p');
      summary.textContent = preview.details.label; content.textContent = preview.details.text;
      details.append(summary, content); dialog.append(details);
    }
    const inputs = (preview.choices ?? []).map(choice => {
      const label = document.createElement('label'), input = document.createElement('input');
      input.type = 'checkbox'; input.checked = choice.checked === true; input.value = choice.id;
      label.append(input, document.createTextNode(choice.label)); dialog.append(label); return input;
    });
    const cancel = document.createElement('button'), remove = document.createElement('button');
    cancel.type = remove.type = 'button'; cancel.textContent = port.cancelLabel; remove.textContent = port.label; remove.disabled = preview.blocked === true;
    actions.append(cancel, remove); dialog.append(actions); document.body.append(dialog);
    const finish = (result?: Set<string>) => {signal.removeEventListener('abort', abort); dialog.remove(); if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({preventScroll: true}); resolve(result);};
    const abort = () => finish(); signal.addEventListener('abort', abort, {once: true});
    cancel.addEventListener('click', () => finish()); dialog.addEventListener('cancel', event => {event.preventDefault(); finish();});
    remove.addEventListener('click', () => {if (!preview.blocked) finish(new Set(inputs.filter(input => input.checked).map(input => input.value)));});
    dialog.showModal(); cancel.focus();
  });
}
