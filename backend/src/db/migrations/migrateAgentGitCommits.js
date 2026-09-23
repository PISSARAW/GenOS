'use strict';

/**
 * Migration 068 — agent_git_commits (normalized commit log).
 *
 * agent_git_objects is the object store (content-addressable, carries full
 * state_json). agent_git_commits is the commit-level index: fast lineage
 * traversal, ref resolution, and morphogenesis provenance without parsing
 * state_json. Every commit object mirrored here on insert.
 */

async function migrateAgentGitCommits(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS agent_git_commits (
      commit_id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      workspace_id TEXT,
      parent_commit_id TEXT,
      tree_hash TEXT NOT NULL,
      commit_hash TEXT NOT NULL,
      state_hash TEXT NOT NULL,
      message TEXT,
      reason TEXT,
      evidence_json TEXT NOT NULL DEFAULT '{}',
      changes_json TEXT NOT NULL DEFAULT '[]',
      committed_by TEXT NOT NULL,
      committed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_commit_id) REFERENCES agent_git_commits(commit_id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_git_commits_agent ON agent_git_commits(agent_id, committed_at);
    CREATE INDEX IF NOT EXISTS idx_agent_git_commits_parent ON agent_git_commits(parent_commit_id);
    CREATE INDEX IF NOT EXISTS idx_agent_git_commits_hash ON agent_git_commits(commit_hash);
    CREATE INDEX IF NOT EXISTS idx_agent_git_commits_reason ON agent_git_commits(reason);
  `);
}

module.exports = { migrateAgentGitCommits };
