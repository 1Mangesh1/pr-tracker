/**
 * Cloudflare Worker - PR Tracker Backend
 */

import { Router } from "itty-router";
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

// Type definitions for Cloudflare Workers
interface Ai {
  run(model: string, options: Record<string, unknown>): Promise<{ response: string } | string>;
}

interface AssetContainer {
  fetch(req: Request): Promise<Response>;
}

interface Env {
  GITHUB_TOKEN: string;
  AI: Ai;
  ASSETS: AssetContainer;
  RATE_LIMIT_DELAY?: string;
  MAX_CONCURRENT_SUMMARIZATIONS?: string;
  CACHE_TTL_HOURS?: string;
}

// Create router
const router = Router();

// In-memory cache for summaries (cleared on worker restart)
const summaryCache = new Map<string, PRSummary>();

// Helper to get cache key
function getCacheKey(prId: number, title: string): string {
  return `${prId}-${title.substring(0, 50).replace(/\s+/g, "-")}`;
}

// Helper to verify GitHub token
function getGitHubToken(env: Env): string {
  const token = env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN not configured. Run: wrangler secret put GITHUB_TOKEN");
  }
  return token;
}

// Helper to add CORS headers
function addCORSHeaders(response: Response): Response {
  const newResponse = new Response(response.body, response);
  newResponse.headers.set("Access-Control-Allow-Origin", "*");
  newResponse.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  newResponse.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return newResponse;
}

// Handle preflight
router.options("*", () => {
  return new Response(null, { status: 204 });
});

// Health check
router.get("/health", () => {
  return new Response(
    JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});

// Fetch PRs from GitHub
router.post("/api/fetch-prs", async (req: Request, env: Env) => {
  try {
    const body = (await req.json()) as FetchPRsRequest;
    const { query, maxResults = 50 } = body;

    if (!query || query.trim().length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Search query is required",
        } as APIResponse<null>),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const token = getGitHubToken(env);
    const prs = await fetchPRsFromGitHub(query, token, maxResults);

    return new Response(
      JSON.stringify({
        success: true,
        data: prs,
        message: `Fetched ${prs.length} PRs`,
      } as APIResponse<typeof prs>),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in /api/fetch-prs:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } as APIResponse<null>),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

// Summarize a single PR
router.post("/api/summarize", async (req: Request, env: Env) => {
  try {
    const body = (await req.json()) as SummarizeRequest & { prNumber?: number; prId?: number; createdAt?: string; state?: string };
    const { title, body: prBody, repoName, prNumber = 0, prId = 0, createdAt = new Date().toISOString(), state = "open" } = body;

    if (!title || !repoName) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Title and repoName are required",
        } as APIResponse<null>),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

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
      JSON.stringify({
        success: true,
        data: summary,
      } as APIResponse<PRSummary>),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in /api/summarize:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } as APIResponse<null>),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

// Batch process - fetch and summarize all PRs
router.post("/api/batch-process", async (req: Request, env: Env) => {
  try {
    const body = (await req.json()) as BatchProcessRequest;
    const { query, startDate, endDate, maxResults = 100 } = body;

    if (!query || query.trim().length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Search query is required",
        } as APIResponse<null>),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

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
          const aiSummary = await summarizeWithRetry(
            env.AI,
            pr.title,
            pr.body,
            pr.repo.full_name
          );

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

        // Rate limiting: 500ms between AI calls to stay within free tier
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
      JSON.stringify({
        success: true,
        data: response,
        message: `Processed ${processed}/${prs.length} PRs`,
      } as APIResponse<BatchProcessResponse>),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in /api/batch-process:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } as APIResponse<null>),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

// Serve static assets
router.get("*", async (req: Request, env: Env) => {
  const url = new URL(req.url);
  let pathname = url.pathname === "/" ? "/index.html" : url.pathname;

  // Try to get the asset from the assets binding
  try {
    const response = await env.ASSETS.fetch(req);
    return response;
  } catch (error) {
    // If assets don't exist, return 404
    return new Response("Not Found", { status: 404 });
  }
});

// 404 handler
router.all("*", () => {
  return new Response("Not Found", { status: 404 });
});

// Main export
export default {
  async fetch(request: Request, env: Env) {
    try {
      const response = await router.handle(request, env);
      return addCORSHeaders(response);
    } catch (error) {
      console.error("Unhandled error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : "Internal server error",
        } as APIResponse<null>),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  },
};
