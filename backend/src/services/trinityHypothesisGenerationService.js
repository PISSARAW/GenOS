'use strict';

const modelRouter = require('./modelRouter');
const trinityService = require('./trinityService');
const compiler = require('./cognitiveResidualCompiler');
const receipts = require('./cognitiveInferenceReceiptService');

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

function parseCandidates(text) {
  const normalized = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(normalized);
  const items = Array.isArray(parsed) ? parsed : parsed.candidateHypotheses;
  if (!Array.isArray(items)) throw new Error('Hypothesis model returned no candidateHypotheses array.');
  return items.slice(0, 6).map(normalizeGeneratedCandidate).filter(Boolean);
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
  const compiled = compiler.compileHypotheses({ mission, supplied: input.supplied, agentId, budget });
  if (compiled.status !== 'ready') return { candidates: [], status: 'blocked', reason: compiled.reason };
  const receipt = await receipts.reserve(db, compiled);
  if (!receipt.owned) {
    if (receipt.status === 'completed') return { ...receipt.result, reused: true };
    return { candidates: [], status: 'unavailable', reason: `receipt_${receipt.status}` };
  }
  try {
    const response = await modelRouter.generate({
      db, agentId, organizationId: input.tenant?.organizationId, projectId: input.tenant?.projectId,
      prompt: compiled.prompt, cognitiveDomain: 'trinity',
      cognitiveObjects: { mission, candidateHypotheses: input.supplied.candidateHypotheses || [], experiment: input.supplied },
      maxTokens: 1200, maxCostUsd: budget, timeoutMs: 30000, priority: 'interactive'
    });
    const result = {
      candidates: parseCandidates(response.text), status: 'generated', verification: 'unverified',
      model: response.model || null, provider: response.provider || null,
      promptDigest: compiled.visibility.promptDigest, invocationId: receipt.invocationId
    };
    await receipts.complete(db, receipt.invocationId, result);
    return result;
  } catch (error) {
    await receipts.fail(db, receipt.invocationId);
    throw error;
  }
}

async function design(input) {
  const mission = input.normalizedMission.prompt || input.normalizedMission.currentTask || '';
  const supplied = await suppliedDesign(input);
  const base = trinityService.designHypotheses(mission, supplied);
  if (!generationRequested(supplied, base)) return base;
  try {
    const result = await generate({ ...input, mission, supplied });
    if (result.status !== 'generated') return { ...base, hypothesisGeneration: result };
    const combined = [...(supplied.candidateHypotheses || []), ...result.candidates];
    const generatedDesign = trinityService.designHypotheses(mission, { ...supplied, candidateHypotheses: combined });
    const used = generatedDesign.selectedTriplet.some((candidate) => candidate.origin === 'model_generated');
    return { ...generatedDesign, hypothesisGeneration: {
      status: used ? 'generated' : 'unused', verification: result.verification,
      model: result.model, provider: result.provider, candidateCount: result.candidates.length,
      promptDigest: result.promptDigest, invocationId: result.invocationId, reused: result.reused === true
    } };
  } catch (error) {
    return { ...base, hypothesisGeneration: { status: 'unavailable', reason: error.code || error.message } };
  }
}

module.exports = { design };

async function suppliedDesign(input) {
  const supplied = { ...(input.normalizedMission.trinityHypothesisDesign || {}),
    integrationChecks: input.normalizedMission.trinityIntegrationChecks,
    claimVerificationChecks: input.normalizedMission.trinityClaimVerificationChecks };
  const meristem = input.normalizedMission.epistemicMeristem;
  if (meristem) {
    const selected = await require('./morphogenesis/capabilities/trinityMeristemBridge').rankHypotheses(input.db, {
      ...meristem, candidateHypotheses: supplied.candidateHypotheses || []
    });
    supplied.candidateHypotheses = selected.candidateHypotheses;
  }
  return supplied;
}
