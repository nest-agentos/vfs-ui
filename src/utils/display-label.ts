/** Short labels are presentation only; identity, search and editing retain the full text. */
export function formatDisplayLabel(text: string): string {
    const source = typeof Intl.Segmenter === 'function'
        ? new Intl.Segmenter(undefined, {granularity: 'grapheme'}).segment(text) : text;
    const parts: string[] = [];
    for (const part of source) {
        if (parts.length === 40) return parts.slice(0, 39).join('') + '…';
        parts.push(typeof part === 'string' ? part : part.segment);
    }
    return text;
}
