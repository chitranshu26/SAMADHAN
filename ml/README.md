# Duplicate intelligence

The deployed classifier uses a fitted scikit-learn LogisticRegression model with
15 recomputed features: institution, complainant, category and subcategory
agreement; incident date proximity; Jaccard/token cosine; character trigram Dice;
training-fold TF-IDF cosine; literal description match; bureau difference; known
incident-cluster agreement; length ratio; and title similarity.

It reads simulation labels from the supplied `nlp_candidate_pairs.csv.gz` files.
The source's simulated embedding, similarity, confidence and attachment scores
are **not** features. There is no random scoring. A deterministic exact-match
rule requires the same identity and institution. An institution alone never
establishes duplication. Every suggestion needs a human decision.

```powershell
py -3.11 -m pip install -r ml/requirements.txt --target work/python-deps
py -3.11 -X utf8 ml/training/train.py
npx vitest run tests/unit/duplicate-model.test.ts
```

Training loads only 21,665 pairs and their 40,115 referenced source complaints,
not millions of workflow events. Connected candidate/incident components are
split 70/15/15 before TF-IDF fitting. No complaint identity or incident component
crosses train, validation and test partitions. The original `training_split`
column is ignored because it does not guarantee this stronger isolation.

`ml/models/evaluation.json` contains the confusion matrix, per-class precision,
recall/F1, held-out accuracy, macro F1, split sizes and limitations. The fitted
joblib artifact supports Python experimentation. The small versioned JSON exports
coefficients, scaler and vocabulary for `src/lib/ai/duplicate.ts`; deployed
inference needs no Python service. Parity tests compare Python and TypeScript
feature/probability outputs for every class to eight decimal places.

The labels, identities and template narratives are wholly synthetic. Scores are
measured on synthetic held-out components and say nothing about real AICTE case
performance. Existing incident clusters help imported-case overlap detection;
new complaints have no confirmed cluster and can have lower recall. Semantic
embeddings are optional and reported unavailable until a real provider/model is
integrated. No fabricated embedding values substitute for them.

Efficient live candidate retrieval is performed by the backend using indexed
institution IDs and bounded rows. Actual submitted descriptions are recomputed
at inference time. The similarity model is advisory; link/merge decisions preserve
both complaint IDs and an audit trail.
