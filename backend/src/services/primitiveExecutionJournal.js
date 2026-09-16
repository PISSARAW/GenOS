const crypto = require('crypto');

async function ensureTable(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS primitive_execution_journal (
    id TEXT PRIMARY KEY,
    orchestrator_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    contract_id TEXT,
    stage_key TEXT,
    primitive TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
    args_json TEXT NOT NULL DEFAULT '{}',
    result_json TEXT NOT NULL DEFAULT '{}',
    result_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_primitive_journal_orchestrator ON primitive_execution_journal(orchestrator_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_primitive_journal_contract ON primitive_execution_journal(contract_id, stage_key);`);
}

function stableJson(value) {
  return JSON.stringify(value || {});
}

function hashResult(result) {
  return crypto.createHash('sha256').update(stableJson(result)).digest('hex');
}

function toolName(primitive) {
  const normalized = String(primitive || '').replace(/^genos_/, '');
  return `genos_${normalized}`;
}

function recordIds(entry) {
  const orchestratorId = entry.orchestratorId || entry.agentId || 'system';
  const agentId = entry.agentId || entry.orchestratorId || 'system';
  return { orchestratorId, agentId };
}

function recordStatus(result) {
  return result.success === false ? 'failed' : 'completed';
}

async function recordPrimitiveExecution(db, entry = {}) {
  await ensureTable(db);
  const primitive = String(entry.primitive || '').trim();
  if (!primitive) return null;
  const result = entry.result || {};
  const ids = recordIds(entry);
  const id = `primitive_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  await db.run(
    `INSERT INTO primitive_execution_journal
      (id, orchestrator_id, agent_id, contract_id, stage_key, primitive, tool_name, status, args_json, result_json, result_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    ids.orchestratorId,
    ids.agentId,
    entry.contractId || null,
    entry.stageKey || null,
    primitive,
    toolName(primitive),
    recordStatus(result),
    stableJson(entry.args),
    stableJson(result),
    hashResult(result)
  );
  return id;
}

async function observedPrimitiveTools(db, orchestratorId) {
  await ensureTable(db);
  const rows = await db.all(
    `SELECT DISTINCT tool_name FROM primitive_execution_journal
     WHERE orchestrator_id = ? AND status = 'completed' ORDER BY tool_name`,
    orchestratorId
  );
  return rows.map((row) => row.tool_name);
}

module.exports = { ensureTable, recordPrimitiveExecution, observedPrimitiveTools, toolName };