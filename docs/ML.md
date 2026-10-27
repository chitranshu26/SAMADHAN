# AI duplicate and overlap model

The implemented baseline is **scikit-learn LogisticRegression**, preceded by
StandardScaler and a training-fold TF-IDF vectorizer. It classifies six simulation
labels: exact duplicate, near duplicate, same incident/distinct people,
cross-bureau overlap, same institution only, and independent.

All **21,665** supplied candidate pairs were used, referencing **40,115** source
complaints. The source's simulated embedding cosine, lexical scores, attachment
hash agreement, confidence, predicted label and original split columns were not
used as model inputs. Actual descriptions are recomputed with the same Python
and TypeScript preprocessing.

The 15 features are institution, complainant, category and subcategory agreement;
date proximity and seven-day agreement; word Jaccard, token cosine, character
trigram Dice and TF-IDF cosine; literal description agreement; bureau difference;
known incident-cluster agreement; length ratio; and title Jaccard. Same institution
alone never establishes a duplicate. Exact identical same-person submissions are
also detected through a deterministic, auditable literal matching rule.

## Evaluation

Connected components are built from candidate endpoints and known incident
clusters before a grouped 70/15/15 split. TF-IDF and scaling are fitted only on the
training partition. A lower-weight second view of training rows sets known
cluster agreement to unknown/zero so that live cases lacking confirmed clusters
can still be evaluated through lexical/date features. Validation/test rows are
untouched. **Zero complaint identities or incident components cross splits.**

| Partition / metric | Result |
| --- | ---: |
| Training pairs | 15,148 |
| Validation pairs | 3,250 |
| Test pairs | 3,267 |
| Held-out accuracy | 81.48% |
| Held-out macro F1 | 82.91% |

`ml/models/evaluation.json` contains complete per-class precision, recall, F1,
support and confusion matrices. Most confusion occurs between the two unflagged
negative classes, independent and same-institution-only. These labels are not
reliably distinguished by many of the template narratives. Measured synthetic
performance is not evidence of accuracy on real grievance language.

## Runtime and decision policy

The deployed TypeScript module runs the exported fitted coefficients, scaler and
TF-IDF vocabulary directly. It needs no permanently running Python service.
The backend retrieves a bounded candidate set using indexed institution identity;
new submitted descriptions are recomputed instead of replaying historical scores.

`classifyPair` exposes all six class probabilities and real features;
`detectDuplicates` returns only threshold-passing suspicious candidates. Default
thresholds are 0.65 for duplicates and 0.55 for related/overlap suggestions, and
the backend may pass configured overrides. A bureau difference without existing
cluster agreement or meaningful lexical/date agreement is not flagged alone.
All positive suggestions require a human decision. Linking retains both IDs.

The model artifact is `ml/models/duplicate-model.json`; a Python joblib version is
also saved. Python/TypeScript parity examples cover every class. Automated tests
compare every feature and fitted class probability to eight decimal places and
test exact, rewritten, distinct-person, known overlap, independent and unrelated
same-institution cases. New distinct-person and near cases are tested with their
known cluster fields deliberately removed.

Semantic embeddings are reported **unavailable**. No inference provider has been
configured, and no simulated semantic score substitutes for one. Attachment
hashes are excluded because source hashes are simulated. Known clusters help
historical overlap recognition; live cross-bureau reports with unrelated wording
can have lower recall until human linkage establishes a cluster. These limits
are recorded in the evaluation and model-information endpoint.

## Optional hosted complaint-language assistance

The complaint form also supports an explicitly consented OpenAI-compatible
assistant for a concise neutral summary, category/subcategory suggestion,
language label, urgency cues, and key points. Configure `AI_BASE_URL`, `AI_API_KEY`,
and `AI_MODEL` on the server; `AI_BASE_URL` is the API root ending at `/v1`
(for example, `https://api.openai.com/v1`), not the `chat/completions` endpoint.
No provider request is made unless the user checks
the disclosure and explicitly runs an analysis. Only the title, description, and
current category choice plus approved category taxonomy are sent; account
identity and institution data are not included. The provider response is
schema-checked against the taxonomy.

The assistant is advisory: it does not set urgency, route or submit complaints,
make legal findings, or decide case merit. Provider failures are surfaced to the
user. Hosted inference may process complaint text outside the application;
operators must select a provider and retention policy appropriate to their data.
The existing duplicate/overlap model continues to run locally without a provider.

Reproduce training and tests with the commands in `ml/README.md`.
