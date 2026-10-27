import { describe, expect, it } from "vitest";
import examples from "../../ml/models/parity-examples.json";
import model from "../../ml/models/duplicate-model.json";
import { classifyPair, detectDuplicates, extractFeatures, modelInfo } from "../../src/lib/ai/duplicate";

describe("trained lexical duplicate classifier", () => {
  it("reproduces Python preprocessing features on each held-out simulation class", () => {
    for (const example of examples) {
      const actual = extractFeatures(example.a, example.b);
      expect(actual).toHaveLength(model.features.length);
      actual.forEach((number, index) => expect(number).toBeCloseTo(example.features[index], 8));
    }
  });
  it("reproduces the fitted Python multiclass probabilities", () => {
    for (const example of examples) {
      const actual = classifyPair(example.a, example.b);
      model.classes.forEach((label, index) => expect(actual.probabilities[label]).toBeCloseTo(example.probabilities[index], 8));
    }
  });
  it("detects an actual identical new submission from the same complainant", async () => {
    const original = { complaint_id: "EXISTING", institution_id: "INST-1", complainant_id: "PERSON-1", category_id: "FEE", subcategory_id: "FEE-01", incident_at_utc: "2026-10-25T00:00:00Z", title: "Refund pending after withdrawal", description: "I cancelled admission on 25 October and the institution has withheld the refundable deposit of INR 10000 after repeated requests.", current_bureau_id: "PGRC" };
    const duplicate = { ...original, complaint_id: "NEW" };
    const candidates = await detectDuplicates(duplicate, [original]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].case_id).toBe("EXISTING");
    expect(candidates[0].label).toBe("EXACT_DUPLICATE");
    expect(candidates[0].features.exact_description).toBe(1);
    expect(candidates[0].confidence).toBe(1);
  });
  it("flags a rewritten same-person case without a confirmed incident cluster", async () => {
    const example = examples.find((row) => row.ground_truth === "NEAR_DUPLICATE")!;
    const first = { ...example.a, incident_cluster_id: null };
    const second = { ...example.b, incident_cluster_id: null };
    expect(first.description).not.toEqual(second.description);
    const candidates = await detectDuplicates(first, [second]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].label).toBe("NEAR_DUPLICATE");
    expect(candidates[0].features.same_incident_cluster).toBe(0);
    expect(candidates[0].features.same_complainant).toBe(1);
  });
  it("flags different people describing one incident without disclosing or merging identities", async () => {
    const example = examples.find((row) => row.ground_truth === "SAME_INCIDENT_DISTINCT_PEOPLE")!;
    const first = { ...example.a, incident_cluster_id: null };
    const second = { ...example.b, incident_cluster_id: null };
    const candidates = await detectDuplicates(first, [second]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].label).toBe("SAME_INCIDENT_DISTINCT_PEOPLE");
    expect(candidates[0].features.same_complainant).toBe(0);
    expect(candidates[0].features.same_incident_cluster).toBe(0);
    expect(candidates[0]).not.toHaveProperty("complainant_id");
  });
  it("flags known cross-bureau incident overlap for coordinated human review", async () => {
    const example = examples.find((row) => row.ground_truth === "CROSS_BUREAU_OVERLAP")!;
    const candidates = await detectDuplicates(example.a, [example.b]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].label).toBe("CROSS_BUREAU_OVERLAP");
    expect(candidates[0].features.cross_bureau).toBe(1);
    expect(candidates[0].features.same_incident_cluster).toBe(1);
  });
  it("preserves independent cases as unflagged", async () => {
    const example = examples.find((row) => row.ground_truth === "INDEPENDENT")!;
    expect(await detectDuplicates(example.a, [example.b])).toEqual([]);
  });
  it("never flags institution identity alone as a duplicate", async () => {
    const first = { complaint_id: "A", institution_id: "INST-1", complainant_id: "ONE", category_id: "FEE", title: "Scholarship reimbursement", description: "Scholarship reimbursement for academic year 2025 remains unpaid.", incident_at_utc: "2026-01-01T00:00:00Z", current_bureau_id: "PGRC" };
    const second = { complaint_id: "B", institution_id: "INST-1", complainant_id: "TWO", category_id: "RAG", title: "Hostel safety incident", description: "Physical intimidation in the hostel was reported to the anti ragging committee.", incident_at_utc: "2026-10-25T00:00:00Z", current_bureau_id: "RAG" };
    expect(await detectDuplicates(first, [second])).toEqual([]);
  });
  it("rejects even identical text at a different institution", async () => {
    const first = { complaint_id: "A", institution_id: "INST-A", complainant_id: "PERSON", description: "My refund has not been received after admission cancellation." };
    const second = { ...first, complaint_id: "B", institution_id: "INST-B" };
    expect(classifyPair(first, second).label).toBe("INDEPENDENT");
    expect(await detectDuplicates(first, [second])).toEqual([]);
  });
  it("does not compare a complaint with itself", async () => {
    const row = { complaint_id: "SELF", institution_id: "SYN", complainant_id: "DEMO", description: "A grievance narrative" };
    expect(await detectDuplicates(row, [row])).toEqual([]);
  });
  it("discloses synthetic training, unavailable semantics, and leakage checks", async () => {
    const info = await modelInfo();
    expect(info.synthetic_training).toBe(true);
    expect(info.semantic_embeddings_available).toBe(false);
    expect(info.simulated_similarity_features_used).toBe(false);
    expect(info.human_review_required).toBe(true);
    expect((info.evaluation as Record<string, unknown>).leaked_complaint_ids).toBe(0);
  });
});
