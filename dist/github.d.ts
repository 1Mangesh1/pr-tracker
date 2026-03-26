/**
 * GitHub API Integration
 */
import type { GitHubPR } from "./types";
export declare function fetchPRsFromGitHub(query: string, token: string, maxResults?: number): Promise<GitHubPR[]>;
export declare function getRepoName(fullName: string): string;
export declare function extractDateFromPR(dateString: string): Date;
export declare function isDateInRange(date: Date, startDate?: Date, endDate?: Date): boolean;
//# sourceMappingURL=github.d.ts.map