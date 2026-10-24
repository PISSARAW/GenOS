'use strict';

const { digest } = require('./biologicalIntegrity');

const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const EXACT_TABLES = new Set([
  'agent_organization_messages', 'signal_blobs', 'signal_deliveries', 'communication_outcomes',
  'verbal_escalations', 'dialogue_turns', 'dialogue_artifacts', 'autobiographical_episodes',
  'agents', 'agent_runtime_state', 'agent_state_snapshots', 'missions',
  'body_action_receipts', 'orchestration_action_receipts', 'survival_action_receipts',
  'biological_execution_missions', 'biological_execution_receipts', 'tool_permission_receipts',
  'tool_permission_receipt_lineage', 'agent_permissions', 'agent_model_routing_policies', 'iam_policies',
]);

async function ensureAuthorityTable(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS social_runtime_authority_checks (
    check_id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, project_id TEXT NOT NULL,
    arm TEXT NOT NULL, seed TEXT NOT NULL, before_json TEXT NOT NULL, before_hash TEXT NOT NULL,
    artifact_json TEXT, artifact_hash TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finalized_at TEXT);
    CREATE TRIGGER IF NOT EXISTS social_runtime_authority_once
      BEFORE UPDATE ON social_runtime_authority_checks WHEN OLD.finalized_at IS NOT NULL
      BEGIN SELECT RAISE(ABORT,'SOCIAL_AUTHORITY_CHECK_IMMUTABLE'); END;
    CREATE TRIGGER IF NOT EXISTS social_runtime_authority_no_delete
      BEFORE DELETE ON social_runtime_authority_checks
      BEGIN SELECT RAISE(ABORT,'SOCIAL_AUTHORITY_CHECK_IMMUTABLE'); END;`);
}

function tableIsProtected(name) {
  return EXACT_TABLES.has(name) || name.startsWith('morphogenesis_') || name.startsWith('morph_');
}

async function protectedTableNames(db) {
  const rows = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  return rows.map((row) => row.name).filter(tableIsProtected);
}

async function tableColumns(db, table) {
  return (await db.all(`PRAGMA table_info("${table}")`)).map((column) => column.name);
}

function scopeConditions(columns, input) {
  const clauses = [];
  const values = [];
  if (columns.includes('organization_id')) { clauses.push('organization_id=?'); values.push(input.organizationId); }
  if (columns.includes('project_id')) { clauses.push('project_id=?'); values.push(input.projectId); }
  if (columns.includes('agent_id')) {
    clauses.push(`agent_id IN (${input.subjectAgentIds.map(() => '?').join(',')})`);
    values.push(...input.subjectAgentIds);
  }
  return { sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', values };
}

async function rowsForTable(db, table, input) {
  const columns = await tableColumns(db, table);
  const scope = scopeConditions(columns, input);
  const rows = await db.all(`SELECT * FROM "${table}"${scope.sql}`, ...scope.values);
  return rows.sort((left, right) => digest(left).localeCompare(digest(right)));
}

async function readPolicyRows(db, input) {
  if (!(await protectedTableNames(db)).includes('agent_permissions')) return [];
  const columns = await tableColumns(db, 'agent_permissions');
  const scope = scopeConditions(columns, input);
  return (await db.all(`SELECT * FROM agent_permissions${scope.sql}`, ...scope.values))
    .sort((left, right) => digest(left).localeCompare(digest(right)));
}

async function captureDatabaseState(db, input) {
  const tables = {};
  for (const table of await protectedTableNames(db)) tables[table] = await rowsForTable(db, table, input);
  const policyRows = await readPolicyRows(db, input);
  const tableHashes = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, digest(rows)]));
  const policyHash = digest(policyRows);
  return { scope: { organizationId: input.organizationId, projectId: input.projectId,
    subjectAgentIds: [...input.subjectAgentIds].sort() }, tables, tableHashes,
    protectedStateHash: digest(tableHashes), permissionPolicy: policyRows, permissionPolicyHash: policyHash };
}

function normalizedInput(input) {
  const required = ['checkId', 'organizationId', 'projectId', 'arm', 'seed'];
  for (const key of required) if (typeof input[key] !== 'string' || !input[key].trim()) fail('SOCIAL_AUTHORITY_INPUT_INVALID', `${key} required`);
  if (!Array.isArray(input.subjectAgentIds) || input.subjectAgentIds.length < 2
      || new Set(input.subjectAgentIds).size !== input.subjectAgentIds.length) {
    fail('SOCIAL_AUTHORITY_INPUT_INVALID', 'At least two distinct participant identities required');
  }
  return { ...input, subjectAgentIds: input.subjectAgentIds.map((id) => id.trim()).sort() };
}

async function beginSocialAuthorityCheck(db, input) {
  const value = normalizedInput(input);
  await ensureAuthorityTable(db);
  const before = await captureDatabaseState(db, value);
  const beforeHash = digest(before);
  await db.run(`INSERT OR IGNORE INTO social_runtime_authority_checks
    (check_id,organization_id,project_id,arm,seed,before_json,before_hash)
    VALUES(?,?,?,?,?,?,?)`, value.checkId, value.organizationId, value.projectId,
  value.arm, value.seed, JSON.stringify(before), beforeHash);
  const row = await db.get('SELECT before_json,before_hash FROM social_runtime_authority_checks WHERE check_id=?', value.checkId);
  if (!row || row.before_json !== JSON.stringify(before) || row.before_hash !== beforeHash) {
    fail('SOCIAL_AUTHORITY_BASELINE_CONFLICT', 'Authority check baseline did not read back exactly');
  }
  return { checkId: value.checkId, before, beforeHash, permissionPolicyHash: before.permissionPolicyHash, readBack: true };
}

function createArtifact(input, before, after) {
  const unchanged = before.protectedStateHash === after.protectedStateHash;
  const policyUnchanged = before.permissionPolicyHash === after.permissionPolicyHash;
  return { schema: 'genos.social-authority-check/v1', checkId: input.check_id, arm: input.arm,
    seed: input.seed, organizationId: input.organization_id, projectId: input.project_id,
    scope: before.scope, before, after, permissionPolicyHash: before.permissionPolicyHash,
    permissionPolicyHashAfter: after.permissionPolicyHash, protectedStateHash: before.protectedStateHash,
    protectedStateHashAfter: after.protectedStateHash, noProtectedMutations: unchanged,
    permissionPolicyUnchanged: policyUnchanged, proposalsOnly: unchanged && policyUnchanged,
    verification: 'sqlite-scoped-before-after-readback', createdAt: new Date().toISOString() };
}

async function completeSocialAuthorityCheck(db, input) {
  if (typeof input.checkId !== 'string' || !input.checkId.trim()) fail('SOCIAL_AUTHORITY_INPUT_INVALID', 'checkId required');
  await ensureAuthorityTable(db);
  const row = await db.get('SELECT * FROM social_runtime_authority_checks WHERE check_id=?', input.checkId);
  if (!row) fail('SOCIAL_AUTHORITY_CHECK_NOT_FOUND', 'Authority check baseline not found');
  if (row.finalized_at) fail('SOCIAL_AUTHORITY_ALREADY_FINALIZED', 'Authority check already finalized');
  const before = JSON.parse(row.before_json);
  const after = await captureDatabaseState(db, { ...before.scope });
  const artifact = createArtifact(row, before, after);
  const artifactJson = JSON.stringify(artifact);
  const artifactHash = digest(artifact);
  await db.run(`UPDATE social_runtime_authority_checks SET artifact_json=?,artifact_hash=?,finalized_at=CURRENT_TIMESTAMP
    WHERE check_id=? AND finalized_at IS NULL`, artifactJson, artifactHash, row.check_id);
  const stored = await db.get('SELECT artifact_json,artifact_hash,finalized_at FROM social_runtime_authority_checks WHERE check_id=?', row.check_id);
  if (!stored || stored.artifact_json !== artifactJson || stored.artifact_hash !== artifactHash || !stored.finalized_at) {
    fail('SOCIAL_AUTHORITY_READBACK_FAILED', 'Authority check artifact failed persisted readback');
  }
  return { artifact, artifactHash, valid: artifact.proposalsOnly, readBack: true };
}

module.exports = { beginSocialAuthorityCheck, completeSocialAuthorityCheck };
