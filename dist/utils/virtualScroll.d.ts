interface VirtualScrollOptions {
    container: HTMLElement;
    items: any[];
    renderItem: (item: any, index: number) => HTMLElement;
    itemHeight?: number;
    bufferSize?: number;
    onScroll?: (firstVisibleIndex: number, lastVisibleIndex: number) => void;
}
export declare class VirtualScroll {
    private container;
    private items;
    private renderItem;
    private itemHeight;
    private bufferSize;
    private onScroll;
    private scrollContainer;
    private viewport;
    private spacer;
    private renderedItems;
    private observer;
    private firstVisibleIndex;
    private lastVisibleIndex;
    constructor(options: VirtualScrollOptions);
    private init;
    private handleScroll;
    private handleIntersection;
    updateItems(newItems: any[]): void;
    scrollToIndex(index: number): void;
    destroy(): void;
    getVisibleRange(): {
        start: number;
        end: number;
    };
}
export declare function createVirtualScrollList(container: HTMLElement, items: any[], renderItem: (item: any, index: number) => HTMLElement, options?: Partial<VirtualScrollOptions>): VirtualScroll;
export {};
//# sourceMappingURL=virtualScroll.d.ts.map