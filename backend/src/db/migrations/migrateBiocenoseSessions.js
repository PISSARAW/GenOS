'use strict';

const TABLES = [
  'biocenose_communities', 'biocenose_members', 'biocenose_constitutions',
  'biocenose_commitments', 'biocenose_claims', 'biocenose_arguments',
  'biocenose_belief_updates', 'biocenose_dissent', 'biocenose_judgments',
  'biocenose_events'
];

async function migrateBiocenoseSessions(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS biocenose_communities (
      community_id TEXT PRIMARY KEY,
      mission_id TEXT,
      question TEXT NOT NULL,
      question_type TEXT,
      constitution_id TEXT,
      phase TEXT NOT NULL DEFAULT 'CONSTITUTION',
      round INTEGER NOT NULL DEFAULT 0 CHECK (round >= 0),
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      judgment_id TEXT,
      revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_biocenose_communities_status ON biocenose_communities(status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_biocenose_communities_mission ON biocenose_communities(mission_id, created_at);

    CREATE TABLE IF NOT EXISTS biocenose_members (
      member_record_id TEXT PRIMARY KEY,
      community_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      role TEXT NOT NULL,
      attributes_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL,
      FOREIGN KEY (community_id) REFERENCES biocenose_communities(community_id) ON DELETE CASCADE,
      UNIQUE (community_id, member_id)
    );
    CREATE INDEX IF NOT EXISTS idx_biocenose_members_community ON biocenose_members(community_id, role);

    CREATE TABLE IF NOT EXISTS biocenose_constitutions (
      constitution_id TEXT PRIMARY KEY,
      community_id TEXT NOT NULL,
      version INTEGER NOT NULL CHECK (version > 0),
      constitution_json TEXT NOT NULL,
      constitution_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (community_id) REFERENCES biocenose_communities(community_id) ON DELETE CASCADE,
      UNIQUE (community_id, version)
    );

    CREATE TABLE IF NOT EXISTS biocenose_commitments (
      commitment_id TEXT PRIMARY KEY,
      community_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      round INTEGER NOT NULL CHECK (round >= 0),
      commitment_type TEXT NOT NULL,
      commitment_hash TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (community_id) REFERENCES biocenose_communities(community_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_biocenose_commitments_round ON biocenose_commitments(community_id, round);

    CREATE TABLE IF NOT EXISTS biocenose_claims (
      claim_id TEXT PRIMARY KEY,
      community_id TEXT NOT NULL,
      round INTEGER NOT NULL CHECK (round >= 0),
      created_by TEXT NOT NULL,
      claim_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (community_id) REFERENCES biocenose_communities(community_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_biocenose_claims_community ON biocenose_claims(community_id, round);

    CREATE TABLE IF NOT EXISTS biocenose_arguments (
      argument_id TEXT PRIMARY KEY,
      community_id TEXT NOT NULL,
      claim_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      relation TEXT NOT NULL,
      argument_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (community_id) REFERENCES biocenose_communities(community_id) ON DELETE CASCADE,
      FOREIGN KEY (claim_id) REFERENCES biocenose_claims(claim_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_biocenose_arguments_claim ON biocenose_arguments(claim_id, created_at);

    CREATE TABLE IF NOT EXISTS biocenose_belief_updates (
      update_id TEXT PRIMARY KEY,
      community_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      round INTEGER NOT NULL CHECK (round >= 0),
      update_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (community_id) REFERENCES biocenose_communities(community_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS biocenose_dissent (
      dissent_id TEXT PRIMARY KEY,
      community_id TEXT NOT NULL,
      claim_id TEXT,
      status TEXT NOT NULL DEFAULT 'OPEN',
      dissent_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (community_id) REFERENCES biocenose_communities(community_id) ON DELETE CASCADE,
      FOREIGN KEY (claim_id) REFERENCES biocenose_claims(claim_id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS biocenose_judgments (
      judgment_id TEXT PRIMARY KEY,
      community_id TEXT NOT NULL,
      round INTEGER NOT NULL CHECK (round >= 0),
      judgment_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (community_id) REFERENCES biocenose_communities(community_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS biocenose_events (
      event_id TEXT PRIMARY KEY,
      community_id TEXT NOT NULL,
      revision INTEGER NOT NULL CHECK (revision >= 0),
      event_type TEXT NOT NULL,
      actor_id TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY (community_id) REFERENCES biocenose_communities(community_id) ON DELETE CASCADE,
      UNIQUE (community_id, revision)
    );
    CREATE INDEX IF NOT EXISTS idx_biocenose_events_type_time ON biocenose_events(event_type, created_at);
    CREATE INDEX IF NOT EXISTS idx_biocenose_events_community ON biocenose_events(community_id, revision);
  `);
  await protectAppendOnlyTables(db);
}

async function protectAppendOnlyTables(db) {
  for (const table of TABLES.filter((name) => name !== 'biocenose_communities' && name !== 'biocenose_events')) {
    await db.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_no_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT, '${table} is append-only'); END;`);
    await db.exec(`CREATE TRIGGER IF NOT EXISTS ${table}_no_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT, '${table} is append-only'); END;`);
  }
  await db.exec(`
    CREATE TRIGGER IF NOT EXISTS biocenose_events_no_update BEFORE UPDATE ON biocenose_events BEGIN SELECT RAISE(ABORT, 'biocenose_events is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS biocenose_events_no_delete BEFORE DELETE ON biocenose_events BEGIN SELECT RAISE(ABORT, 'biocenose_events is append-only'); END;
  `);
}

module.exports = { migrateBiocenoseSessions };
