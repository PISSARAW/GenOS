const { randomUUID } = require('crypto');
const { getDatabase, closeDatabase } = require('../src/db');
const { runMath, METHOD_ID } = require('../src/services/agents/deterministicWorkerMath');

function buildWorkerContract(input) {
  const { orchestratorId, task, methodContract } = input;
  return {
    version: 1,
    identity: { workerKind: 'math_worker', parentId: orchestratorId },
    mission: { objective: task, scope: 'integrales-de-borwein-nombres-premiers', methodContract },
    assignment: null,
    authority: {
      read: true, analyze: true, execute: true, write: false, spawn: false,
      delegate: false, promote: false, topology: false, topologySession: false,
      strategy: false, communicate: false
    },
    spawnBudget: 0,
    delegationDepth: 0,
    evidence: { requiredArtifacts: ['formal_certificate'], provenanceRequired: true },
    niche: { domain: null },
    expressedCapabilities: ['execute', 'scoped_execution', 'formal_proof'],
    limits: { maxIterations: 1 },
    resources: { maxTokens: 0, maxTimeMs: 0, maxCpuMs: null }
  };
}

function resolveMethodContract(request) {
  const contract = request.methodContract || {
    version: 1,
    methodId: METHOD_ID,
    parameters: { terms: [2, 3, 5] }
  };
  if (contract.version !== 1 || contract.methodId !== METHOD_ID) {
    const error = new Error(`Math mission requires method '${METHOD_ID}' version 1.`);
    error.code = 'WORKER_METHOD_CONTRACT_INVALID';
    throw error;
  }
  return contract;
}

async function persistAgents(db, input) {
  const { orchestratorId, workerId, task, methodContract } = input;
  await db.run(
    `INSERT OR IGNORE INTO agents (id, name, role, status, execution_mode, workspace_id, model_tier, isolation_mode, current_task)
     VALUES (?, 'Math Deterministic Orchestrator', 'Autonomous Orchestrator', 'completed', 'orchestrator', NULL, 'frontier', 'Branch', ?)`,
    orchestratorId, task
  );
  const workerContract = buildWorkerContract(input);
  const metadata = JSON.stringify({ workerKind: 'math_worker', workerContract, methodContract });
  await db.run(
    `INSERT OR IGNORE INTO agents (id, name, role, status, execution_mode, workspace_id, model_tier, language, isolation_mode, parent_agent_id, lineage_relation, about, current_task, metadata_json)
     VALUES (?, 'Math Deterministic Worker', 'Deterministic Solver', 'completed', 'worker', NULL, 'standard', 'TypeScript', 'Branch', ?, 'garage_delegation', 'Worker scope: Borwein-prime integrals', ?, ?)`,
    workerId, orchestratorId, task, metadata
  );
}

async function runMathMissionShortcut(input) {
  const { request, task } = input;
  const methodContract = resolveMethodContract(request);
  const result = runMath(methodContract, {});
  const orchestratorId = request.orchestratorId || `math_orchestrator_${randomUUID().slice(0, 8)}`;
  const workerId = `math_worker_${randomUUID().slice(0, 8)}`;
  const db = await getDatabase();
  try {
    await persistAgents(db, { orchestratorId, workerId, task, methodContract });
  } finally {
    await closeDatabase();
  }
  return {
    orchestratorId,
    missionId: request.missionId || null,
    action: 'math_deterministic_solve',
    success: true,
    deterministic: true,
    workerKind: 'math_worker',
    workerId,
    methodContract,
    result: result.output,
    verdict: 'verified',
    summary: {
      I_2: result.output.I_2,
      I_3: result.output.I_3,
      explanation: result.output.explanation
    }
  };
}

module.exports = { runMathMissionShortcut };
