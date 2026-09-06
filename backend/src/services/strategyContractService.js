const crypto = require('crypto');
const { selectStrategyPortfolio } = require('../strategies/strategySelector');
const { listStrategies } = require('../strategies/strategyRegistry');

function getStrategyHandlers() {
  return require('./strategyExecutionAdapter').getHandlers();
}

const CONTRACT_SCHEMA = 'genos.strategy-contract/v1alpha1';

function buildStrategyContract(input = {}) {
  const selectionInput = {
    ...input,
    allowExperimental: input.allowExperimental !== undefined ? input.allowExperimental : true,
    allowPrototype: input.allowPrototype !== undefined ? input.allowPrototype : true,
    allowExperimentalAtHighRisk: input.allowExperimentalAtHighRisk !== undefined ? input.allowExperimentalAtHighRisk : true
  };
  const selection = selectStrategyPortfolio(selectionInput);
  const problem = selection.problem;
  const problemProfile = selection.profile;
  const selected = selection.primary;
  const highRisk = problemProfile.risk === 'high';
  return {
    schema: CONTRACT_SCHEMA,
    mission: problem || 'Autonomous task execution',
    problem_profile: problemProfile,
    selected_strategy: {
      primary: selected.id,
      allocation: selection.policies.allocation,
      evaluation: selection.policies.evaluation,
      merge: selection.policies.merge,
      maturity: selected.maturity,
      rationale: `Selected ${selected.id} from ${selection.decisions.length} strategies for a ${problemProfile.type} problem with uncertainty ${problemProfile.uncertainty.toFixed(2)} and ${problemProfile.risk} risk.`
    },
    strategy_portfolio: selection.portfolio.map((strategy) => ({
      id: strategy.id, name: strategy.name, family: strategy.family, role: strategy.role,
      maturity: strategy.maturity, primitives: strategy.primitives,
      score: selection.decisions.find((decision) => decision.strategy.id === strategy.id)?.score
    })),
    strategy_decision_summary: selection.summary,
    strategy_registry: {
      total: selection.decisions.length,
      selection_complete: selection.decisions.length === listStrategies().length,
      endpoint: '/api/strategies'
    },
    strategy_decisions: selection.decisions.map((decision) => ({
      id: decision.strategy.id, name: decision.strategy.name, family: decision.strategy.family,
      maturity: decision.strategy.maturity, status: decision.status,
      score: decision.score, reason: decision.reason
    })),
    selection_policy: selection.options,
    execution_pipeline: ['memory_retrieval', 'snapshot', 'isolated_forks', 'instrumented_run', 'adaptive_evaluation', 'diff_and_replay', 'audit', 'conditional_promotion'],
    branches: selection.branches.map((hypothesis, index) => ({
      label: `branch_${index + 1}`,
      hypothesis,
      budget_share: Number((1 / selection.branches.length).toFixed(3)),
      isolation: 'agent_world_capsule'
    })),
    stop_conditions: ['hard_invariant_failure', 'circuit_breaker_open', 'dominated_after_minimum_evidence', 'budget_exhausted'],
    promotion: {
      require_replay: problemProfile.requires_reproducibility || highRisk,
      require_independent_verification: true,
      require_human_approval: highRisk || problemProfile.reversibility === 'low' || selection.portfolio.some((strategy) => strategy.maturity !== 'implemented'),
      preserve_rejected_branches: true,
      merge_workspace_automatically: false
    },
    observability: ['events', 'cost_usd', 'tokens', 'latency_ms', 'tool_receipts', 'lineage', 'diff'],
    created_at: new Date().toISOString()
  };
}

function validateContract(contract) {
  if (!contract || contract.schema !== CONTRACT_SCHEMA) throw new Error(`Contract schema must be ${CONTRACT_SCHEMA}`);
  if (!contract.problem_profile?.type) throw new Error('problem_profile.type is required');
  if (!contract.selected_strategy?.primary) throw new Error('selected_strategy.primary is required');
  const registryIds = new Set(listStrategies().map((strategy) => strategy.id));
  if (!registryIds.has(contract.selected_strategy.primary)) throw new Error(`Unknown primary strategy '${contract.selected_strategy.primary}'`);
  if (!Array.isArray(contract.strategy_portfolio)) throw new Error('strategy_portfolio must be an array');
  const portfolioIds = new Set(contract.strategy_portfolio.map((strategy) => strategy.id));
  for (const id of portfolioIds) {
    if (!registryIds.has(id)) throw new Error(`Unknown portfolio strategy '${id}'`);
    const definition = listStrategies().find((strategy) => strategy.id === id);
    const missing = definition.primitives.filter((primitive) => !getStrategyHandlers()[primitive]);
    if (missing.length) throw new Error(`Strategy '${id}' has unimplemented primitives: ${missing.join(', ')}`);
  }
  if (!portfolioIds.has(contract.selected_strategy.primary)) throw new Error('Primary strategy must be present in strategy_portfolio');
  const decisionIds = new Set((contract.strategy_decisions || []).map((decision) => decision.id));
  if (decisionIds.size !== registryIds.size || [...registryIds].some((id) => !decisionIds.has(id))) {
    throw new Error(`strategy_decisions must contain the complete ${registryIds.size}-strategy registry`);
  }
  if (!Array.isArray(contract.branches)) throw new Error('branches must be an array');
  if (!Array.isArray(contract.stop_conditions)) throw new Error('stop_conditions must be an array');
  if (!contract.promotion) throw new Error('promotion policy is required');
  return contract;
}

function hashContract(contract) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(contract)).digest('hex')}`;
}

function parseRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    agentId: row.agent_id,
    workspaceId: row.workspace_id,
    version: row.version,
    status: row.status,
    primaryStrategy: row.primary_strategy,
    contractHash: row.contract_hash,
    decisionReason: row.decision_reason,
    createdBy: row.created_by,
    createdAt: row.created_at,
    contract: JSON.parse(row.contract_json)
  };
}

async function saveContract(db, context = {}) {
  const agent = await db.get('SELECT id, execution_mode FROM agents WHERE id = ?', context.agentId);
  if (!agent) throw new Error(`Agent '${context.agentId}' was not found`);
  if (agent.execution_mode === 'worker') {
    const error = new Error(`Worker '${context.agentId}' cannot select a strategy contract; its orchestrator owns strategy selection.`);
    error.code = 'WORKER_REQUIRES_ORCHESTRATOR';
    throw error;
  }
  const contract = validateContract(context.contract || buildStrategyContract(context));
  const previous = await db.get('SELECT version FROM strategy_contracts WHERE agent_id = ? ORDER BY version DESC LIMIT 1', context.agentId);
  const version = (previous?.version || 0) + 1;
  const id = `strategy_${context.agentId}_${version}`;
  const hash = hashContract(contract);
  await db.run("UPDATE strategy_contracts SET status = 'superseded' WHERE agent_id = ? AND status = 'active'", context.agentId);
  await db.run(
    `INSERT INTO strategy_contracts (id, agent_id, workspace_id, version, status, primary_strategy, contract_hash, contract_json, decision_reason, created_by)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
    id, context.agentId, context.workspaceId || null, version, contract.selected_strategy.primary,
    hash, JSON.stringify(contract), context.decisionReason || contract.selected_strategy.rationale,
    context.createdBy || 'orchestrator'
  );
  return getLatestContract(db, context.agentId);
}

async function getLatestContract(db, agentId) {
  return parseRow(await db.get('SELECT * FROM strategy_contracts WHERE agent_id = ? ORDER BY version DESC LIMIT 1', agentId));
}

async function listContracts(db, agentId) {
  const rows = await db.all('SELECT * FROM strategy_contracts WHERE agent_id = ? ORDER BY version DESC', agentId);
  return rows.map(parseRow);
}

module.exports = { CONTRACT_SCHEMA, buildStrategyContract, validateContract, saveContract, getLatestContract, listContracts };
