'use strict';

async function migrateSreHealingCampaigns(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sre_healing_campaigns (
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      responsibility_agent_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN
        ('DETECTED','INVESTIGATING','CANDIDATE_READY','AUTHORIZED','OBSERVING',
         'VERIFIED','ROLLBACK_REQUIRED','ROLLED_BACK','ABSTAINED')),
      version INTEGER NOT NULL CHECK(version >= 1),
      current_receipt_id TEXT NOT NULL,
      snapshot_hash TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(organization_id, project_id, campaign_id)
    );
    CREATE TABLE IF NOT EXISTS sre_healing_receipts (
      organization_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      receipt_id TEXT NOT NULL,
      sequence INTEGER NOT NULL CHECK(sequence >= 1),
      previous_receipt_id TEXT,
      from_state TEXT,
      to_state TEXT NOT NULL,
      snapshot_hash TEXT NOT NULL,
      receipt_hash TEXT NOT NULL,
      receipt_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(organization_id, project_id, receipt_id),
      UNIQUE(organization_id, project_id, campaign_id, sequence),
      FOREIGN KEY(organization_id, project_id, campaign_id)
        REFERENCES sre_healing_campaigns(organization_id, project_id, campaign_id)
        ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS idx_sre_healing_responsibility
      ON sre_healing_campaigns(organization_id, project_id,
        responsibility_agent_id, status, updated_at);
    CREATE TRIGGER IF NOT EXISTS sre_healing_campaign_identity_immutable
      BEFORE UPDATE OF organization_id, project_id, campaign_id, service_id,
        responsibility_agent_id, created_at ON sre_healing_campaigns
      BEGIN SELECT RAISE(ABORT, 'SRE healing campaign identity is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS sre_healing_campaign_no_delete
      BEFORE DELETE ON sre_healing_campaigns
      BEGIN SELECT RAISE(ABORT, 'SRE healing campaigns are durable evidence'); END;
    CREATE TRIGGER IF NOT EXISTS sre_healing_receipt_no_update
      BEFORE UPDATE ON sre_healing_receipts
      BEGIN SELECT RAISE(ABORT, 'SRE healing receipts are append-only'); END;
    CREATE TRIGGER IF NOT EXISTS sre_healing_receipt_no_delete
      BEFORE DELETE ON sre_healing_receipts
      BEGIN SELECT RAISE(ABORT, 'SRE healing receipts are durable evidence'); END;
  `);
}

module.exports = { migrateSreHealingCampaigns };
