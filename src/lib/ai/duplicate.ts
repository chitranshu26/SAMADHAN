import modelArtifact from "../../../ml/models/duplicate-model.json";

type Row = Record<string, unknown>;
type PairLabel = "EXACT_DUPLICATE" | "NEAR_DUPLICATE" | "SAME_INCIDENT_DISTINCT_PEOPLE" | "CROSS_BUREAU_OVERLAP" | "SAME_INSTITUTION_ONLY" | "INDEPENDENT";
type Thresholds = { duplicate: number; related: number; overlap: number };
type Artifact = {
  version: string; model_type: string; features: string[]; classes: string[];
  coefficients: number[][]; intercepts: number[]; mean: number[]; scale: number[];
  tfidf: { vocabulary: Record<string, number>; idf: number[]; sublinear_tf: boolean };
  stopwords: string[]; thresholds: Thresholds; evaluation: Row;
  semantic_embeddings_available: boolean; trained_at_utc: string;
};
const model = modelArtifact as Artifact;
const stopwords = new Set(model.stopwords);

function value(row: Row, ...keys: string[]): string {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null) return String(row[key]);
  return "";
}

/** Shared normalization with ml/training/train.py; ignores synthetic reference IDs for lexical similarity. */
export function normalizeText(text: unknown): string {
  return (String(text ?? "").toLowerCase().replace(/syn[- ]?\d+/g, "incidentref").match(/[a-z0-9]+/g) ?? []).join(" ");
}
function exactText(text: unknown): string { return (String(text ?? "").toLowerCase().match(/[a-z0-9]+/g) ?? []).join(" "); }
function tokens(text: unknown): string[] { return normalizeText(text).split(" ").filter((word) => word && !stopwords.has(word)); }
function jaccard(first: string[], second: string[]): number {
  const a = new Set(first), b = new Set(second);
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  return intersection / Math.max(1, a.size + b.size - intersection);
}
function counts(words: string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const word of words) result.set(word, (result.get(word) ?? 0) + 1);
  return result;
}
function tokenCosine(a: string[], b: string[]): number {
  const first = counts(a), second = counts(b);
  let dot = 0, aa = 0, bb = 0;
  for (const [key, count] of first) { dot += count * (second.get(key) ?? 0); aa += count * count; }
  for (const count of second.values()) bb += count * count;
  return dot / Math.max(1e-12, Math.sqrt(aa * bb));
}
function trigrams(text: string): Set<string> {
  const output = new Set<string>();
  for (let i = 0; i < text.length - 2; i++) output.add(text.slice(i, i + 3));
  return output;
}
function trigramDice(a: string, b: string): number {
  const first = trigrams(a), second = trigrams(b);
  let common = 0;
  for (const gram of first) if (second.has(gram)) common++;
  return 2 * common / Math.max(1, first.size + second.size);
}
function textFor(row: Row): string { return normalizeText(`${value(row, "title")} ${value(row, "description")}`); }
function tfidfVector(text: string): Map<number, number> {
  const frequencies = counts(text.split(" ").filter(Boolean));
  const vector = new Map<number, number>();
  let norm = 0;
  for (const [word, count] of frequencies) {
    const index = model.tfidf.vocabulary[word];
    if (index === undefined) continue;
    const weight = (1 + Math.log(count)) * model.tfidf.idf[index];
    vector.set(index, weight);
    norm += weight * weight;
  }
  norm = Math.sqrt(norm);
  if (norm) for (const [index, weight] of vector) vector.set(index, weight / norm);
  return vector;
}
function tfidfCosine(a: string, b: string): number {
  const first = tfidfVector(a), second = tfidfVector(b);
  let dot = 0;
  for (const [index, weight] of first) dot += weight * (second.get(index) ?? 0);
  return Math.min(1, Math.max(0, dot));
}
function same(a: Row, b: Row, keys: string[]): number { const first = value(a, ...keys); return Number(Boolean(first) && first === value(b, ...keys)); }

export function extractFeatures(a: Row, b: Row): number[] {
  const first = textFor(a), second = textFor(b);
  const firstTokens = tokens(first), secondTokens = tokens(second);
  const firstDate = Date.parse(value(a, "incident_at_utc", "incident_date", "incidentDate"));
  const secondDate = Date.parse(value(b, "incident_at_utc", "incident_date", "incidentDate"));
  const days = Number.isFinite(firstDate) && Number.isFinite(secondDate) ? Math.abs(firstDate - secondDate) / 86400000 : 365;
  const descriptionA = exactText(value(a, "description")), descriptionB = exactText(value(b, "description"));
  const bureauA = value(a, "current_bureau_id", "bureau_id", "bureauId"), bureauB = value(b, "current_bureau_id", "bureau_id", "bureauId");
  return [
    same(a, b, ["institution_id", "institutionId"]),
    same(a, b, ["complainant_id", "user_id", "complainantId"]),
    same(a, b, ["category_id", "categoryId"]),
    same(a, b, ["subcategory_id", "subcategoryId"]),
    Math.exp(-Math.min(days, 365) / 30), Number(days <= 7),
    jaccard(firstTokens, secondTokens), tokenCosine(firstTokens, secondTokens),
    trigramDice(first, second), tfidfCosine(first, second),
    Number(Boolean(descriptionA) && descriptionA === descriptionB),
    Number(Boolean(bureauA) && Boolean(bureauB) && bureauA !== bureauB),
    same(a, b, ["incident_cluster_id", "incidentClusterId"]),
    Math.min(first.length, second.length) / Math.max(1, first.length, second.length),
    jaccard(tokens(value(a, "title")), tokens(value(b, "title"))),
  ];
}

/** Runs the exported fitted LogisticRegression coefficients, without a Python service. */
export function classifyPair(a: Row, b: Row) {
  const raw = extractFeatures(a, b);
  const standardized = raw.map((n, i) => (n - model.mean[i]) / (model.scale[i] || 1));
  const logits = model.coefficients.map((weights, i) => weights.reduce((sum, weight, j) => sum + weight * standardized[j], model.intercepts[i]));
  const maximum = Math.max(...logits);
  const exponentials = logits.map((logit) => Math.exp(logit - maximum));
  const denominator = exponentials.reduce((sum, n) => sum + n, 0);
  const probabilities = exponentials.map((n) => n / denominator);
  const index = probabilities.indexOf(Math.max(...probabilities));
  const featureMap = Object.fromEntries(model.features.map((name, i) => [name, raw[i]]));
  let label = model.classes[index] as PairLabel;
  let confidence = probabilities[index];
  // A literal exact match is an independently testable rule. It needs matching
  // identity and institution; it never relies on a random/simulated score.
  if (raw[0] && raw[1] && raw[10]) { label = "EXACT_DUPLICATE"; confidence = 1; }
  if (!raw[0]) { label = "INDEPENDENT"; confidence = 1; }
  return { label, confidence, features: featureMap, probabilities: Object.fromEntries(model.classes.map((name, i) => [name, probabilities[i]])) };
}

export async function detectDuplicates(input: Row, candidates: Row[], thresholds: Partial<Thresholds> = {}) {
  const settings = { ...model.thresholds, ...thresholds };
  const output: Array<{ case_id: string; label: PairLabel; confidence: number; features: Record<string, number>; reasons: string[] }> = [];
  for (const candidate of candidates) {
    const caseId = value(candidate, "complaint_id", "case_id", "id");
    if (!caseId || caseId === value(input, "complaint_id", "case_id", "id")) continue;
    const result = classifyPair(input, candidate);
    if (["INDEPENDENT", "SAME_INSTITUTION_ONLY"].includes(result.label)) continue;
    const minimum = result.label === "CROSS_BUREAU_OVERLAP" ? settings.overlap : result.label === "SAME_INCIDENT_DISTINCT_PEOPLE" ? settings.related : settings.duplicate;
    if (result.confidence < minimum || !result.features.same_institution) continue;
    // A bureau difference by itself never establishes overlap.
    if (result.label === "CROSS_BUREAU_OVERLAP" && !result.features.same_incident_cluster && (result.features.word_jaccard < .35 || result.features.date_proximity < Math.exp(-2))) continue;
    const reasons = ["Same synthetic institution"];
    if (result.features.same_complainant) reasons.push("Same complainant identity");
    if (result.features.same_category) reasons.push("Matching category");
    if (result.features.exact_description) reasons.push("Exact normalized description match");
    if (result.features.date_within_7_days) reasons.push("Incident dates within seven days");
    if (result.features.same_incident_cluster) reasons.push("Existing incident cluster agrees");
    if (result.features.cross_bureau) reasons.push("Different bureau ownership: coordination review needed");
    reasons.push(`Recomputed TF-IDF similarity ${Math.round(result.features.tfidf_cosine * 100)}%`);
    output.push({ case_id: caseId, label: result.label, confidence: result.confidence, features: result.features, reasons });
  }
  return output.sort((a, b) => b.confidence - a.confidence).slice(0, 12);
}

export async function modelInfo(): Promise<Row> {
  return { version: model.version, model_type: model.model_type, synthetic_training: true, features: model.features, thresholds: model.thresholds, evaluation: model.evaluation, semantic_embeddings_available: model.semantic_embeddings_available, trained_at_utc: model.trained_at_utc, human_review_required: true, simulated_similarity_features_used: false, source: "Supplied synthetic nlp_candidate_pairs labels; actual descriptions recomputed" };
}
