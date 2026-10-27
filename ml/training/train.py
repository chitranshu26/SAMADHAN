"""Train an interpretable lexical duplicate classifier on synthetic pair labels.

Similarity is recomputed from supplied complaint narratives. Simulated similarity,
confidence, predicted label, train split and attachment features are never inputs.
Connected complaint/incident components stay within one split.
"""
from __future__ import annotations

import argparse
import collections
import csv
import gzip
import io
import json
import math
import pathlib
import re
import sys
import time
import zipfile
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[2]
if (ROOT / "work/python-deps").exists():
    sys.path.insert(0, str(ROOT / "work/python-deps"))
import joblib
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.preprocessing import StandardScaler

FEATURES = ["same_institution", "same_complainant", "same_category", "same_subcategory", "date_proximity", "date_within_7_days", "word_jaccard", "token_cosine", "character_trigram_dice", "tfidf_cosine", "exact_description", "cross_bureau", "same_incident_cluster", "length_ratio", "title_jaccard"]
STOPWORDS = set("a an the i am is are was were be been to of for and or in on at with by from as my me our we it this that have has had not but do does did can could would should will about into upon please institution college complaint incident reference syn".split())


def normalize(text):
    text = re.sub(r"syn[- ]?\d+", "incidentref", str(text or "").lower())
    return " ".join(re.findall(r"[a-z0-9]+", text))


def tokens(text):
    return [word for word in normalize(text).split() if word not in STOPWORDS]


def jaccard(a, b):
    a, b = set(a), set(b)
    return len(a & b) / max(1, len(a | b))


def chargrams(text):
    return {text[i:i + 3] for i in range(max(0, len(text) - 2))}


def same(a, b, key):
    return float(bool(a.get(key)) and a.get(key) == b.get(key))


def text_for(row):
    return normalize(str(row.get("title") or "") + " " + str(row.get("description") or ""))


def features(a, b, tfidf_cosine):
    text_a, text_b = text_for(a), text_for(b)
    ta, tb = tokens(text_a), tokens(text_b)
    ca, cb = collections.Counter(ta), collections.Counter(tb)
    dot = sum(v * cb[k] for k, v in ca.items())
    token_cos = dot / max(1e-12, math.sqrt(sum(v * v for v in ca.values()) * sum(v * v for v in cb.values())))
    ga, gb = chargrams(text_a), chargrams(text_b)
    char_dice = 2 * len(ga & gb) / max(1, len(ga) + len(gb))
    try:
        days = abs((datetime.fromisoformat(a["incident_at_utc"].replace("Z", "+00:00")) - datetime.fromisoformat(b["incident_at_utc"].replace("Z", "+00:00"))).total_seconds()) / 86400
    except (KeyError, TypeError, ValueError):
        days = 365
    # Exact matching retains the incident reference and never strips IDs.
    exact_a = " ".join(re.findall(r"[a-z0-9]+", str(a.get("description") or "").lower()))
    exact_b = " ".join(re.findall(r"[a-z0-9]+", str(b.get("description") or "").lower()))
    return [same(a, b, "institution_id"), same(a, b, "complainant_id"), same(a, b, "category_id"), same(a, b, "subcategory_id"), math.exp(-min(days, 365) / 30), float(days <= 7), jaccard(ta, tb), token_cos, char_dice, tfidf_cosine, float(bool(exact_a) and exact_a == exact_b), float(bool(a.get("current_bureau_id")) and bool(b.get("current_bureau_id")) and a["current_bureau_id"] != b["current_bureau_id"]), same(a, b, "incident_cluster_id"), min(len(text_a), len(text_b)) / max(1, len(text_a), len(text_b)), jaccard(tokens(a.get("title")), tokens(b.get("title")))]


class UnionFind:
    def __init__(self):
        self.parent = {}

    def find(self, value):
        self.parent.setdefault(value, value)
        if self.parent[value] != value:
            self.parent[value] = self.find(self.parent[value])
        return self.parent[value]

    def union(self, a, b):
        self.parent[self.find(b)] = self.find(a)


def rows(archive, filename):
    with archive.open(filename) as raw, gzip.GzipFile(fileobj=raw) as unzip, io.TextIOWrapper(unzip, encoding="utf-8", newline="") as text:
        yield from csv.DictReader(text)


def main(args):
    started = time.time()
    output = pathlib.Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.archive) as archive:
        pair_files = sorted(n for n in archive.namelist() if n.endswith("/nlp_candidate_pairs.csv.gz"))
        pairs = [row for filename in pair_files for row in rows(archive, filename)]
        needed = {row[column] for row in pairs for column in ("case_id_a", "case_id_b")}
        complaints = {}
        for filename in sorted(n for n in archive.namelist() if n.endswith("/complaints.csv.gz")):
            for row in rows(archive, filename):
                if row["complaint_id"] in needed:
                    complaints[row["complaint_id"]] = row
        print(json.dumps({"status": "source_loaded", "pairs": len(pairs), "referenced_complaints": len(complaints)}), flush=True)
    missing = [r for r in pairs if r["case_id_a"] not in complaints or r["case_id_b"] not in complaints]
    if missing:
        raise ValueError(f"{len(missing)} pairs reference missing source complaints")
    union = UnionFind()
    incidents = {}
    for pair in pairs:
        union.union(pair["case_id_a"], pair["case_id_b"])
    for cid, row in complaints.items():
        cluster = row.get("incident_cluster_id")
        if cluster:
            if cluster in incidents:
                union.union(cid, incidents[cluster])
            else:
                incidents[cluster] = cid
    groups = np.array([union.find(pair["case_id_a"]) for pair in pairs])
    labels = np.array([pair["ground_truth_synthetic"] for pair in pairs])
    indices = np.arange(len(pairs))
    train, temporary = next(GroupShuffleSplit(n_splits=1, test_size=.30, random_state=47).split(indices, labels, groups))
    validation_part, test_part = next(GroupShuffleSplit(n_splits=1, test_size=.50, random_state=48).split(temporary, labels[temporary], groups[temporary]))
    validation, test = temporary[validation_part], temporary[test_part]
    train_ids = {pairs[i][key] for i in train for key in ("case_id_a", "case_id_b")}
    validation_ids = {pairs[i][key] for i in validation for key in ("case_id_a", "case_id_b")}
    test_ids = {pairs[i][key] for i in test for key in ("case_id_a", "case_id_b")}
    assert not train_ids & test_ids and not train_ids & validation_ids and not validation_ids & test_ids
    assert not set(groups[train]) & set(groups[test])
    vectorizer = TfidfVectorizer(lowercase=False, token_pattern=r"(?u)\b[a-z0-9]+\b", min_df=2, max_features=5000, sublinear_tf=True)
    vectorizer.fit([text_for(complaints[cid]) for cid in sorted(train_ids)])
    all_ids = sorted(complaints)
    vectors = vectorizer.transform([text_for(complaints[cid]) for cid in all_ids])
    locations = {cid: i for i, cid in enumerate(all_ids)}
    left = np.array([locations[pair["case_id_a"]] for pair in pairs])
    right = np.array([locations[pair["case_id_b"]] for pair in pairs])
    cosine = np.asarray(vectors[left].multiply(vectors[right]).sum(axis=1)).ravel()
    matrix = np.array([features(complaints[pair["case_id_a"]], complaints[pair["case_id_b"]], float(cosine[i])) for i, pair in enumerate(pairs)])
    scaler = StandardScaler().fit(matrix[train])
    classifier = LogisticRegression(C=.6, class_weight="balanced", max_iter=1500, random_state=47)
    # Live submissions do not yet have a confirmed incident cluster. Train a
    # lower-weight missing-cluster view of TRAINING rows only, so that a useful
    # lexical/date signal is not overwhelmed by known historical cluster IDs.
    # This is feature-missingness augmentation, not a new fabricated label.
    unknown_cluster = matrix[train].copy()
    unknown_cluster[:, FEATURES.index("same_incident_cluster")] = 0
    augmented_matrix = np.concatenate((matrix[train], unknown_cluster))
    augmented_labels = np.concatenate((labels[train], labels[train]))
    classifier.fit(scaler.transform(augmented_matrix), augmented_labels, sample_weight=np.concatenate((np.ones(len(train)), np.full(len(train), .35))))
    classes = list(classifier.classes_)

    def evaluate(split):
        prediction = classifier.predict(scaler.transform(matrix[split]))
        return {"rows": len(split), "accuracy": float(accuracy_score(labels[split], prediction)), "macro_f1": float(f1_score(labels[split], prediction, average="macro")), "weighted_f1": float(f1_score(labels[split], prediction, average="weighted")), "classification_report": classification_report(labels[split], prediction, labels=classes, output_dict=True, zero_division=0), "confusion_matrix": confusion_matrix(labels[split], prediction, labels=classes).tolist(), "labels": classes}

    evaluation = {
        "model_version": "lexical-logreg-v1",
        "model_type": "scikit-learn LogisticRegression + StandardScaler + training-fold TF-IDF",
        "synthetic_not_official": True,
        "training_pairs": len(pairs),
        "feature_names": FEATURES,
        "split_method": "Connected components of all candidate pair endpoints and known incident clusters; grouped 70/15/15 holdout, seeds 47/48",
        "split_counts": {"train": len(train), "validation": len(validation), "test": len(test)},
        "unique_complaints": len(complaints),
        "leaked_complaint_ids": 0,
        "leaked_incident_components": 0,
        "training_missing_cluster_augmentation": "A second view of training rows with cluster agreement unknown/zero, weighted 0.35; holdouts are untouched.",
        "simulated_similarity_features_used": False,
        "validation": evaluate(validation),
        "test": evaluate(test),
        "limitations": ["Ground truth and narratives are synthetic, largely template based, and do not establish real-world performance.", "Known incident-cluster agreement is a useful feature for imported cases. Newly submitted cases lack confirmed clusters until human review and can have lower overlap recall.", "Semantic embedding service is not configured; real TF-IDF, token and character features provide the lexical fallback.", "Attachment hashes are not used in training because source hashes are simulated; no simulated similarity scores are passed to live inference.", "Same institution alone is never a duplicate decision. Officers adjudicate suggestions; no complaint is deleted."],
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
    }
    model = {
        "version": evaluation["model_version"],
        "model_type": evaluation["model_type"],
        "synthetic_training": True,
        "features": FEATURES,
        "classes": classes,
        "coefficients": classifier.coef_.tolist(),
        "intercepts": classifier.intercept_.tolist(),
        "mean": scaler.mean_.tolist(),
        "scale": scaler.scale_.tolist(),
        "tfidf": {"vocabulary": vectorizer.vocabulary_, "idf": vectorizer.idf_.tolist(), "sublinear_tf": True},
        "stopwords": sorted(STOPWORDS),
        "thresholds": {"duplicate": .65, "related": .55, "overlap": .55},
        "evaluation": {"test_accuracy": evaluation["test"]["accuracy"], "test_macro_f1": evaluation["test"]["macro_f1"], "test_weighted_f1": evaluation["test"]["weighted_f1"], "test_pairs": len(test), "training_pairs": len(train), "validation_pairs": len(validation), "leaked_complaint_ids": 0},
        "semantic_embeddings_available": False,
        "trained_at_utc": evaluation["trained_at_utc"],
    }
    # Some numpy versions use np.int64 vocabulary indices; normalize via encoder.
    (output / "duplicate-model.json").write_text(json.dumps(model, indent=2, default=lambda v: v.item() if hasattr(v, "item") else str(v)), encoding="utf-8")
    (output / "evaluation.json").write_text(json.dumps(evaluation, indent=2), encoding="utf-8")
    joblib.dump({"model": classifier, "scaler": scaler, "tfidf": vectorizer}, output / "duplicate-model.joblib")
    # Export deterministic parity examples for the JavaScript inference tests.
    examples = []
    for label in classes:
        match = next(int(i) for i in test if labels[i] == label)
        pair = pairs[match]
        examples.append({"a": complaints[pair["case_id_a"]], "b": complaints[pair["case_id_b"]], "features": matrix[match].tolist(), "probabilities": classifier.predict_proba(scaler.transform(matrix[[match]]))[0].tolist(), "ground_truth": label})
    (output / "parity-examples.json").write_text(json.dumps(examples, indent=2), encoding="utf-8")
    print(json.dumps({"status": "complete", "seconds": round(time.time() - started, 2), "test_accuracy": evaluation["test"]["accuracy"], "test_macro_f1": evaluation["test"]["macro_f1"], "test_pairs": len(test), "leakage": 0}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", default=str(pathlib.Path.home() / "Downloads/AICTE_Complaint_Lifecycle_Synthetic_200k.zip"))
    parser.add_argument("--output", default=str(ROOT / "ml/models"))
    main(parser.parse_args())
