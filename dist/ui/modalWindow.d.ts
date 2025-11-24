export type PanelRender = (root: HTMLElement) => void;
export interface WindowConfig {
    id: string;
    title: string;
    render: PanelRender;
    maxWidth?: string;
    maxHeight?: string;
}
interface WindowState {
    id: string;
    el: HTMLElement;
    head: HTMLElement;
    body: HTMLElement;
    titleEl: HTMLElement;
    minimizeBtn: HTMLElement;
    closeBtn: HTMLElement;
    isMinimized: boolean;
    maxHeight: string;
}
/**
 * Open a window by ID. If already exists, show it and bump to front.
 */
export declare function openWindow(id: string, title: string, render: PanelRender, maxWidth?: string, maxHeight?: string): void;
/**
 * Close a window
 */
export declare function closeWindow(id: string): void;
/**
 * Toggle window open/close
 */
export declare function toggleWindow(id: string, title: string, render: PanelRender, maxWidth?: string, maxHeight?: string): boolean;
/**
 * Toggle minimize/restore
 */
export declare function toggleMinimize(id: string): void;
/**
 * Get window by ID
 */
export declare function getWindow(id: string): WindowState | null;
/**
 * Check if window exists and is open
 */
export declare function isWindowOpen(id: string): boolean;
/**
 * Close all windows
 */
export declare function closeAllWindows(): void;
/**
 * Destroy a window completely
 */
export declare function destroyWindow(id: string): void;
/**
 * Destroy all windows
 */
export declare function destroyAllWindows(): void;
export {};
//# sourceMappingURL=modalWindow.d.ts.map