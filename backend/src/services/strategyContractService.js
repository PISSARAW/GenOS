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
  const d = decisions.find((item) => item.strategy.id === strategyId);
  return d ? d.score : undefined;
}

function portfolioHasUnimplemented(portfolio) {
  return portfolio.some((s) => s.maturity !== 'ready');
}

function buildStrategyContract(input = {}) {
  const norm = normalizeInput(input);
  const selection = selectStrategyPortfolio(norm);
  const problemProfile = selection.profile;
  const selected = selection.primary;
  const highRisk = problemProfile.risk === 'high';
  const philosophy = buildPhilosophyContext(norm);
  const ethicalComparison = buildEthicalContext(norm);
  const epistemicContext = epistemicDecision.buildDecisionContext(norm);
  return assembleContract({ selection, problemProfile, selected, highRisk, philosophy, epistemicContext, ethicalComparison });
}

function normalizeInput(input) {
  return {
    ...input,
    allowExperimental: bool(input.allowExperimental, false),
    allowPrototype: bool(input.allowPrototype, false),
    allowExperimentalAtHighRisk: bool(input.allowExperimentalAtHighRisk, false)
  };
}

function bool(value, fallback) {
  return value !== undefined ? value : fallback;
}

function buildPhilosophyContext(input) {
  const ctx = input.philosophyContext || input.philosophy_context;
  return ctx ? philosophyPolicy.buildPromotionPolicy({ philosophyContext: ctx }) : null;
}

function buildEthicalContext(input) {
  const src = input.ethicalComparison || input.ethical_comparison;
  if (!src) return null;
  return { ...src, promotion: ethicalComparisonPolicy.buildPromotionPolicy(src) };
}

function assembleContract(ctx) {
  const { selection, problemProfile, selected, highRisk, philosophy, epistemicContext, ethicalComparison } = ctx;
  const promotion = buildPromotion({ problemProfile, highRisk, philosophy, epistemicContext, ethicalComparison, portfolio: selection.portfolio });
  return {
    schema: CONTRACT_SCHEMA,
    mission: problemProfile.problem || 'Autonomous task execution',
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
    strategy_portfolio: mapPortfolio(selection.portfolio, selection.decisions),
    strategy_decision_summary: selection.summary,
    strategy_registry: {
      total: selection.decisions.length,
      selection_complete: selection.decisions.length === listStrategies().length,
      registry_hash: registryHealth().registryHash,
      endpoint: '/api/strategies'
    },
    strategy_decisions: mapDecisions(selection.decisions),
    selection_policy: selection.options,
    philosophical_context: philosophy,
    epistemic_context: epistemicContext.analyses.length ? epistemicContext : null,
    ethical_comparison: ethicalComparison,
    execution_pipeline: ['memory_retrieval', 'snapshot', 'isolated_forks', 'instrumented_run', 'adaptive_evaluation', 'diff_and_replay', 'audit', 'conditional_promotion'],
    branches: selection.branches.map((h, i) => ({
      label: `branch_${i + 1}`,
      hypothesis: h,
      budget_share: Number((1 / selection.branches.length).toFixed(3)),
      isolation: 'agent_world_capsule'
    })),
    stop_conditions: ['hard_invariant_failure', 'circuit_breaker_open', 'dominated_after_minimum_evidence', 'budget_exhausted'],
    promotion,
    philosophy,
    observability: ['events', 'cost_usd', 'tokens', 'latency_ms', 'tool_receipts', 'lineage', 'diff']
  };
}

function buildPromotion(ctx) {
  const { problemProfile, highRisk, philosophy, epistemicContext, ethicalComparison, portfolio } = ctx;
  return {
    require_replay: problemProfile.requires_reproducibility || highRisk,
    require_independent_verification: true,
    require_epistemic_assurance: false,
    epistemic_verifier_digests: [],
    require_human_approval: highRisk || problemProfile.reversibility === 'low' || portfolioHasUnimplemented(portfolio) || Boolean(philosophy?.requireHumanApproval),
    philosophy_hold: Boolean(philosophy?.holdPromotion),
    epistemic_hold: Boolean(epistemicContext.promotion.holdPromotion),
    require_epistemic_verification: Boolean(epistemicContext.promotion.requireIndependentVerification),
    require_epistemic_provenance: Boolean(epistemicContext.promotion.requireProvenance),
    ethical_comparison_hold: Boolean(ethicalComparison?.promotion?.holdPromotion),
    require_ethical_review: Boolean(ethicalComparison?.promotion?.requireEthicalReview),
    require_ethical_provenance: Boolean(ethicalComparison),
    preserve_rejected_branches: true,
    merge_workspace_automatically: false
  };
}

function mapPortfolio(portfolio, decisions) {
  return portfolio.map((s) => ({
    id: s.id, name: s.name, family: s.family, role: s.role,
    maturity: s.maturity, primitives: s.primitives,
    score: decisionScore(decisions, s.id)
  }));
}

function mapDecisions(decisions) {
  return decisions.map((d) => ({
    id: d.strategy.id, name: d.strategy.name, family: d.strategy.family,
    maturity: d.strategy.maturity, status: d.status,
    score: d.score, reason: d.reason
  }));
}

function validateContractSchema(contract) {
  if (!contract || contract.schema !== CONTRACT_SCHEMA) throw new Error(`Contract schema must be ${CONTRACT_SCHEMA}`);
  if (!contract.problem_profile || !contract.problem_profile.type) throw new Error('problem_profile.type is required');
  if (!contract.selected_strategy || !contract.selected_strategy.primary) throw new Error('selected_strategy.primary is required');
}

function validateContractFallback(contract) {
  const fb = contract.selected_strategy.fallback;
  if (fb && (!fb.requested || !fb.selected || !fb.reason)) throw new Error('selected_strategy.fallback must include requested, selected, and reason');
}

function validateContractRegistry(contract) {
  const registryIds = new Set(listStrategies().map((s) => s.id));
  const registry = contract.strategy_registry;
  if (registry?.registry_hash && registry.registry_hash !== registryHealth().registryHash) {
    throw Object.assign(new Error('Strategy registry changed since this contract was selected.'), { code: 'STRATEGY_REGISTRY_CHANGED' });
  }
  if (!registryIds.has(contract.selected_strategy.primary)) throw new Error(`Unknown primary strategy '${contract.selected_strategy.primary}'`);
  return registryIds;
}

function validateContractPortfolio(contract, registryIds) {
  if (!Array.isArray(contract.strategy_portfolio)) throw new Error('strategy_portfolio must be an array');
  const portfolioIds = new Set(contract.strategy_portfolio.map((s) => s.id));
  for (const id of portfolioIds) {
    if (!registryIds.has(id)) throw new Error(`Unknown portfolio strategy '${id}'`);
    const def = listStrategies().find((s) => s.id === id);
    const missing = def.primitives.filter((p) => !getStrategyHandlers()[p]);
    if (missing.length) throw new Error(`Strategy '${id}' has unimplemented primitives: ${missing.join(', ')}`);
  }
  if (!portfolioIds.has(contract.selected_strategy.primary)) throw new Error('Primary strategy must be present in strategy_portfolio');
}

function validateDecisionSet(decisions, registryIds) {
  const ids = new Set(decisions.map((d) => d.id));
  if (ids.size !== registryIds.size || [...registryIds].some((id) => !ids.has(id))) {
    throw new Error(`strategy_decisions must contain the complete ${registryIds.size}-strategy registry`);
  }
}

function isFiniteScore(score) {
  if (typeof score !== 'number' && typeof score !== 'string') return false;
  if (String(score).trim() === '') return false;
  return Number.isFinite(Number(score));
}

function validatePrimaryDecision(decisions, primaryId) {
  const pd = decisions.find((d) => d.id === primaryId);
  if (!pd || pd.status !== 'selected') throw new Error('selected_strategy.primary must have a selected strategy_decisions entry.');
  if (!isFiniteScore(pd.score)) throw new Error('selected primary strategy must have a finite score.');
}

function validateDecisionMaturity(decisions) {
  for (const d of decisions) {
    const cur = listStrategies().find((s) => s.id === d.id);
    if (cur && d.maturity !== cur.maturity) throw new Error(`Strategy maturity mismatch for '${d.id}'.`);
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
  const total = contract.branches.reduce((s, b) => s + Number(b.budget_share || 0), 0);
  if (!Number.isFinite(total) || Math.abs(total - 1) > 0.01) throw new Error('branch budget_share values must total approximately 1');
  if (contract.branches.some((b) => !b.label || !b.hypothesis)) throw new Error('every branch requires a label and hypothesis');
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
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((k) => [k, stableValue(value[k])]));
  return value;
}

function digestContract(contract, canonical = true) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(canonical ? stableValue(contract) : contract)).digest('hex')}`;
}

function hashContract(contract) { return digestContract(contract, true); }

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
      const c = JSON.parse(row.contract_json);
      const canonicalHash = digestContract(c, true);
      const legacyHash = digestContract(c, false);
      if (row.contract_hash !== canonicalHash && row.contract_hash !== legacyHash) {
        throw Object.assign(new Error(`Strategy contract '${row.id}' failed integrity verification.`), { code: 'STRATEGY_CONTRACT_CORRUPTED' });
      }
      return c;
    })()
  };
}

function nextVersion(previous) {
  return !previous || !previous.version ? 1 : previous.version + 1;
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
    const err = new Error(`Agent '${context.agentId}' does not belong to workspace '${context.workspaceId}'.`);
    err.code = 'AGENT_WORKSPACE_MISMATCH';
    throw err;
  }
  if (agent.execution_mode === 'worker') {
    const err = new Error(`Worker '${context.agentId}' cannot select a strategy contract; its orchestrator owns strategy selection.`);
    err.code = 'WORKER_REQUIRES_ORCHESTRATOR';
    throw err;
  }
  return persistStrategyContract(db, context);
}

async function getLatestContract(db, agentId, workspaceId = null) {
  let row = null;
  if (workspaceId) row = await db.get('SELECT * FROM strategy_contracts WHERE agent_id = ? AND workspace_id = ? ORDER BY version DESC LIMIT 1', agentId, workspaceId);
  if (!row) row = await db.get('SELECT * FROM strategy_contracts WHERE agent_id = ? ORDER BY version DESC LIMIT 1', agentId);
  return parseRow(row);
}

async function listContracts(db, agentId, workspaceId = null) {
  const rows = await db.all(
    workspaceId ? 'SELECT * FROM strategy_contracts WHERE agent_id = ? AND workspace_id = ? ORDER BY version DESC'
      : 'SELECT * FROM strategy_contracts WHERE agent_id = ? ORDER BY version DESC',
    ...(workspaceId ? [agentId, workspaceId] : [agentId])
  );
  return rows.map(parseRow);
}

async function getContractById(db, id) {
  return parseRow(await db.get('SELECT * FROM strategy_contracts WHERE id = ?', id));
}

module.exports = { CONTRACT_SCHEMA, buildStrategyContract, validateContract, hashContract, saveContract, getLatestContract, getContractById, listContracts };
