/**
 * Minimal test worker to diagnose router issues
 */

import { Router } from "itty-router";

const router = Router();

// Simple health check
router.get("/health", () => {
  return new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

// Simple API test
router.post("/api/test", async (req: Request) => {
  try {
    const body = await req.json();
    return new Response(JSON.stringify({ success: true, data: body }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

// 404
router.all("*", () => {
  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
});

export default {
  async fetch(request: Request) {
    return router.handle(request);
  },
};
