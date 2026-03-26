/**
 * Cloudflare Workers AI Integration
 */
const AI_SYSTEM_PROMPT = `You are an expert software engineer analyzing GitHub pull requests.
Analyze the given PR title and description, and respond with ONLY valid JSON (no markdown, no explanation).

Your response must be:
{
  "summary": "1-2 sentence technical summary of what this PR does",
  "domain": "Backend | Frontend | DevOps | Infra | Fullstack | Testing | Docs | Other",
  "tags": ["Technology1", "Technology2", "Technology3"]
}

domain must be ONE of: Backend, Frontend, DevOps, Infra, Fullstack, Testing, Docs, Other
tags should include programming languages, frameworks, tools, services mentioned or implied (max 5 tags)

Return ONLY the JSON object, nothing else.`;
export async function summarizePR(ai, title, body, repoName) {
    try {
        const userPrompt = `Repository: ${repoName}
Title: ${title}
Description: ${body || "(No description)"}

Analyze this PR and return the JSON response.`;
        const response = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
            prompt: userPrompt,
            system_prompt: AI_SYSTEM_PROMPT,
            max_tokens: 500,
        });
        // Extract text response
        let responseText = "";
        if (typeof response === "string") {
            responseText = response;
        }
        else if (response &&
            typeof response === "object" &&
            "response" in response) {
            responseText = response.response;
        }
        else {
            console.error("Unexpected AI response format:", response);
            throw new Error("Invalid AI response format");
        }
        // Parse JSON from response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error("No JSON found in AI response:", responseText);
            throw new Error("AI did not return valid JSON");
        }
        const parsed = JSON.parse(jsonMatch[0]);
        // Validate response structure
        if (!parsed.summary || !parsed.domain || !Array.isArray(parsed.tags)) {
            throw new Error("Invalid AI response structure");
        }
        // Normalize domain
        const validDomains = [
            "Backend",
            "Frontend",
            "DevOps",
            "Infra",
            "Fullstack",
            "Testing",
            "Docs",
            "Other",
        ];
        if (!validDomains.includes(parsed.domain)) {
            parsed.domain = "Other";
        }
        // Ensure tags are strings and limit to 5
        parsed.tags = parsed.tags
            .filter((tag) => typeof tag === "string" && tag.length > 0)
            .slice(0, 5);
        return parsed;
    }
    catch (error) {
        console.error("Error summarizing PR with AI:", error);
        throw error;
    }
}
export async function summarizeWithRetry(ai, title, body, repoName, maxRetries = 2) {
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await summarizePR(ai, title, body, repoName);
        }
        catch (error) {
            lastError = error;
            console.error(`Summarization attempt ${attempt + 1} failed:`, error);
            if (attempt < maxRetries) {
                // Exponential backoff
                const delay = Math.pow(2, attempt) * 1000;
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }
    throw new Error(`Failed to summarize PR after ${maxRetries + 1} attempts: ${lastError?.message}`);
}
export function calculateTokenCost(text) {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
}
