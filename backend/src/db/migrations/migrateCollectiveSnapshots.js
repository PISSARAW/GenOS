module.exports = {
  async run(db) {
    await db.exec(`
CREATE TABLE IF NOT EXISTS collective_state_snapshots (
    id TEXT PRIMARY KEY,
    version INTEGER NOT NULL,
    state_json TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    parent_hash TEXT,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_collective_snapshots_version ON collective_state_snapshots(version DESC);
CREATE INDEX IF NOT EXISTS idx_collective_snapshots_created ON collective_state_snapshots(created_at DESC);
`);
  }
};
