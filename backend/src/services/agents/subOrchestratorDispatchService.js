'use strict';

const ALLOWED_CHILD_KINDS = new Set(['scout_cell', 'bounded_worker', 'adaptive_worker', 'verifier_worker']);
const MAX_CHILDREN = 5;
const MAX_CHILD_TOKENS = 10000;
const CHILD_TIMEOUT_MS = 60000;
const CHILD_TERMINAL_STATES = new Set(['completed', 'failed', 'error', 'terminated', 'blocked', 'unverified', 'quarantined']);

function parseMetadata(row) {
  try { return typeof row.metadata_json === 'string' ? JSON.parse(row.metadata_json) : row.metadata_json || {}; }
  catch (_) { throw Object.assign(new Error('Sub-orchestrator metadata is invalid.'), { code: 'INVALID_SUBORCHESTRATOR_CONTRACT' }); }
}

function requireDelegationContract(metadata) {
  const contract = metadata.workerContract;
  if (metadata.workerKind !== 'sub_orchestrator' || contract?.identity?.workerKind !== 'sub_orchestrator'
    || contract.authority?.delegate !== true || contract.authority?.spawn !== true
    || contract.delegationDepth !== 1 || contract.spawnBudget !== MAX_CHILDREN
    || !Number.isFinite(contract.delegationExpiresAt) || Date.now() >= contract.delegationExpiresAt) {
    throw Object.assign(new Error('Caller has no active bounded sub-orchestration contract.'), { code: 'WORKER_CONTRACT_DENIED' });
  }
}

async function loadAuthorizedParent(db, callerAgentId) {
  const row = await db.get('SELECT id, role, agent_type, workspace_id, fleet_id, model_tier, language, isolation_mode, current_task, cognitive_budget, metadata_json, execution_mode FROM agents WHERE id = ?', callerAgentId);
  if (!row || row.execution_mode !== 'worker') throw Object.assign(new Error('Authenticated caller is not a persisted worker.'), { code: 'WORKER_CONTRACT_DENIED' });
  const metadata = parseMetadata(row);
  requireDelegationContract(metadata);
  return { ...row, metadata };
}

function childAssignment(args) {
  const kind = String(args.workerKind || 'bounded_worker').trim().toLowerCase();
  if (!ALLOWED_CHILD_KINDS.has(kind)) throw Object.assign(new Error(`Child worker kind '${kind}' is outside the sub-orchestrator allowlist.`), { code: 'SUBORCHESTRATOR_CHILD_KIND_DENIED' });
  const role = String(args.role || kind).slice(0, 80);
  return { role, workerKind: kind, label: `delegated-${kind}`, hypothesis: 'Complete the scoped subtask and return contract evidence.', capabilities: [] };
}

async function ensureCapacity(db, parentId) {
  const row = await db.get("SELECT COUNT(*) AS count FROM agents WHERE parent_agent_id = ? AND execution_mode = 'worker'", parentId);
  if (Number(row?.count || 0) >= MAX_CHILDREN) throw Object.assign(new Error('Sub-orchestrator reached its five-child lifetime limit.'), { code: 'SUBORCHESTRATOR_CHILD_LIMIT' });
}

function workerPlan(parent, assignment) {
  const cognitiveBudget = Math.max(1, Number(parent.cognitive_budget) || 1);
  const contractBudget = Math.max(1, Number(parent.metadata.workerContract.limits?.maxTokens) || MAX_CHILD_TOKENS);
  const tokens = Math.min(MAX_CHILD_TOKENS, contractBudget, cognitiveBudget);
  return {
    dispatchWorkers: [assignment], strategyContract: { primary: 'tree-search' },
    tokenPolicy: { total: tokens, workerShare: 1, orchestratorReserve: 0, rounds: { initial: { perWorkerTokens: tokens } } }
  };
}

async function createChild(db, parent, args) {
  const assignment = childAssignment(args);
  const fleet = require('../agentFleetWorkers');
  const { withTransaction } = require('../../db');
  const mission = {
    prompt: String(args.mission).trim().slice(0, 12000), executor: 'local',
    workspaceRoot: (await db.get('SELECT path FROM workspaces WHERE id = ?', parent.workspace_id))?.path,
    executionPolicy: { allowFileEdits: false }, executionBudget: { events: 100 }
  };
  const workers = await withTransaction(db, async () => {
    await ensureCapacity(db, parent.id);
    return fleet.createAutonomousWorkers(db, { id: parent.id, agent_type: parent.agent_type }, {
      plan: workerPlan(parent, assignment), mission
    });
  });
  return { child: workers[0], mission };
}

async function childOutcome(db, childId) {
  const agent = await db.get('SELECT id, status, metadata_json FROM agents WHERE id = ?', childId);
  if (!agent || !CHILD_TERMINAL_STATES.has(agent.status)) return null;
  if (agent.status !== 'completed') return failedChild(agent.status, 'CHILD_NOT_COMPLETED');
  return validateChildEvidence(db, agent);
}

function failedChild(childStatus, code) {
  return { status: 'failed', childStatus, success: false, code };
}

async function validateChildEvidence(db, agent) {
  const { id: childId, metadata_json: metadataJson, status } = agent;
  const metadata = parseMetadata({ metadata_json: metadataJson });
  const event = await db.get("SELECT payload_json FROM telemetry_events WHERE agent_id = ? AND event_type = 'EVIDENCE_REPORT' ORDER BY id DESC LIMIT 1", childId);
  if (!event) return failedChild(status, 'MISSING_EVIDENCE_REPORT');
  const payload = parseJson(event.payload_json);
  const report = require('../agentEvidenceService').extractEvidenceReport(payload);
  try {
    require('./workerArtifactContract').validateWorkerArtifact({ events: [{ evidenceReport: report }] }, {
      agentId: childId, workerContract: metadata.workerContract
    });
  } catch (error) {
    return failedChild(status, error.code || 'INVALID_WORKER_ARTIFACT');
  }
  if (report.outcome !== 'success') return failedChild(status, 'CHILD_REPORT_NOT_SUCCESS');
  return { status, success: true, evidenceReport: report };
}

function parseJson(value) {
  try { return JSON.parse(value || '{}'); } catch (_) { return {}; }
}

async function waitForChild(db, childId) {
  const deadline = Date.now() + CHILD_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const outcome = await childOutcome(db, childId);
    if (outcome) return outcome;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { status: 'timeout', success: false, code: 'SUBORCHESTRATOR_CHILD_TIMEOUT' };
}

async function superviseChild(context) {
  const { db, child, mission, parentAgentId } = context;
  const { startMission } = require('../agentRuntimeAdapter');
  try {
    await startMission({ ...mission, executionBudget: { ...mission.executionBudget, ...child.executionBudget }, agentId: child.agentId, role: child.role, workerKind: child.workerKind, orchestratorAgentId: parentAgentId, workspaceId: child.workspaceId });
    const outcome = await waitForChild(db, child.agentId);
    if (outcome.status === 'timeout') await require('../agentRuntimeAdapter').stopMission(child.agentId);
    return outcome;
  } catch (error) {
    return { status: 'failed', error: { code: error.code || 'CHILD_MISSION_FAILED', message: error.message } };
  }
}

async function dispatchSubOrchestratorWorker(db, callerAgentId, args) {
  const parent = await loadAuthorizedParent(db, callerAgentId);
  const { child, mission } = await createChild(db, parent, args);
  const supervision = await superviseChild({ db, child, mission, parentAgentId: parent.id });
  return { configured: true, success: supervision.status === 'completed', status: supervision.status, transport: 'worker_dispatch', parentAgentId: parent.id, childAgentId: child.agentId, supervision };
}

module.exports = { dispatchSubOrchestratorWorker, loadAuthorizedParent, childAssignment, MAX_CHILDREN, MAX_CHILD_TOKENS, CHILD_TIMEOUT_MS };
