export type Predicate = (el: Element) => boolean;
export type SelectorOrPredicate = string | Predicate;
export interface DisconnectHandle {
    disconnect(): void;
}
export interface OffHandle {
    off(): void;
}
export declare const sleep: (ms: number) => Promise<void>;
export declare const ready: Promise<void>;
export declare const $: <T extends Element = Element>(sel: string, root?: ParentNode) => T | null;
export declare const $$: <T extends Element = Element>(sel: string, root?: ParentNode) => T[];
export declare function addStyle(css: string): HTMLStyleElement;
export interface WaitForOpts {
    root?: ParentNode;
    timeout?: number;
    includeExisting?: boolean;
}
export declare function waitFor<T extends Element = Element>(selOrFn: SelectorOrPredicate, { root, timeout, includeExisting }?: WaitForOpts): Promise<T>;
export interface OnAddedOpts {
    root?: ParentNode;
    callForExisting?: boolean;
}
export declare function onAdded(selOrFn: SelectorOrPredicate, cb: (el: Element) => void, { root, callForExisting }?: OnAddedOpts): DisconnectHandle;
export declare function onRemoved(selOrFn: SelectorOrPredicate, cb: (el: Element) => void, { root }?: {
    root?: ParentNode;
}): DisconnectHandle;
export interface DelegateOpts {
    root?: ParentNode;
    capture?: boolean;
}
export declare function delegate<K extends keyof DocumentEventMap>(selector: SelectorOrPredicate, type: K, handler: (this: Element, ev: DocumentEventMap[K]) => void, { root, capture }?: DelegateOpts): OffHandle;
export interface WatchOpts {
    attributes?: boolean;
    childList?: boolean;
    subtree?: boolean;
}
export declare function watch(el: Node, cb: (el: Node) => void, opts?: WatchOpts): DisconnectHandle;
export declare function isVisible(el: Element | null): el is HTMLElement;
export declare function getGameHudRoot(): HTMLElement | null;
//# sourceMappingURL=dom.d.ts.map