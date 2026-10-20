export type DiffLine = {
    readonly kind: 'same' | 'add' | 'remove';
    readonly text: string;
    readonly oldLine?: number;
    readonly newLine?: number;
};
/** Compute a line diff, using LCS for ordinary Harness files and a bounded fallback for unusually large files. */
export declare function diffLines(before: string, after: string): readonly DiffLine[];
//# sourceMappingURL=diff.d.ts.map