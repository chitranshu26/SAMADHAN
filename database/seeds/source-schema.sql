-- 100% synthetic dataset. As-of 2026-10-27T18:30Z. Do not mistake demo policies for AICTE rules.
-- For CSV imports, load master tables first, complaints next, then child fact tables.
-- For dashboard_daily_metrics, aggregate duplicate composite keys across shards with SUMs; no PK is imposed.
CREATE SCHEMA IF NOT EXISTS aicte_demo;
SET search_path TO aicte_demo, public;

CREATE TABLE IF NOT EXISTS regions (
    region_id TEXT NOT NULL,
    region_name TEXT,
    office_city TEXT,
    source_type TEXT,
    as_of_date DATE,
    current_mapping_verified BOOLEAN,
    PRIMARY KEY (region_id)
);

CREATE TABLE IF NOT EXISTS states (
    state_code TEXT NOT NULL,
    state_name TEXT,
    region_id TEXT,
    jurisdiction_source TEXT,
    jurisdiction_current_verified BOOLEAN,
    sample_cities TEXT,
    PRIMARY KEY (state_code),
    FOREIGN KEY (region_id) REFERENCES regions(region_id)
);

CREATE TABLE IF NOT EXISTS bureaus (
    bureau_id TEXT NOT NULL,
    bureau_name TEXT,
    source_type TEXT,
    PRIMARY KEY (bureau_id)
);

CREATE TABLE IF NOT EXISTS categories (
    category_id TEXT NOT NULL,
    category_name TEXT,
    default_bureau_id TEXT,
    proposed_sla_days BIGINT,
    priority_label TEXT,
    official_policy_verified BOOLEAN,
    PRIMARY KEY (category_id),
    FOREIGN KEY (default_bureau_id) REFERENCES bureaus(bureau_id)
);

CREATE TABLE IF NOT EXISTS subcategories (
    subcategory_id TEXT NOT NULL,
    category_id TEXT,
    subcategory_name TEXT,
    PRIMARY KEY (subcategory_id),
    FOREIGN KEY (category_id) REFERENCES categories(category_id)
);

CREATE TABLE IF NOT EXISTS sla_policies (
    sla_policy_id TEXT NOT NULL,
    category_id TEXT,
    target_hours BIGINT,
    calendar_type TEXT,
    effective_from_utc TEXT,
    effective_to_utc TEXT,
    policy_source TEXT,
    verified_official BOOLEAN,
    PRIMARY KEY (sla_policy_id),
    FOREIGN KEY (category_id) REFERENCES categories(category_id)
);

CREATE TABLE IF NOT EXISTS institutions (
    institution_id TEXT NOT NULL,
    aicte_permanent_id TEXT,
    is_synthetic BOOLEAN,
    institution_name TEXT,
    normalized_name TEXT,
    region_id TEXT,
    state_code TEXT,
    district TEXT,
    city TEXT,
    pincode TEXT,
    institution_type TEXT,
    management_type TEXT,
    programme_count BIGINT,
    approved_intake_total BIGINT,
    approval_academic_year TEXT,
    approval_status TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    institute_since_year BIGINT,
    source_type TEXT,
    PRIMARY KEY (institution_id),
    FOREIGN KEY (region_id) REFERENCES regions(region_id),
    FOREIGN KEY (state_code) REFERENCES states(state_code)
);

CREATE TABLE IF NOT EXISTS institution_aliases (
    alias_id TEXT NOT NULL,
    institution_id TEXT,
    alias_name TEXT,
    alias_type TEXT,
    effective_from DATE,
    source_type TEXT,
    PRIMARY KEY (alias_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(institution_id)
);

CREATE TABLE IF NOT EXISTS complainants (
    complainant_id TEXT NOT NULL,
    person_type TEXT,
    preferred_language TEXT,
    identity_method TEXT,
    identity_assurance TEXT,
    apaar_verified BOOLEAN,
    privacy_protected BOOLEAN,
    consent_for_updates BOOLEAN,
    source_type TEXT,
    PRIMARY KEY (complainant_id)
);

CREATE TABLE IF NOT EXISTS officers (
    officer_id TEXT NOT NULL,
    pseudonym TEXT,
    bureau_id TEXT,
    region_id TEXT,
    role TEXT,
    active BOOLEAN,
    on_duty_from DATE,
    source_type TEXT,
    PRIMARY KEY (officer_id)
);

CREATE TABLE IF NOT EXISTS complaints (
    complaint_id TEXT NOT NULL,
    institution_id TEXT,
    complainant_id TEXT,
    submitted_at_utc TIMESTAMPTZ,
    incident_at_utc TIMESTAMPTZ,
    region_id TEXT,
    state_code TEXT,
    category_id TEXT,
    subcategory_id TEXT,
    title TEXT,
    description TEXT,
    language TEXT,
    channel TEXT,
    source_portal TEXT,
    priority TEXT,
    severity_score BIGINT,
    original_bureau_id TEXT,
    current_bureau_id TEXT,
    section_officer_id TEXT,
    dealing_assistant_id TEXT,
    current_stage BIGINT,
    current_status TEXT,
    submitted_evidence_count BIGINT,
    current_evidence_count BIGINT,
    claimed_amount_inr BIGINT,
    incident_cluster_id TEXT,
    duplicate_flag BOOLEAN,
    overlap_flag BOOLEAN,
    sla_policy_id TEXT,
    sla_due_at_utc TIMESTAMPTZ,
    sla_breached BOOLEAN,
    escalation_count BIGINT,
    last_action_at_utc TIMESTAMPTZ,
    last_action_type TEXT,
    next_action TEXT,
    closed_at_utc TIMESTAMPTZ,
    resolution_code TEXT,
    special_approval_required BOOLEAN,
    record_as_of_utc TIMESTAMPTZ,
    is_synthetic BOOLEAN,
    PRIMARY KEY (complaint_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(institution_id),
    FOREIGN KEY (complainant_id) REFERENCES complainants(complainant_id),
    FOREIGN KEY (region_id) REFERENCES regions(region_id),
    FOREIGN KEY (category_id) REFERENCES categories(category_id),
    FOREIGN KEY (subcategory_id) REFERENCES subcategories(subcategory_id),
    FOREIGN KEY (current_bureau_id) REFERENCES bureaus(bureau_id),
    FOREIGN KEY (sla_policy_id) REFERENCES sla_policies(sla_policy_id)
);

CREATE TABLE IF NOT EXISTS assignments (
    assignment_id TEXT NOT NULL,
    complaint_id TEXT,
    bureau_id TEXT,
    section_officer_id TEXT,
    dealing_assistant_id TEXT,
    assigned_at_utc TIMESTAMPTZ,
    assignment_method TEXT,
    assignment_status TEXT,
    released_at_utc TIMESTAMPTZ,
    release_reason TEXT,
    PRIMARY KEY (assignment_id),
    FOREIGN KEY (complaint_id) REFERENCES complaints(complaint_id)
);

CREATE TABLE IF NOT EXISTS case_bureau_history (
    history_id TEXT NOT NULL,
    complaint_id TEXT,
    bureau_id TEXT,
    received_at_utc TIMESTAMPTZ,
    left_at_utc TIMESTAMPTZ,
    transfer_reason TEXT,
    PRIMARY KEY (history_id),
    FOREIGN KEY (complaint_id) REFERENCES complaints(complaint_id)
);

CREATE TABLE IF NOT EXISTS notices (
    notice_id TEXT NOT NULL,
    complaint_id TEXT,
    institution_id TEXT,
    notice_type TEXT,
    issued_at_utc TIMESTAMPTZ,
    due_at_utc TIMESTAMPTZ,
    delivery_channel TEXT,
    delivery_status TEXT,
    acknowledged_at_utc TIMESTAMPTZ,
    issuing_officer_id TEXT,
    PRIMARY KEY (notice_id),
    FOREIGN KEY (complaint_id) REFERENCES complaints(complaint_id),
    FOREIGN KEY (institution_id) REFERENCES institutions(institution_id)
);

CREATE TABLE IF NOT EXISTS internal_case_logs (
    case_log_id TEXT NOT NULL,
    complaint_id TEXT,
    created_at_utc TIMESTAMPTZ,
    officer_id TEXT,
    bureau_id TEXT,
    log_type TEXT,
    work_minutes BIGINT,
    internal_note TEXT,
    linked_evidence_id TEXT,
    PRIMARY KEY (case_log_id),
    FOREIGN KEY (complaint_id) REFERENCES complaints(complaint_id)
);

CREATE TABLE IF NOT EXISTS institution_responses (
    response_id TEXT NOT NULL,
    notice_id TEXT,
    complaint_id TEXT,
    institution_id TEXT,
    received_at_utc TIMESTAMPTZ,
    respondent_role TEXT,
    response_summary TEXT,
    compliance_claimed TEXT,
    response_completeness TEXT,
    attachment_count BIGINT,
    PRIMARY KEY (response_id),
    FOREIGN KEY (complaint_id) REFERENCES complaints(complaint_id)
);

CREATE TABLE IF NOT EXISTS case_outcomes (
    outcome_id TEXT NOT NULL,
    complaint_id TEXT,
    closed_at_utc TIMESTAMPTZ,
    resolution_code TEXT,
    decision_summary TEXT,
    remedy_type TEXT,
    amount_disputed_inr BIGINT,
    amount_refunded_inr BIGINT,
    remedy_verified TEXT,
    sanction_initiated TEXT,
    proven_violation TEXT,
    case_closed_by_id TEXT,
    PRIMARY KEY (outcome_id),
    FOREIGN KEY (complaint_id) REFERENCES complaints(complaint_id)
);

CREATE TABLE IF NOT EXISTS approvals (
    approval_id TEXT NOT NULL,
    complaint_id TEXT,
    requested_at_utc TIMESTAMPTZ,
    requested_by_officer_id TEXT,
    required_role TEXT,
    approver_id TEXT,
    decision TEXT,
    decided_at_utc TIMESTAMPTZ,
    remarks TEXT,
    PRIMARY KEY (approval_id),
    FOREIGN KEY (complaint_id) REFERENCES complaints(complaint_id)
);

CREATE TABLE IF NOT EXISTS evidence_metadata (
    evidence_id TEXT NOT NULL,
    complaint_id TEXT,
    uploaded_at_utc TIMESTAMPTZ,
    uploaded_by_role TEXT,
    evidence_type TEXT,
    file_extension TEXT,
    mock_storage_uri TEXT,
    file_sha256_synthetic TEXT,
    malware_check TEXT,
    verification_status TEXT,
    visibility TEXT,
    source_type TEXT,
    PRIMARY KEY (evidence_id),
    FOREIGN KEY (complaint_id) REFERENCES complaints(complaint_id)
);

CREATE TABLE IF NOT EXISTS case_stage_history (
    stage_history_id TEXT NOT NULL,
    complaint_id TEXT,
    stage_number BIGINT,
    stage_name TEXT,
    entered_at_utc TIMESTAMPTZ,
    exited_at_utc TIMESTAMPTZ,
    elapsed_hours DOUBLE PRECISION,
    exit_reason TEXT,
    PRIMARY KEY (stage_history_id),
    FOREIGN KEY (complaint_id) REFERENCES complaints(complaint_id)
);

CREATE TABLE IF NOT EXISTS workflow_events (
    event_id TEXT NOT NULL,
    complaint_id TEXT,
    occurred_at_utc TIMESTAMPTZ,
    event_type TEXT,
    stage_number BIGINT,
    stage_name TEXT,
    actor_id TEXT,
    actor_role TEXT,
    bureau_id TEXT,
    region_id TEXT,
    visibility TEXT,
    remarks TEXT,
    related_entity_id TEXT,
    metadata_json JSONB,
    PRIMARY KEY (event_id),
    FOREIGN KEY (complaint_id) REFERENCES complaints(complaint_id)
);

CREATE TABLE IF NOT EXISTS notifications (
    notification_id TEXT NOT NULL,
    complaint_id TEXT,
    recipient_type TEXT,
    event_id TEXT,
    created_at_utc TIMESTAMPTZ,
    channel TEXT,
    template_code TEXT,
    delivery_status TEXT,
    visibility TEXT,
    mock_destination TEXT,
    PRIMARY KEY (notification_id),
    FOREIGN KEY (complaint_id) REFERENCES complaints(complaint_id)
);

CREATE TABLE IF NOT EXISTS sla_tracking (
    complaint_id TEXT NOT NULL,
    sla_policy_id TEXT,
    started_at_utc TIMESTAMPTZ,
    due_at_utc TIMESTAMPTZ,
    effective_deadline_at_utc TIMESTAMPTZ,
    completed_at_utc TIMESTAMPTZ,
    is_breached BOOLEAN,
    breach_at_utc TIMESTAMPTZ,
    hours_elapsed_to_close_or_asof DOUBLE PRECISION,
    hours_overdue DOUBLE PRECISION,
    clock_paused_hours DOUBLE PRECISION,
    last_calculated_at_utc TIMESTAMPTZ,
    PRIMARY KEY (complaint_id),
    FOREIGN KEY (complaint_id) REFERENCES complaints(complaint_id)
);

CREATE TABLE IF NOT EXISTS investigations (
    investigation_id TEXT NOT NULL,
    complaint_id TEXT,
    investigation_type TEXT,
    started_at_utc TIMESTAMPTZ,
    completed_at_utc TIMESTAMPTZ,
    assigned_officer_id TEXT,
    finding TEXT,
    inspection_scheduled_at_utc TIMESTAMPTZ,
    report_document_id TEXT,
    PRIMARY KEY (investigation_id),
    FOREIGN KEY (complaint_id) REFERENCES complaints(complaint_id)
);

CREATE TABLE IF NOT EXISTS escalations (
    escalation_id TEXT NOT NULL,
    complaint_id TEXT,
    escalation_type TEXT,
    triggered_at_utc TIMESTAMPTZ,
    from_officer_id TEXT,
    to_officer_id TEXT,
    reason TEXT,
    sla_due_at_utc TIMESTAMPTZ,
    acknowledged_at_utc TIMESTAMPTZ,
    status TEXT,
    PRIMARY KEY (escalation_id),
    FOREIGN KEY (complaint_id) REFERENCES complaints(complaint_id)
);

CREATE TABLE IF NOT EXISTS feedback_appeals (
    feedback_id TEXT NOT NULL,
    complaint_id TEXT,
    submitted_at_utc TIMESTAMPTZ,
    type TEXT,
    rating_1_5 BIGINT,
    appeal_reason TEXT,
    status TEXT,
    decision_at_utc TIMESTAMPTZ,
    PRIMARY KEY (feedback_id),
    FOREIGN KEY (complaint_id) REFERENCES complaints(complaint_id)
);

CREATE TABLE IF NOT EXISTS nlp_candidate_pairs (
    candidate_pair_id TEXT NOT NULL,
    case_id_a TEXT,
    case_id_b TEXT,
    candidate_created_at_utc TIMESTAMPTZ,
    same_institution BIGINT,
    same_complainant BIGINT,
    same_category BIGINT,
    same_subcategory BIGINT,
    incident_days_apart BIGINT,
    embedding_cosine_simulated DOUBLE PRECISION,
    lexical_jaccard_simulated DOUBLE PRECISION,
    attachment_hash_match_simulated BIGINT,
    model_confidence_simulated DOUBLE PRECISION,
    predicted_label TEXT,
    ground_truth_synthetic TEXT,
    review_status TEXT,
    training_split TEXT,
    PRIMARY KEY (candidate_pair_id),
    FOREIGN KEY (case_id_a) REFERENCES complaints(complaint_id),
    FOREIGN KEY (case_id_b) REFERENCES complaints(complaint_id)
);

CREATE TABLE IF NOT EXISTS case_links (
    link_id TEXT NOT NULL,
    case_id_a TEXT,
    case_id_b TEXT,
    institution_id TEXT,
    relation_type TEXT,
    human_decision TEXT,
    reviewed_by_officer_id TEXT,
    reviewed_at_utc TIMESTAMPTZ,
    cluster_id TEXT,
    notes TEXT,
    PRIMARY KEY (link_id),
    FOREIGN KEY (case_id_a) REFERENCES complaints(complaint_id),
    FOREIGN KEY (case_id_b) REFERENCES complaints(complaint_id)
);

CREATE TABLE IF NOT EXISTS dashboard_daily_metrics (
    metric_date DATE,
    region_id TEXT,
    bureau_id TEXT,
    submitted_count BIGINT,
    disposed_count BIGINT,
    sla_breach_trigger_count BIGINT,
    new_escalation_count BIGINT
);

CREATE TABLE IF NOT EXISTS live_replay_7d (
    event_id TEXT NOT NULL,
    complaint_id TEXT,
    occurred_at_utc TIMESTAMPTZ,
    event_type TEXT,
    stage_number BIGINT,
    bureau_id TEXT,
    region_id TEXT,
    visibility TEXT,
    actor_role TEXT,
    PRIMARY KEY (event_id)
);

CREATE INDEX IF NOT EXISTS idx_complaints_institution_id ON complaints(institution_id);
CREATE INDEX IF NOT EXISTS idx_complaints_region_id ON complaints(region_id);
CREATE INDEX IF NOT EXISTS idx_complaints_current_bureau_id ON complaints(current_bureau_id);
CREATE INDEX IF NOT EXISTS idx_complaints_current_status ON complaints(current_status);
CREATE INDEX IF NOT EXISTS idx_complaints_category_id ON complaints(category_id);
CREATE INDEX IF NOT EXISTS idx_complaints_submitted_at_utc ON complaints(submitted_at_utc);
CREATE INDEX IF NOT EXISTS idx_complaints_sla_due_at_utc ON complaints(sla_due_at_utc);
CREATE INDEX IF NOT EXISTS idx_complaints_dealing_assistant_id ON complaints(dealing_assistant_id);
CREATE INDEX IF NOT EXISTS idx_workflow_events_complaint_id ON workflow_events(complaint_id);
CREATE INDEX IF NOT EXISTS idx_workflow_events_occurred_at_utc ON workflow_events(occurred_at_utc);
CREATE INDEX IF NOT EXISTS idx_workflow_events_event_type ON workflow_events(event_type);
CREATE INDEX IF NOT EXISTS idx_nlp_candidate_pairs_case_id_a ON nlp_candidate_pairs(case_id_a);
CREATE INDEX IF NOT EXISTS idx_nlp_candidate_pairs_case_id_b ON nlp_candidate_pairs(case_id_b);
CREATE INDEX IF NOT EXISTS idx_case_links_case_id_a ON case_links(case_id_a);
CREATE INDEX IF NOT EXISTS idx_case_links_case_id_b ON case_links(case_id_b);
CREATE INDEX IF NOT EXISTS idx_case_stage_history_complaint_id ON case_stage_history(complaint_id);
CREATE INDEX IF NOT EXISTS idx_sla_tracking_is_breached ON sla_tracking(is_breached);
