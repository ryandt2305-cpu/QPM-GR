export interface Storage {
    get<T = any>(key: string, fallback?: T): T;
    set(key: string, value: any): void;
}
export declare const storage: Storage;
//# sourceMappingURL=storage.d.ts.map