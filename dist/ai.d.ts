/**
 * Cloudflare Workers AI Integration
 */
import type { AIResponse } from "./types";
interface Ai {
    run(model: string, options: Record<string, unknown>): Promise<{
        response: string;
    } | string>;
}
export declare function summarizePR(ai: Ai, title: string, body: string, repoName: string): Promise<AIResponse>;
export declare function summarizeWithRetry(ai: Ai, title: string, body: string, repoName: string, maxRetries?: number): Promise<AIResponse>;
export declare function calculateTokenCost(text: string): number;
export {};
//# sourceMappingURL=ai.d.ts.map