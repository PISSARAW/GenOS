'use strict';
const { migrateBiologicalWorkerReceipts } = require('../db/migrations/migrateBiologicalWorkerReceipts');
const { digest, encode, identity } = require('./biologicalIntegrity');
const migrated = new WeakSet();

async function ensure(db) {
  if (migrated.has(db)) return;
  await migrateBiologicalWorkerReceipts(db);
  migrated.add(db);
}

function verifiedJson(row, field) {
  if (!row) return null;
  const value = JSON.parse(row[field]);
  const hashField = { binding_json: 'binding_hash', event_json: 'event_hash', receipt_json: 'payload_hash' }[field];
  if (digest(value) !== row[hashField]) throw biologyError('BIOLOGICAL_WORKER_INTEGRITY_MISMATCH');
  return value;
}

function biologyError(code) { return Object.assign(new Error(code), { code }); }

async function bindRun(db, input) {
  const agent = await db.get('SELECT * FROM agents WHERE id = ?', input.agentId);
  if (agent?.execution_mode !== 'worker') return null;
  await ensure(db);
  const mission = await missionForWorker(db, { agent, missionId: input.missionId });
  const record = await require('./strategyContractService').getContractById(db, input.contractRecord.id);
  if (!record || record.version !== input.contractRecord.version
      || digest(record.contract) !== digest(input.contractRecord.contract)) {
    throw biologyError('BIOLOGICAL_WORKER_CONTRACT_MISMATCH');
  }
  const binding = buildBinding({ ...input, agent, mission });
  await db.run(`INSERT INTO biological_worker_bindings (run_id, mission_id, agent_id, binding_hash, binding_json)
    VALUES (?, ?, ?, ?, ?)`, input.id, mission.mission_id, agent.id, digest(binding), encode(binding));
  return binding;
}

async function missionForWorker(db, input) {
  const rows = await db.all(`SELECT m.* FROM missions m JOIN mission_agents ma ON ma.mission_id = m.mission_id
    WHERE ma.agent_id = ? AND m.status = 'active' AND (? IS NULL OR m.mission_id = ?) LIMIT 2`,
  input.agent.id, input.missionId || null, input.missionId || null);
  if (rows.length !== 1) throw biologyError('BIOLOGICAL_WORKER_MISSION_AMBIGUOUS');
  if (input.agent.parent_agent_id) {
    const parent = await db.get('SELECT organization_id, project_id FROM agents WHERE id = ?', input.agent.parent_agent_id);
    if (!parent || parent.organization_id !== input.agent.organization_id || parent.project_id !== input.agent.project_id) {
      throw biologyError('BIOLOGICAL_WORKER_TENANT_MISMATCH');
    }
  }
  return rows[0];
}

function buildBinding(input) {
  const metadata = JSON.parse(input.agent.metadata_json || '{}');
  const genome = { schema: 'genos.worker-genome/v1', role: input.agent.role,
    objective: input.mission.objective, strategyContract: input.contractRecord.contract,
    workerContract: metadata.workerContract || null, dna: input.agent.dna_json || null };
  const genomeHash = digest(genome);
  return { schema: 'genos.worker-biological-binding/v1', runtime: 'node-worker', runId: input.id,
    missionId: input.mission.mission_id, workerId: input.agent.id,
    cellId: identity(['genos.node-cell/v1', input.mission.mission_id, input.agent.id]),
    genomeId: identity(['genos.worker-genome/v1', genomeHash]), genomeHash, genome,
    contractId: input.contractRecord.id, contractVersion: input.contractRecord.version,
    budget: input.budget, parentWorkerId: input.agent.parent_agent_id || null,
    tenant: { organizationId: input.agent.organization_id || null, projectId: input.agent.project_id || null } };
}

async function binding(db, runId) {
  await ensure(db);
  return verifiedJson(await db.get('SELECT * FROM biological_worker_bindings WHERE run_id = ?', runId), 'binding_json');
}

async function eventBinding(db, request) {
  await ensure(db);
  const runId = request.event.payload?.executionRunId;
  if (runId) {
    const value = await binding(db, runId);
    if (value && value.workerId !== request.agentId) throw biologyError('BIOLOGICAL_WORKER_RUN_OWNER_MISMATCH');
    return value;
  }
  const row = await db.get(`SELECT b.* FROM biological_worker_bindings b JOIN strategy_execution_runs r ON r.id = b.run_id
    WHERE b.agent_id = ? AND r.status IN ('planned', 'running') ORDER BY r.rowid DESC LIMIT 1`, request.agentId);
  return verifiedJson(row, 'binding_json');
}

async function observe(db, request) {
  const value = await eventBinding(db, request);
  if (!value) return null;
  const eventHash = digest(request.event);
  const eventKey = String(request.event.id || request.event.eventId || eventHash);
  await db.run(`INSERT OR IGNORE INTO biological_worker_observations (run_id, event_key, event_hash, event_json)
    VALUES (?, ?, ?, ?)`, value.runId, eventKey, eventHash, encode(request.event));
  const row = await observation(db, { runId: value.runId, eventKey });
  if (row.event_hash !== eventHash) throw biologyError('BIOLOGICAL_WORKER_EVENT_CONFLICT');
  return { binding: value, eventKey, applied: row.applied === 1 };
}

async function observation(db, input) {
  const row = await db.get('SELECT * FROM biological_worker_observations WHERE run_id = ? AND event_key = ?', input.runId, input.eventKey);
  verifiedJson(row, 'event_json');
  return row;
}

async function markApplied(db, input) {
  await db.run('UPDATE biological_worker_observations SET applied = 1 WHERE run_id = ? AND event_key = ?', input.runId, input.eventKey);
}

async function observations(db, runId) {
  const rows = await db.all('SELECT * FROM biological_worker_observations WHERE run_id = ? ORDER BY rowid', runId);
  return rows.map(row => ({ event: verifiedJson(row, 'event_json'), hash: row.event_hash, applied: row.applied === 1 }));
}

async function putReceipt(db, receipt) {
  const hash = digest(receipt);
  await db.run(`INSERT OR IGNORE INTO biological_worker_receipts (receipt_id, run_id, mission_id, payload_hash, receipt_json)
    VALUES (?, ?, ?, ?, ?)`, receipt.receiptId, receipt.runId, receipt.missionId, hash, encode(receipt));
  const row = await db.get('SELECT * FROM biological_worker_receipts WHERE run_id = ?', receipt.runId);
  if (row.payload_hash !== hash) throw biologyError('BIOLOGICAL_WORKER_RECEIPT_CONFLICT');
  return { ...verifiedJson(row, 'receipt_json'), payloadHash: row.payload_hash };
}

async function receipt(db, runId) {
  await ensure(db);
  const row = await db.get('SELECT * FROM biological_worker_receipts WHERE run_id = ?', runId);
  const value = verifiedJson(row, 'receipt_json');
  return value && { ...value, payloadHash: row.payload_hash };
}

module.exports = { ensure, bindRun, binding, eventBinding, observe, observation, observations,
  markApplied, putReceipt, receipt, biologyError, verifiedJson };
