import { RestockEvent } from './shopRestockTracker';
/**
 * Parse Discord HTML export to extract restock events (chunked for performance)
 */
export declare function parseDiscordHtml(htmlContent: string): Promise<RestockEvent[]>;
/**
 * Parse Discord HTML from a file
 */
export declare function parseDiscordHtmlFile(file: File): Promise<RestockEvent[]>;
//# sourceMappingURL=shopRestockParser.d.ts.map