/**
 * GitHub API Integration
 */

import type { GitHubPR, GitHubSearchResponse } from "./types";

const GITHUB_API_BASE = "https://api.github.com";

export async function fetchPRsFromGitHub(
  query: string,
  token: string,
  maxResults: number = 50
): Promise<GitHubPR[]> {
  try {
    const searchQuery = encodeURIComponent(query);
    const perPage = Math.min(maxResults, 100);
    const pages = Math.ceil(maxResults / perPage);
    let allPRs: GitHubPR[] = [];

    for (let page = 1; page <= pages; page++) {
      const url = `${GITHUB_API_BASE}/search/issues?q=${searchQuery}&sort=created&order=desc&per_page=${perPage}&page=${page}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "PR-Tracker-Worker",
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(
          `GitHub API Error: ${response.status} - ${
            (error as any).message || response.statusText
          }`
        );
      }

      const data = (await response.json()) as GitHubSearchResponse;

      // Transform search results to PR format
      const prs = data.items.map((item: any) => ({
        id: item.id,
        number: item.number,
        title: item.title,
        body: item.body || "",
        url: item.html_url,
        state: item.state as "open" | "closed" | "merged",
        created_at: item.created_at,
        updated_at: item.updated_at,
        merged_at: item.pull_request?.merged_at,
        user: {
          login: item.user.login,
          avatar_url: item.user.avatar_url,
        },
        repo: {
          name: item.repository?.name || "",
          full_name: item.repository?.full_name || "",
          url: item.repository?.html_url || "",
        },
        labels: item.labels || [],
      }));

      allPRs = allPRs.concat(prs);
      if (allPRs.length >= maxResults) {
        allPRs = allPRs.slice(0, maxResults);
        break;
      }

      // Rate limiting: GitHub allows 30 requests per minute for search
      if (page < pages) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    return allPRs;
  } catch (error) {
    console.error("Error fetching PRs from GitHub:", error);
    throw error;
  }
}

export function getRepoName(fullName: string): string {
  return fullName.split("/").pop() || fullName;
}

export function extractDateFromPR(dateString: string): Date {
  return new Date(dateString);
}

export function isDateInRange(
  date: Date,
  startDate?: Date,
  endDate?: Date
): boolean {
  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;
  return true;
}
