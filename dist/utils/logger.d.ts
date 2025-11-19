export interface Logger {
    (...args: any[]): void;
    enabled: boolean;
}
export declare function createLogger(prefix: string, enabledByDefault?: boolean): Logger;
export declare const log: Logger;
//# sourceMappingURL=logger.d.ts.map