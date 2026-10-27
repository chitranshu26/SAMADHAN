import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../src/components/ui";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("client API errors", () => {
  it("does not display an HTML server error page as text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      "<!doctype html><html><body>Bad Gateway</body></html>",
      { status: 502, headers: { "Content-Type": "text/html" } },
    )));

    await expect(api("/api/auth/login", { email: "demo@example.test", password: "example" }))
      .rejects.toThrow("Server error (502). Please try again later.");
  });

  it("preserves JSON API error messages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: "Invalid email or password." }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    )));

    await expect(api("/api/auth/login", { email: "demo@example.test", password: "example" }))
      .rejects.toThrow("Invalid email or password.");
  });
});
