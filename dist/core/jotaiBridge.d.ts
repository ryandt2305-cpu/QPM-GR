export type JotaiStore = {
    get(atom: unknown): any;
    set(atom: unknown, value: unknown): void | Promise<void>;
    sub(atom: unknown, cb: () => void): () => void | Promise<() => void>;
    __polyfill?: boolean;
};
export declare function ensureJotaiStore(): Promise<JotaiStore>;
export declare function getCapturedInfo(): {
    mode: "fiber" | "write" | "polyfill" | null;
    error: unknown;
    hasStore: boolean;
};
export declare function getCachedStore(): JotaiStore | null;
export declare function findAtomsByLabel(regex: RegExp): any[];
export declare function getAtomByLabel(label: string): any | null;
export declare function readAtomValue<T = unknown>(atom: any): Promise<T>;
export declare function writeAtomValue(atom: any, value: unknown): Promise<void>;
export declare function subscribeAtom<T = unknown>(atom: any, cb: (value: T) => void): Promise<() => void>;
export declare function isPolyfillStore(): boolean;
//# sourceMappingURL=jotaiBridge.d.ts.map