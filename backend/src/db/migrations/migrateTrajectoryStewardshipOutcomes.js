'use strict';

async function migrateTrajectoryStewardshipOutcomes(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS trajectory_stewardship_outcomes (
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      outcome_id TEXT NOT NULL,
      responsibility_id TEXT NOT NULL,
      promotion_status TEXT NOT NULL CHECK(promotion_status IN ('PROMOTED','REJECTED','INCONCLUSIVE')),
      project_verdict TEXT NOT NULL CHECK(project_verdict IN ('supported','refuted','inconclusive')),
      learning_verdict TEXT NOT NULL CHECK(learning_verdict IN ('supported','refuted','inconclusive')),
      project_evidence_ref TEXT NOT NULL,
      learning_evidence_ref TEXT NOT NULL,
      project_verifier_id TEXT NOT NULL,
      learning_verifier_id TEXT NOT NULL,
      policy_id TEXT NOT NULL,
      authorization_ref TEXT NOT NULL,
      receipt_id TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      receipt_json TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      PRIMARY KEY(organization_id, project_id, outcome_id),
      UNIQUE(organization_id, project_id, responsibility_id),
      UNIQUE(organization_id, project_id, receipt_id),
      FOREIGN KEY(organization_id, project_id, responsibility_id)
        REFERENCES trajectory_stewardship_responsibilities(
          organization_id, project_id, responsibility_id) ON DELETE RESTRICT
    );
    CREATE TRIGGER IF NOT EXISTS trajectory_stewardship_outcome_no_update
      BEFORE UPDATE ON trajectory_stewardship_outcomes
      BEGIN SELECT RAISE(ABORT, 'Trajectory stewardship outcomes are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS trajectory_stewardship_outcome_no_delete
      BEFORE DELETE ON trajectory_stewardship_outcomes
      BEGIN SELECT RAISE(ABORT, 'Trajectory stewardship outcomes are durable evidence'); END;
  `);
}

module.exports = { migrateTrajectoryStewardshipOutcomes };
