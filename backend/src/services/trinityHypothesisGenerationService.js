'use strict';

const modelRouter = require('./modelRouter');
const trinityService = require('./trinityService');

function generationRequested(supplied, baseDesign) {
  return supplied.generateHypotheses === true && baseDesign.selectionMethod === 'fixed_v1';
}

function generationBudget(mission) {
  const explicit = Number(mission.trinityHypothesisGenerationBudgetUsd);
  const missionBudget = Number(mission.executionBudget?.costUsd);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Number.isFinite(missionBudget) && missionBudget > 0 ? Math.min(explicit, missionBudget) : explicit;
  }
  return Number.isFinite(missionBudget) && missionBudget > 0 ? Number((missionBudget * 0.1).toFixed(6)) : null;
}

function promptFor(input) {
  return [
    'Propose up to six competing, falsifiable hypotheses for a sealed three-world software experiment.',
    'Return only JSON: {"candidateHypotheses":[{"id":"...","chamber":"direct|structured|falsification","hypothesis":"...","assumptions":[],"predictions":[],"falsificationCriteria":[],"experiment":{"protocol":"...","expectedOutcome":"..."}}]}.',
    'Do not state a hypothesis as an established fact. Use only these source references: mission. Do not invent external evidence IDs.',
    `Mission: ${input.mission}`,
    `Caller candidates to improve or complement: ${JSON.stringify(input.supplied.candidateHypotheses || [])}`,
    'The only allowed source reference is mission.'
  ].join('\n');
}

function parseCandidates(text) {
  const normalized = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(normalized);
  const items = Array.isArray(parsed) ? parsed : parsed.candidateHypotheses;
  if (!Array.isArray(items)) throw new Error('Hypothesis model returned no candidateHypotheses array.');
  return items.slice(0, 12).map(normalizeGeneratedCandidate).filter(Boolean);
}

function normalizeGeneratedCandidate(item, index) {
  const hypothesis = String(item?.hypothesis || item?.statement || '').trim();
  if (hypothesis.length < 12) return null;
  return {
    id: String(item.id || `generated_${index + 1}`),
    origin: 'model_generated',
    chamber: ['direct', 'structured', 'falsification'].includes(item.chamber) ? item.chamber : null,
    hypothesis, sourceRefs: ['mission'],
    assumptions: item.assumptions, predictions: item.predictions,
    falsificationCriteria: item.falsificationCriteria, experiment: item.experiment
  };
}

async function generate(input) {
  const { db, agentId, mission } = input;
  const budget = generationBudget(input.normalizedMission);
  if (!budget) return { candidates: [], status: 'skipped', reason: 'generation_budget_required' };
  const result = await modelRouter.generate({
    db, agentId, organizationId: input.tenant?.organizationId, projectId: input.tenant?.projectId,
    prompt: promptFor(input), maxTokens: 1200, maxCostUsd: budget, timeoutMs: 30000, priority: 'interactive'
  });
  return { candidates: parseCandidates(result.text), status: 'generated', model: result.model || null, provider: result.provider || null };
}

async function design(input) {
  const mission = input.normalizedMission.prompt || input.normalizedMission.currentTask || '';
  const supplied = { ...(input.normalizedMission.trinityHypothesisDesign || {}),
    integrationChecks: input.normalizedMission.trinityIntegrationChecks,
    claimVerificationChecks: input.normalizedMission.trinityClaimVerificationChecks };
  const base = trinityService.designHypotheses(mission, supplied);
  if (!generationRequested(supplied, base)) return base;
  try {
    const result = await generate({ ...input, mission, supplied });
    if (result.status !== 'generated') return { ...base, hypothesisGeneration: result };
    const combined = [...(supplied.candidateHypotheses || []), ...result.candidates];
    const generatedDesign = trinityService.designHypotheses(mission, { ...supplied, candidateHypotheses: combined });
    const used = generatedDesign.selectedTriplet.some((candidate) => candidate.origin === 'model_generated');
    return { ...generatedDesign, hypothesisGeneration: { status: used ? 'generated' : 'unused', model: result.model, provider: result.provider, candidateCount: result.candidates.length } };
  } catch (error) {
    return { ...base, hypothesisGeneration: { status: 'unavailable', reason: error.code || error.message } };
  }
}

module.exports = { design };
