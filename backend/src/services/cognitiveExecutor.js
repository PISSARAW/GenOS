'use strict';

const SUPPORTED_EXECUTORS = new Set(['caller_mcp', 'codex', 'local', 'solar-direct']);
const modelRouter = require('./modelRouter');
const trinityDesign = require('./trinityHypothesisDesignService');

function normalizeExecutor(value) {
  const executor = String(value || '').trim().toLowerCase();
  if (executor === 'hermes' || executor === 'nous' || executor === 'nous-portal') return 'solar-direct';
  if (executor === 'antigravity') return 'caller_mcp';
  return executor || 'codex';
}

function resolveExecutor(mission = {}, environment = process.env) {
  const requested = normalizeExecutor(mission.executor || mission.runtime || environment.GENOS_AGENT_EXECUTOR);
  if (!SUPPORTED_EXECUTORS.has(requested)) {
    throw Object.assign(new Error(`Unsupported cognitive executor '${requested}'.`), { code: 'UNSUPPORTED_EXECUTOR' });
  }
  return requested;
}

function assertCallerMcpConfiguration(mission = {}, environment = process.env) {
  if (resolveExecutor(mission, environment) !== 'caller_mcp') return;
  if (!String(environment.GENOS_MCP_SAMPLING_URL || '').trim()) {
    throw Object.assign(new Error('caller_mcp requires an MCP sampling channel.'), { code: 'MCP_SAMPLING_UNAVAILABLE' });
  }
}

function defaultBudget(mission) {
  const explicit = Number(mission?.trinityHypothesisGenerationBudgetUsd);
  const missionBudget = Number(mission?.executionBudget?.costUsd);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Number.isFinite(missionBudget) && missionBudget > 0 ? Math.min(explicit, missionBudget) : explicit;
  }
  return Number.isFinite(missionBudget) && missionBudget > 0 ? Number((missionBudget * 0.1).toFixed(6)) : null;
}

function parseProposal(item, index) {
  const hypothesis = String(item?.hypothesis || item?.statement || '').trim();
  if (hypothesis.length < 12) return null;
  return {
    id: String(item.id || `proposal_${index + 1}`),
    origin: 'model_generated',
    hypothesis,
    sourceRefs: ['mission'],
    assumptions: Array.isArray(item.assumptions) ? item.assumptions : [],
    predictions: Array.isArray(item.predictions) ? item.predictions : [],
    falsificationCriteria: Array.isArray(item.falsificationCriteria) ? item.falsificationCriteria : [],
    experiment: item.experiment || null,
    verification: 'unverified'
  };
}

function parseProposals(text) {
  const normalized = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(normalized);
    const items = Array.isArray(parsed) ? parsed : parsed.candidateHypotheses;
    if (!Array.isArray(items)) return [];
    return items.map(parseProposal).filter(Boolean).slice(0, 6);
  } catch (_) {
    return [];
  }
}

function buildVerificationPlan(triplet) {
  if (!triplet) return null;
  const experiment = trinityDesign.buildDiscriminatingExperiment(triplet);
  if (!experiment) return null;
  return { experimentId: experiment.id, protocol: experiment.protocol, predictions: experiment.predictions, status: 'proposed' };
}

async function runModel(input, budget, prompt) {
  const tenant = input?.tenant || {};
  return modelRouter.generate({
    db: input?.db, agentId: input?.agentId, organizationId: tenant.organizationId,
    projectId: tenant.projectId, prompt, cognitiveDomain: 'cognitive_executor',
    cognitiveObjects: { mission: input?.mission || {}, candidateHypotheses: [] },
    maxTokens: 1200, maxCostUsd: budget, timeoutMs: 30000, priority: 'interactive'
  });
}

async function generateProposals(input) {
  const mission = input?.mission || {};
  const budget = defaultBudget(mission);
  if (!budget) return { proposals: [], status: 'skipped', reason: 'generation_budget_required', verification: 'unverified' };
  const prompt = `Generate concurrent hypotheses and verification plans for: ${mission.prompt || mission.mission || ''}`;
  let response;
  try {
    response = await runModel(input, budget, prompt);
  } catch (error) {
    return { proposals: [], status: 'unavailable', reason: error.code || error.message, verification: 'unverified' };
  }
  const candidates = parseProposals(response?.text);
  const normalized = trinityDesign.normalizeCandidates({ candidateHypotheses: candidates, sourceEvidence: ['mission'] });
  const proposals = normalized.map((item) => ({ ...item, verification: 'unverified' }));
  const triplet = trinityDesign.selectTriplet(proposals);
  const verificationPlan = buildVerificationPlan(triplet);
  return {
    proposals,
    selectedTriplet: triplet,
    verificationPlan,
    status: proposals.length ? 'generated' : 'empty',
    verification: 'unverified',
    model: response?.model || null,
    provider: response?.provider || null
  };
}

module.exports = { SUPPORTED_EXECUTORS, normalizeExecutor, resolveExecutor, assertCallerMcpConfiguration, generateProposals };
