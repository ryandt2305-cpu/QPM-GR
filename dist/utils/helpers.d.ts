export declare function structuredMerge<T extends Record<string, any>>(base: T, extra: Partial<T>): T;
export declare function clamp(n: number, min?: number, max?: number): number;
export declare function formatValue(v: number | null | undefined): string;
export declare function safeCall<T>(fn: () => T): T | null;
export declare function formatSince(timestamp: number): string;
export declare function normalizeSpeciesKey(value: string): string;
export declare function debounce<T extends (...args: any[]) => void>(fn: T, wait?: number): (...args: Parameters<T>) => void;
//# sourceMappingURL=helpers.d.ts.map