import { RestockEvent } from './shopRestockTracker';
/**
 * Parse Discord HTML export to extract restock events
 */
export declare function parseDiscordHtml(htmlContent: string): RestockEvent[];
/**
 * Parse Discord HTML from a file
 */
export declare function parseDiscordHtmlFile(file: File): Promise<RestockEvent[]>;
//# sourceMappingURL=shopRestockParser.d.ts.map