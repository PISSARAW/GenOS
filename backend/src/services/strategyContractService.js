const crypto = require('crypto');
const { selectStrategyPortfolio } = require('../strategies/strategySelector');
const { listStrategies, registryHealth } = require('../strategies/strategyRegistry');
const philosophicalGuard = require('./philosophicalPromotionGuard');
const philosophyPolicy = require('./philosophyPromotionPolicyService');
const ethicalComparisonPolicy = require('./ethicalComparisonPolicyService');
const epistemicDecision = require('./epistemicDecisionService');

function getStrategyHandlers() {
  return require('./strategyExecutionAdapter').getHandlers();
}

const CONTRACT_SCHEMA = 'genos.strategy-contract/v1alpha1';

function decisionScore(decisions, strategyId) {
  const decision = decisions.find((item) => item.strategy.id === strategyId);
  if (!decision) return undefined;
  return decision.score;
}

function portfolioHasUnimplemented(portfolio) {
  return portfolio.some((strategy) => {
    return strategy.maturity !== 'implemented';
  });
}

function buildStrategyContract(input = {}) {
  const selectionInput = {
    ...input,
    allowExperimental: input.allowExperimental !== undefined ? input.allowExperimental : false,
    allowPrototype: input.allowPrototype !== undefined ? input.allowPrototype : false,
    allowExperimentalAtHighRisk: input.allowExperimentalAtHighRisk !== undefined ? input.allowExperimentalAtHighRisk : false
  };
  const selection = selectStrategyPortfolio(selectionInput);
  const problem = selection.problem;
  const problemProfile = selection.profile;
  const selected = selection.primary;
  const highRisk = problemProfile.risk === 'high';
  const philosophyContext = input.philosophyContext || input.philosophy_context;
  const philosophy = philosophyContext
    ? philosophyPolicy.buildPromotionPolicy({ philosophyContext })
    : null;
  const epistemicContext = epistemicDecision.buildDecisionContext(input);
  const ethicalComparisonInput = input.ethicalComparison || input.ethical_comparison;
  const ethicalComparison = ethicalComparisonInput
    ? { ...ethicalComparisonInput, promotion: ethicalComparisonPolicy.buildPromotionPolicy(ethicalComparisonInput) }
    : null;
  return {
    schema: CONTRACT_SCHEMA,
    mission: problem || 'Autonomous task execution',
    problem_profile: problemProfile,
    selected_strategy: {
      primary: selected.id,
      requested_primary: selection.requestedPrimary,
      fallback: selection.primaryFallback,
      allocation: selection.policies.allocation,
      evaluation: selection.policies.evaluation,
      merge: selection.policies.merge,
      maturity: selected.maturity,
      rationale: `Selected ${selected.id} from ${selection.decisions.length} strategies for a ${problemProfile.type} problem with uncertainty ${problemProfile.uncertainty.toFixed(2)} and ${problemProfile.risk} risk.`
    },
    strategy_portfolio: selection.portfolio.map((strategy) => ({
      id: strategy.id, name: strategy.name, family: strategy.family, role: strategy.role,
      maturity: strategy.maturity, primitives: strategy.primitives,
      score: decisionScore(selection.decisions, strategy.id)
    })),
    strategy_decision_summary: selection.summary,
    strategy_registry: {
      total: selection.decisions.length,
      selection_complete: selection.decisions.length === listStrategies().length,
      registry_hash: registryHealth().registryHash,
      endpoint: '/api/strategies'
    },
    strategy_decisions: selection.decisions.map((decision) => ({
      id: decision.strategy.id, name: decision.strategy.name, family: decision.strategy.family,
      maturity: decision.strategy.maturity, status: decision.status,
      score: decision.score, reason: decision.reason
    })),
    selection_policy: selection.options,
    philosophical_context: philosophy,
    epistemic_context: epistemicContext.analyses.length ? epistemicContext : null,
    ethical_comparison: ethicalComparison,
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
      require_human_approval: highRisk || problemProfile.reversibility === 'low' || portfolioHasUnimplemented(selection.portfolio) || Boolean(philosophy?.requireHumanApproval),
      philosophy_hold: Boolean(philosophy?.holdPromotion),
      epistemic_hold: Boolean(epistemicContext.promotion.holdPromotion),
      require_epistemic_verification: Boolean(epistemicContext.promotion.requireIndependentVerification),
      require_epistemic_provenance: Boolean(epistemicContext.promotion.requireProvenance),
      ethical_comparison_hold: Boolean(ethicalComparison?.promotion?.holdPromotion),
      require_ethical_review: Boolean(ethicalComparison?.promotion?.requireEthicalReview),
      require_ethical_provenance: Boolean(ethicalComparison),
      preserve_rejected_branches: true,
      merge_workspace_automatically: false
    },
    philosophy: philosophicalGuard.buildContext(input.philosophy || input.philosophyContext || input.philosophy_context || input.philosophicalContext || input.philosophicalConcepts),
    observability: ['events', 'cost_usd', 'tokens', 'latency_ms', 'tool_receipts', 'lineage', 'diff']
  };
}

function validateContractSchema(contract) {
  if (!contract || contract.schema !== CONTRACT_SCHEMA) throw new Error(`Contract schema must be ${CONTRACT_SCHEMA}`);
  if (!contract.problem_profile || !contract.problem_profile.type) throw new Error('problem_profile.type is required');
  if (!contract.selected_strategy || !contract.selected_strategy.primary) throw new Error('selected_strategy.primary is required');
}

function validateContractFallback(contract) {
  const fallback = contract.selected_strategy.fallback;
  if (fallback && (!fallback.requested || !fallback.selected || !fallback.reason)) {
    throw new Error('selected_strategy.fallback must include requested, selected, and reason');
  }
}

function validateContractRegistry(contract) {
  const registryIds = new Set(listStrategies().map((strategy) => strategy.id));
  const registry = contract.strategy_registry;
  if (registry && registry.registry_hash && registry.registry_hash !== registryHealth().registryHash) {
    throw Object.assign(new Error('Strategy registry changed since this contract was selected.'), { code: 'STRATEGY_REGISTRY_CHANGED' });
  }
  if (!registryIds.has(contract.selected_strategy.primary)) throw new Error(`Unknown primary strategy '${contract.selected_strategy.primary}'`);
  return registryIds;
}

function validateContractPortfolio(contract, registryIds) {
  if (!Array.isArray(contract.strategy_portfolio)) throw new Error('strategy_portfolio must be an array');
  const portfolioIds = new Set(contract.strategy_portfolio.map((strategy) => strategy.id));
  for (const id of portfolioIds) {
    if (!registryIds.has(id)) throw new Error(`Unknown portfolio strategy '${id}'`);
    const definition = listStrategies().find((strategy) => strategy.id === id);
    const missing = definition.primitives.filter((primitive) => !getStrategyHandlers()[primitive]);
    if (missing.length) throw new Error(`Strategy '${id}' has unimplemented primitives: ${missing.join(', ')}`);
  }
  if (!portfolioIds.has(contract.selected_strategy.primary)) throw new Error('Primary strategy must be present in strategy_portfolio');
}

function validateDecisionSet(decisions, registryIds) {
  const decisionIds = new Set(decisions.map((decision) => decision.id));
  if (decisionIds.size !== registryIds.size || [...registryIds].some((id) => !decisionIds.has(id))) {
    throw new Error(`strategy_decisions must contain the complete ${registryIds.size}-strategy registry`);
  }
}

function isFiniteScore(score) {
  if (typeof score !== 'number' && typeof score !== 'string') return false;
  if (String(score).trim() === '') return false;
  return Number.isFinite(Number(score));
}

function validatePrimaryDecision(decisions, primaryId) {
  const primaryDecision = decisions.find((decision) => decision.id === primaryId);
  if (!primaryDecision || primaryDecision.status !== 'selected') throw new Error('selected_strategy.primary must have a selected strategy_decisions entry.');
  if (!isFiniteScore(primaryDecision.score)) throw new Error('selected primary strategy must have a finite score.');
}

function validateDecisionMaturity(decisions) {
  for (const decision of decisions) {
    const current = listStrategies().find((strategy) => strategy.id === decision.id);
    if (current && decision.maturity !== current.maturity) throw new Error(`Strategy maturity mismatch for '${decision.id}'.`);
  }
}

function validateContractDecisions(contract, registryIds) {
  const decisions = contract.strategy_decisions || [];
  validateDecisionSet(decisions, registryIds);
  validatePrimaryDecision(decisions, contract.selected_strategy.primary);
  validateDecisionMaturity(decisions);
}

function validateContractBranches(contract) {
  if (!Array.isArray(contract.branches)) throw new Error('branches must be an array');
  if (!contract.branches.length) throw new Error('branches must contain at least one hypothesis');
  const budgetShare = contract.branches.reduce((sum, branch) => sum + Number(branch.budget_share || 0), 0);
  if (!Number.isFinite(budgetShare) || Math.abs(budgetShare - 1) > 0.01) throw new Error('branch budget_share values must total approximately 1');
  if (contract.branches.some((branch) => !branch.label || !branch.hypothesis)) throw new Error('every branch requires a label and hypothesis');
}

function validateContract(contract) {
  validateContractSchema(contract);
  validateContractFallback(contract);
  const registryIds = validateContractRegistry(contract);
  validateContractPortfolio(contract, registryIds);
  validateContractDecisions(contract, registryIds);
  validateContractBranches(contract);
  if (!Array.isArray(contract.stop_conditions)) throw new Error('stop_conditions must be an array');
  if (!contract.promotion) throw new Error('promotion policy is required');
  if (contract.philosophy) philosophicalGuard.buildContext(contract.philosophy);
  return contract;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
}

function digestContract(contract, canonical = true) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(canonical ? stableValue(contract) : contract)).digest('hex')}`;
}

function hashContract(contract) {
  return digestContract(contract, true);
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
    contract: (() => {
      const contract = JSON.parse(row.contract_json);
      const canonicalHash = digestContract(contract, true);
      const legacyHash = digestContract(contract, false);
      if (row.contract_hash !== canonicalHash && row.contract_hash !== legacyHash) {
        throw Object.assign(new Error(`Strategy contract '${row.id}' failed integrity verification.`), { code: 'STRATEGY_CONTRACT_CORRUPTED' });
      }
      return contract;
    })()
  };
}

function nextVersion(previous) {
  if (!previous || !previous.version) return 1;
  return previous.version + 1;
}

async function insertContract(db, payload) {
  const { id, context, version, contract, hash } = payload;
  await db.run(
    `INSERT INTO strategy_contracts (id, agent_id, workspace_id, version, status, primary_strategy, contract_hash, contract_json, decision_reason, created_by)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
    id, context.agentId, context.workspaceId || null, version, contract.selected_strategy.primary,
    hash, JSON.stringify(contract), context.decisionReason || contract.selected_strategy.rationale,
    context.createdBy || 'orchestrator'
  );
}

async function persistStrategyContract(db, context) {
  const contract = validateContract(context.contract || buildStrategyContract(context));
  const previous = await db.get('SELECT version FROM strategy_contracts WHERE agent_id = ? ORDER BY version DESC LIMIT 1', context.agentId);
  const version = nextVersion(previous);
  const id = `strategy_${context.agentId}_${version}`;
  const hash = hashContract(contract);
  await db.run("UPDATE strategy_contracts SET status = 'superseded' WHERE agent_id = ? AND status = 'active'", context.agentId);
  await insertContract(db, { id, context, version, contract, hash });
  return parseRow(await db.get('SELECT * FROM strategy_contracts WHERE id = ?', id));
}

async function saveContract(db, context = {}) {
  if (!context._inTransaction) {
    const { withTransaction } = require('../db');
    return withTransaction(db, (tx) => saveContract(tx, { ...context, _inTransaction: true }));
  }
  const agent = await db.get('SELECT a.id, a.execution_mode, a.workspace_id FROM agents a WHERE a.id = ?', context.agentId);
  if (!agent) throw new Error(`Agent '${context.agentId}' was not found`);
  if (context.workspaceId && agent.workspace_id !== context.workspaceId) {
    const error = new Error(`Agent '${context.agentId}' does not belong to workspace '${context.workspaceId}'.`);
    error.code = 'AGENT_WORKSPACE_MISMATCH';
    throw error;
  }
  if (agent.execution_mode === 'worker') {
    const error = new Error(`Worker '${context.agentId}' cannot select a strategy contract; its orchestrator owns strategy selection.`);
    error.code = 'WORKER_REQUIRES_ORCHESTRATOR';
    throw error;
  }
  return persistStrategyContract(db, context);
}

async function getLatestContract(db, agentId, workspaceId = null) {
  let row = null;
  if (workspaceId) {
    row = await db.get('SELECT * FROM strategy_contracts WHERE agent_id = ? AND workspace_id = ? ORDER BY version DESC LIMIT 1', agentId, workspaceId);
  }
  if (!row) {
    row = await db.get('SELECT * FROM strategy_contracts WHERE agent_id = ? ORDER BY version DESC LIMIT 1', agentId);
  }
  return parseRow(row);
}

async function listContracts(db, agentId, workspaceId = null) {
  const rows = await db.all(
    workspaceId
      ? 'SELECT * FROM strategy_contracts WHERE agent_id = ? AND workspace_id = ? ORDER BY version DESC'
      : 'SELECT * FROM strategy_contracts WHERE agent_id = ? ORDER BY version DESC',
    ...(workspaceId ? [agentId, workspaceId] : [agentId])
  );
  return rows.map(parseRow);
}

async function getContractById(db, id) {
  return parseRow(await db.get('SELECT * FROM strategy_contracts WHERE id = ?', id));
}

module.exports = { CONTRACT_SCHEMA, buildStrategyContract, validateContract, hashContract, saveContract, getLatestContract, getContractById, listContracts };
