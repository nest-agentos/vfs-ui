import {describe, expect, it, vi} from 'vitest';
import {formatDisplayLabel} from '../src/utils/display-label';

describe('display labels', () => {
    it('keeps short names and limits long names without changing the source', () => {
        expect(formatDisplayLabel('开发任务')).toBe('开发任务');
        const source = 'a'.repeat(10000);
        expect(formatDisplayLabel(source)).toBe('a'.repeat(39) + '…');
        expect(source.length).toBe(10000);
    });
    it('preserves complete graphemes and supports engines without Segmenter', () => {
        const glyph = '👩🏽‍💻'; expect(formatDisplayLabel(glyph.repeat(41))).toBe(glyph.repeat(39) + '…');
        const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter')!;
        try {
            Object.defineProperty(Intl, 'Segmenter', {configurable: true, value: undefined});
            expect(formatDisplayLabel('😀'.repeat(41))).toBe('😀'.repeat(39) + '…');
        } finally {Object.defineProperty(Intl, 'Segmenter', descriptor); vi.restoreAllMocks();}
    });
});
