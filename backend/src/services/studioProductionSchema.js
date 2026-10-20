'use strict';
async function ensure(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS studio_release_manifests (
      release_id TEXT PRIMARY KEY REFERENCES releases(id), payload_json TEXT NOT NULL,
      payload_hash TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS studio_deployment_slots (
      workflow_id TEXT NOT NULL REFERENCES workflows(id), environment TEXT NOT NULL CHECK(environment IN ('staging','production')),
      release_id TEXT REFERENCES studio_release_manifests(release_id), revision INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(workflow_id, environment));
    CREATE TABLE IF NOT EXISTS studio_deployment_events (
      id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL REFERENCES workflows(id), environment TEXT NOT NULL,
      revision INTEGER NOT NULL, release_id TEXT REFERENCES studio_release_manifests(release_id),
      previous_release_id TEXT, actor TEXT NOT NULL, action TEXT NOT NULL, note TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(workflow_id, environment, revision));
    CREATE TABLE IF NOT EXISTS studio_release_reviews (
      id TEXT PRIMARY KEY, release_id TEXT NOT NULL REFERENCES studio_release_manifests(release_id),
      release_hash TEXT NOT NULL, run_id TEXT NOT NULL REFERENCES workflow_runs(id), output_hash TEXT NOT NULL,
      actor TEXT NOT NULL, decision TEXT NOT NULL CHECK(decision IN ('approved','rejected')),
      note TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS studio_deployment_invocations (
      run_id TEXT PRIMARY KEY REFERENCES workflow_runs(id), release_id TEXT NOT NULL REFERENCES studio_release_manifests(release_id),
      release_hash TEXT NOT NULL, environment TEXT NOT NULL, slot_revision INTEGER NOT NULL, actor TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS studio_production_feedback (
      id TEXT PRIMARY KEY, release_id TEXT NOT NULL REFERENCES studio_release_manifests(release_id),
      run_id TEXT NOT NULL REFERENCES workflow_runs(id), actor TEXT NOT NULL, body TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS studio_product_contracts (
      id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL REFERENCES workflows(id), revision INTEGER NOT NULL,
      parent_id TEXT REFERENCES studio_product_contracts(id), payload_json TEXT NOT NULL,
      payload_hash TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(workflow_id, revision));
    CREATE TABLE IF NOT EXISTS studio_product_evaluations (
      id TEXT PRIMARY KEY, release_id TEXT NOT NULL REFERENCES studio_release_manifests(release_id),
      contract_id TEXT NOT NULL REFERENCES studio_product_contracts(id), evaluator TEXT NOT NULL,
      modality TEXT NOT NULL CHECK(modality IN ('visual','functional','security','accessibility')),
      verdict TEXT NOT NULL CHECK(verdict IN ('supported','refuted','inconclusive')),
      criterion_ids_json TEXT NOT NULL, evidence_refs_json TEXT NOT NULL, note TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(release_id, evaluator, modality));
    CREATE TABLE IF NOT EXISTS studio_product_acceptances (
      id TEXT PRIMARY KEY, release_id TEXT NOT NULL REFERENCES studio_release_manifests(release_id),
      contract_id TEXT NOT NULL REFERENCES studio_product_contracts(id), accepted_by TEXT NOT NULL,
      evaluation_hash TEXT NOT NULL, decision TEXT NOT NULL CHECK(decision IN ('accepted','rejected')),
      note TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(release_id, contract_id, evaluation_hash));
    CREATE TABLE IF NOT EXISTS studio_product_effects (
      id TEXT PRIMARY KEY, release_id TEXT NOT NULL REFERENCES studio_release_manifests(release_id),
      contract_id TEXT NOT NULL REFERENCES studio_product_contracts(id), observer TEXT NOT NULL,
      hypothesis_id TEXT NOT NULL, verdict TEXT NOT NULL CHECK(verdict IN ('supported','refuted','inconclusive')),
      run_id TEXT NOT NULL REFERENCES workflow_runs(id), context_kind TEXT NOT NULL CHECK(context_kind IN ('production','holdout')),
      metric_json TEXT NOT NULL, evidence_refs_json TEXT NOT NULL, observation_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(release_id, observer, hypothesis_id));
    CREATE TABLE IF NOT EXISTS studio_product_initiatives (
      id TEXT PRIMARY KEY, release_id TEXT NOT NULL REFERENCES studio_release_manifests(release_id),
      contract_id TEXT NOT NULL REFERENCES studio_product_contracts(id), action TEXT NOT NULL,
      cause_hash TEXT NOT NULL UNIQUE, payload_json TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  `);
}
module.exports = { ensure };
