//! Schema extension: zero-text signaling transport (§45)
//! La honte est la variable libre qui fait vivre le composite.
//!
//! Tables:
//!  - signal_blobs: signaux zero-texte persistés (ligands, potentiels,
//!    phéromones, plasmides, tenseurs latents)
//!  - signal_subs: abonnements d'agents à des topics de signal
//!
//! Cette extension est chargée par schema.js via la migration v45.
//!

const CREATE_SIGNAL_BLOBS_SQL = `
CREATE TABLE IF NOT EXISTS signal_blobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    signal_id TEXT NOT NULL,
    signal_type TEXT NOT NULL CHECK (signal_type IN ('ligand','voltage','pheromone','plasmid','tensor','text')),
    signal_blob BLOB,
    content TEXT NOT NULL DEFAULT '',
    topic TEXT NOT NULL DEFAULT '',
    sender_agent_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    UNIQUE(signal_id)
);

CREATE INDEX IF NOT EXISTS signal_blobs_topic_idx ON signal_blobs(topic, created_at);
CREATE INDEX IF NOT EXISTS signal_blobs_sender_idx ON signal_blobs(sender_agent_id, created_at);
CREATE INDEX IF NOT EXISTS signal_blobs_expires_idx ON signal_blobs(expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS signal_subs (
    signal_id TEXT PRIMARY KEY,
    topic TEXT NOT NULL,
    subscriber_agent_id TEXT NOT NULL,
    last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subscriber_agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS signal_subs_subscriber_idx ON signal_subs(subscriber_agent_id, last_seen_at);
`;

const CREATE_SIGNAL_BLOBS_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS signal_blobs_topic_idx ON signal_blobs(topic, created_at);
CREATE INDEX IF NOT EXISTS signal_blobs_sender_idx ON signal_blobs(sender_agent_id, created_at);
CREATE INDEX IF NOT EXISTS signal_blobs_expires_idx ON signal_blobs(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS signal_subs_subscriber_idx ON signal_subs(subscriber_agent_id, last_seen_at);
`;

/** Idempotent v45 migration — safe to call on every startup. */
async function applyV45Migration(db) {
  await db.exec(CREATE_SIGNAL_BLOBS_SQL);
}

module.exports = { applyV45Migration, CREATE_SIGNAL_BLOBS_SQL, CREATE_SIGNAL_BLOBS_INDEXES_SQL };
