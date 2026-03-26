/**
 * Cloudflare Worker - PR Tracker Backend
 */

import type {
  FetchPRsRequest,
  SummarizeRequest,
  BatchProcessRequest,
  BatchProcessResponse,
  PRSummary,
  APIResponse,
} from "./types";
import { fetchPRsFromGitHub, isDateInRange, getRepoName } from "./github";
import { summarizeWithRetry } from "./ai";

interface Ai {
  run(model: string, options: Record<string, unknown>): Promise<{ response: string } | string>;
}

interface Env {
  GITHUB_TOKEN: string;
  AI: Ai;
  RATE_LIMIT_DELAY?: string;
  MAX_CONCURRENT_SUMMARIZATIONS?: string;
  CACHE_TTL_HOURS?: string;
}

// In-memory cache for summaries (cleared on worker restart)
const summaryCache = new Map<string, PRSummary>();

function getCacheKey(prId: number, title: string): string {
  return `${prId}-${title.substring(0, 50).replace(/\s+/g, "-")}`;
}

function getGitHubToken(env: Env): string {
  const token = env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN not configured. Run: wrangler secret put GITHUB_TOKEN");
  }
  return token;
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method;

  console.log(`[${method}] ${pathname}`);

  try {
    // Health check
    if (method === "GET" && pathname === "/health") {
      return new Response(
        JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch PRs from GitHub
    if (method === "POST" && pathname === "/api/fetch-prs") {
      const body = (await request.json()) as FetchPRsRequest;
      const { query, maxResults = 50 } = body;

      if (!query?.trim()) {
        return new Response(
          JSON.stringify({ success: false, error: "Search query required" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      try {
        const token = getGitHubToken(env);
        const prs = await fetchPRsFromGitHub(query, token, maxResults);

        return new Response(
          JSON.stringify({ success: true, data: prs, message: `Fetched ${prs.length} PRs` }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      } catch (error) {
        console.error("GitHub fetch error:", error);
        return new Response(
          JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Failed to fetch PRs" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Summarize single PR
    if (method === "POST" && pathname === "/api/summarize") {
      const body = (await request.json()) as SummarizeRequest & { prNumber?: number; prId?: number; createdAt?: string; state?: string };
      const { title, body: prBody, repoName, prNumber = 0, prId = 0, createdAt = new Date().toISOString(), state = "open" } = body;

      if (!title || !repoName) {
        return new Response(
          JSON.stringify({ success: false, error: "Title and repoName required" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      try {
        const cacheKey = getCacheKey(prId, title);
        let summary = summaryCache.get(cacheKey);

        if (!summary) {
          const aiSummary = await summarizeWithRetry(env.AI, title, prBody || "", repoName);

          summary = {
            prId,
            prNumber,
            title,
            repoName: getRepoName(repoName),
            repoFullName: repoName,
            url: `https://github.com/${repoName}/pull/${prNumber}`,
            state: state as any,
            createdAt,
            updatedAt: new Date().toISOString(),
            author: "",
            summary: aiSummary.summary,
            domain: aiSummary.domain,
            tags: aiSummary.tags,
            labels: [],
          };

          summaryCache.set(cacheKey, summary);
        }

        return new Response(
          JSON.stringify({ success: true, data: summary }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      } catch (error) {
        console.error("Summarize error:", error);
        return new Response(
          JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Summarization failed" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Batch process - fetch and summarize all PRs
    if (method === "POST" && pathname === "/api/batch-process") {
      const body = (await request.json()) as BatchProcessRequest;
      const { query, startDate, endDate, maxResults = 100 } = body;

      if (!query?.trim()) {
        return new Response(
          JSON.stringify({ success: false, error: "Search query required" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      try {
        const token = getGitHubToken(env);
        const prs = await fetchPRsFromGitHub(query, token, maxResults);

        const startDateObj = startDate ? new Date(startDate) : undefined;
        const endDateObj = endDate ? new Date(endDate) : undefined;

        const summaries: PRSummary[] = [];
        const errors: Array<{ prId: number; error: string }> = [];
        let processed = 0;

        for (const pr of prs) {
          try {
            const createdAt = new Date(pr.created_at);
            if (!isDateInRange(createdAt, startDateObj, endDateObj)) {
              continue;
            }

            const cacheKey = getCacheKey(pr.id, pr.title);
            let summary = summaryCache.get(cacheKey);

            if (!summary) {
              const aiSummary = await summarizeWithRetry(env.AI, pr.title, pr.body, pr.repo.full_name);

              summary = {
                prId: pr.id,
                prNumber: pr.number,
                title: pr.title,
                repoName: pr.repo.name,
                repoFullName: pr.repo.full_name,
                url: pr.url,
                state: pr.state,
                createdAt: pr.created_at,
                updatedAt: pr.updated_at,
                mergedAt: pr.merged_at,
                author: pr.user.login,
                summary: aiSummary.summary,
                domain: aiSummary.domain,
                tags: aiSummary.tags,
                labels: pr.labels.map((l: any) => l.name),
              };

              summaryCache.set(cacheKey, summary);
            }

            summaries.push(summary);
            processed++;

            // Rate limiting: 500ms between AI calls
            if (processed < prs.length) {
              await new Promise((resolve) => setTimeout(resolve, 500));
            }
          } catch (error) {
            errors.push({
              prId: pr.id,
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        }

        const response: BatchProcessResponse = {
          total: prs.length,
          processed,
          summaries,
          errors,
        };

        return new Response(
          JSON.stringify({ success: true, data: response, message: `Processed ${processed}/${prs.length} PRs` }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      } catch (error) {
        console.error("Batch process error:", error);
        return new Response(
          JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Batch processing failed" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Not found
    return new Response(
      JSON.stringify({ success: false, error: "Not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// Main export
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await handleRequest(request, env);

    const newResponse = new Response(response.body, response);
    newResponse.headers.set("Access-Control-Allow-Origin", "*");
    newResponse.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    newResponse.headers.set("Access-Control-Allow-Headers", "Content-Type");

    return newResponse;
  },
};
