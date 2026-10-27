import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeComplaint } from "../../src/lib/ai/assistant";
import { APIError } from "../../src/lib/security/auth";

const taxonomy = [{
  category_id: "FEE",
  category_name: "Fees and refunds",
  subcategories: [{ subcategory_id: "FEE-REFUND", subcategory_name: "Refund delay" }],
}];

const analysis = {
  summary: "The student reports that a refund remains unpaid.",
  category_id: "FEE",
  subcategory_id: "FEE-REFUND",
  urgency: "normal",
  language: "English",
  key_points: ["Refund requested after withdrawal"],
  risk_cues: [],
  rationale: "The narrative describes a delayed refund.",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("hosted complaint-language assistant", () => {
  it("does not call an external provider until all server settings exist", async () => {
    vi.stubEnv("AI_BASE_URL", "");
    vi.stubEnv("AI_API_KEY", "");
    vi.stubEnv("AI_MODEL", "");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(analyzeComplaint({ title: "Refund delay", description: "The refund has not arrived after my withdrawal." }, taxonomy))
      .rejects.toMatchObject({ status: 503 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends only consented complaint text and taxonomy, then validates the model response", async () => {
    vi.stubEnv("AI_BASE_URL", "https://provider.example/v1/");
    vi.stubEnv("AI_API_KEY", "test-only-key");
    vi.stubEnv("AI_MODEL", "test-model");
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(analysis) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);

    const result = await analyzeComplaint({
      title: "Refund delay",
      description: "The refund has not arrived after my withdrawal.",
      current_category_id: "FEE",
    }, taxonomy);

    expect(result).toMatchObject({ ...analysis, model: "test-model", human_review_required: true });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("https://provider.example/v1/chat/completions");
    expect(options.redirect).toBe("error");
    expect(options.headers.Authorization).toBe("Bearer test-only-key");
    const sent = JSON.parse(options.body);
    expect(sent.messages[1].content).toContain("The refund has not arrived");
    expect(sent.messages[1].content).not.toContain("complainant_id");
    expect(sent.messages[1].content).toContain("FEE-REFUND");
  });

  it("rejects taxonomy hallucinations rather than presenting them as valid suggestions", async () => {
    vi.stubEnv("AI_BASE_URL", "https://provider.example/v1");
    vi.stubEnv("AI_API_KEY", "test-only-key");
    vi.stubEnv("AI_MODEL", "test-model");
    const invalid = { ...analysis, category_id: "MADE_UP" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(invalid) } }],
    }), { status: 200 })));

    await expect(analyzeComplaint({ title: "Refund delay", description: "The refund has not arrived after my withdrawal." }, taxonomy))
      .rejects.toMatchObject({ status: 502 });
  });

  it("requires HTTPS for non-local providers", async () => {
    vi.stubEnv("AI_BASE_URL", "http://provider.example/v1");
    vi.stubEnv("AI_API_KEY", "test-only-key");
    vi.stubEnv("AI_MODEL", "test-model");

    await expect(analyzeComplaint({ title: "Refund delay", description: "The refund has not arrived after my withdrawal." }, taxonomy))
      .rejects.toBeInstanceOf(APIError);
  });
});
