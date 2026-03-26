/**
 * GitHub PR Tracker Types
 */
export interface GitHubPR {
    id: number;
    number: number;
    title: string;
    body: string;
    url: string;
    state: "open" | "closed" | "merged";
    created_at: string;
    updated_at: string;
    merged_at?: string;
    user: {
        login: string;
        avatar_url: string;
    };
    repo: {
        name: string;
        full_name: string;
        url: string;
    };
    labels: Array<{
        name: string;
        color: string;
    }>;
}
export interface PRSummary {
    prId: number;
    prNumber: number;
    title: string;
    repoName: string;
    repoFullName: string;
    url: string;
    state: "open" | "closed" | "merged";
    createdAt: string;
    updatedAt: string;
    mergedAt?: string;
    author: string;
    summary: string;
    domain: "Backend" | "Frontend" | "DevOps" | "Infra" | "Fullstack" | "Testing" | "Docs" | "Other";
    tags: string[];
    labels: string[];
}
export interface AIResponse {
    summary: string;
    domain: "Backend" | "Frontend" | "DevOps" | "Infra" | "Fullstack" | "Testing" | "Docs" | "Other";
    tags: string[];
}
export interface FetchPRsRequest {
    query: string;
    maxResults?: number;
}
export interface SummarizeRequest {
    title: string;
    body: string;
    repoName: string;
}
export interface BatchProcessRequest {
    query: string;
    startDate?: string;
    endDate?: string;
    maxResults?: number;
}
export interface BatchProcessResponse {
    total: number;
    processed: number;
    summaries: PRSummary[];
    errors: Array<{
        prId: number;
        error: string;
    }>;
}
export interface APIResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}
export interface CacheEntry {
    data: PRSummary;
    timestamp: number;
}
export interface GitHubSearchResponse {
    total_count: number;
    incomplete_results: boolean;
    items: GitHubPR[];
}
//# sourceMappingURL=types.d.ts.map