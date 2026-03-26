/**
 * Cloudflare Worker - PR Tracker Backend
 */
interface Ai {
    run(model: string, options: Record<string, unknown>): Promise<{
        response: string;
    } | string>;
}
interface Env {
    GITHUB_TOKEN: string;
    AI: Ai;
    RATE_LIMIT_DELAY?: string;
    MAX_CONCURRENT_SUMMARIZATIONS?: string;
    CACHE_TTL_HOURS?: string;
}
declare const _default: {
    fetch(request: Request, env: Env): Promise<Response>;
};
export default _default;
//# sourceMappingURL=index.d.ts.map