/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 *
 * @param func - The function to debounce
 * @param wait - The number of milliseconds to delay
 * @param immediate - If true, trigger the function on the leading edge instead of trailing
 * @returns Debounced function
 */
export declare function debounce<T extends (...args: any[]) => any>(func: T, wait: number, immediate?: boolean): (...args: Parameters<T>) => void;
/**
 * Creates a throttled function that only invokes func at most once per every wait milliseconds.
 * Useful for rate limiting expensive operations like scroll handlers or resize events.
 *
 * @param func - The function to throttle
 * @param wait - The number of milliseconds to throttle invocations to
 * @returns Throttled function
 */
export declare function throttle<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void;
/**
 * Creates a debounced function with a cancel method to clear pending invocations.
 * Useful when you need to cancel pending operations (e.g., on component unmount).
 *
 * @param func - The function to debounce
 * @param wait - The number of milliseconds to delay
 * @returns Debounced function with cancel method
 */
export declare function debounceCancelable<T extends (...args: any[]) => any>(func: T, wait: number): ((...args: Parameters<T>) => void) & {
    cancel: () => void;
};
//# sourceMappingURL=debounce.d.ts.map