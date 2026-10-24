'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { mergeRelations, replaceRelations } = require('../src/services/agentGitService/institutionalRelations.cjs');

async function main() {
  const base = { id: 'relation-1', source_agent_id: 'agent-a', target_agent_id: 'agent-b',
    relation_type: 'peer', authority: 0.2, organization_id: 'org', project_id: 'project' };
  const lower = { ...base, authority: 0.1 };
  assert.deepEqual(mergeRelations({ base: [base], left: [lower], right: [base] }).merged, [lower]);
  assert.equal(mergeRelations({ base: [base], left: [lower], right: [{ ...base, authority: 0.3 }] }).conflicts.length, 1);
  assert.equal(mergeRelations({ base: [base], left: [base], right: [{ ...base, authority: 0.3 }] }).conflicts[0].reason,
    'authority_change_requires_review');
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await db.exec(`CREATE TABLE workspaces (id TEXT, organization_id TEXT, project_id TEXT);
      CREATE TABLE agents (id TEXT, workspace_id TEXT);
      CREATE TABLE agent_relations (id TEXT PRIMARY KEY, source_agent_id TEXT, target_agent_id TEXT,
        relation_type TEXT, familiarity REAL, interaction_count REAL, shared_history REAL, authority REAL,
        trust_for_domain TEXT, common_ground_estimate REAL, epistemic_independence REAL,
        error_correlation REAL, disclosure_level REAL, preferred_dialect TEXT, last_interaction TEXT,
        organization_id TEXT, project_id TEXT, provenance_hash TEXT, relation_class TEXT,
        metadata_json TEXT NOT NULL, updated_at TEXT);`);
    await db.run("INSERT INTO workspaces VALUES ('w', 'org', 'project')");
    await db.run("INSERT INTO agents VALUES ('agent-a', 'w'), ('agent-b', 'w')");
    await db.run("INSERT INTO agent_relations (id, source_agent_id, target_agent_id, relation_type, authority, organization_id, project_id, metadata_json) VALUES ('relation-1', 'agent-a', 'agent-b', 'peer', 0.2, 'org', 'project', '{}')");
    const ctx = { db, req: { tenant: { organizationId: 'org', projectId: 'project' } }, targetAgentId: 'agent-a' };
    await replaceRelations(ctx, [lower]);
    assert.equal((await db.get("SELECT authority FROM agent_relations WHERE id = 'relation-1'")).authority, 0.1);
    await assert.rejects(replaceRelations(ctx, [{ ...base, authority: 0.4 }]), /institutional review/);
    assert.equal((await db.get("SELECT authority FROM agent_relations WHERE id = 'relation-1'")).authority, 0.1);
    await assert.rejects(replaceRelations(ctx, [{ ...lower, target_agent_id: 'agent-a' }]), /peer/);
  } finally { await db.close(); }
  console.log('AgentGit institutional relation merge passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
