'use strict';

const MAX_ARENA_CANDIDATES = 3;
const REQUIRED_METRICS = Object.freeze(['progress', 'quality', 'evidence', 'cost', 'coordination']);

function adapterErrors(adapters) {
  const errors = [];
  if (!adapters.snapshotWorld || !adapters.forkWorld || !adapters.executeExperiment) errors.push('snapshot, fork and execution adapters are required');
  if (!adapters.compare || !adapters.promotionGate || !adapters.promote) errors.push('comparison and promotion gates are required');
  return errors;
}

function candidateErrors(input) {
  if (!Array.isArray(input.candidates) || input.candidates.length < 2) return ['arena requires baseline F0 and at least one candidate'];
  return input.candidates.length > MAX_ARENA_CANDIDATES ? ['arena candidate limit exceeded'] : [];
}

function validateArena(input, adapters = {}) {
  const protocolErrors = !input.protocol || !input.protocol.testId ? ['all worlds must share a named test protocol'] : [];
  const budgetErrors = validBudget(input.budget) ? [] : ['arena requires positive token, worker and time limits'];
  return [...adapterErrors(adapters), ...candidateErrors(input), ...protocolErrors, ...budgetErrors];
}

function validBudget(budget) {
  return Boolean(budget && Number.isSafeInteger(budget.maxTokens) && budget.maxTokens > 0
    && Number.isSafeInteger(budget.maxWorkers) && budget.maxWorkers > 0
    && Number.isSafeInteger(budget.maxTimeMs) && budget.maxTimeMs > 0);
}

function validateMetrics(metrics) {
  return REQUIRED_METRICS.filter((name) => !Number.isFinite(metrics && metrics[name]));
}

async function runWorld(context) {
  const { candidate, snapshot, input, adapters } = context;
  let world = null;
  try {
    world = await adapters.forkWorld(snapshot, JSON.parse(JSON.stringify(candidate)));
    const result = await adapters.executeExperiment(world, {
      protocol: Object.freeze({ ...input.protocol }),
      budget: Object.freeze({ ...input.budget }),
      candidate
    });
    const missing = validateMetrics(result && result.metrics);
    return { candidateId: candidate.id, world, result, valid: missing.length === 0, errors: missing };
  } catch (error) {
    return { candidateId: candidate.id, world, valid: false, errors: [error.message] };
  }
}

function baselineId(candidates) {
  return candidates[0] && candidates[0].id === 'F0' ? null : 'first candidate must be the F0 baseline';
}

async function runWorlds(input, adapters, snapshot) {
  const worlds = [];
  for (const candidate of input.candidates) {
    worlds.push(await runWorld({ candidate, snapshot, input, adapters }));
  }
  return worlds;
}

function shouldPromote(gate, comparison) {
  return Boolean(gate && gate.passed === true && comparison.winner);
}

async function executeArena(input, adapters) {
  const worlds = [];
  let snapshot;
  try {
    snapshot = await adapters.snapshotWorld(input.workspace, input.reason || 'morphology_arena');
    worlds.push(...await runWorlds(input, adapters, snapshot));
    const comparison = await adapters.compare(worlds, input.baselineMetrics || null);
    const gate = await adapters.promotionGate(comparison, worlds);
    if (!shouldPromote(gate, comparison)) {
      return { executed: true, promoted: false, snapshot, worlds, comparison, gate };
    }
    const receipt = { snapshotId: snapshot.id || null, testId: input.protocol.testId, winnerId: comparison.winner.candidateId, budget: input.budget };
    const promotion = await adapters.promote(comparison.winner, receipt);
    return { executed: true, promoted: Boolean(promotion && promotion.promoted), snapshot, worlds, comparison, gate, receipt, promotion };
  } catch (error) {
    return { executed: Boolean(snapshot), promoted: false, snapshot: snapshot || null, worlds, errors: [error.message] };
  } finally {
    await cleanupWorlds(worlds, adapters);
  }
}

async function runMorphologyArena(input, adapters) {
  const errors = validateArena(input, adapters);
  if (errors.length) return { executed: false, promoted: false, errors };
  const baselineError = baselineId(input.candidates);
  if (baselineError) return { executed: false, promoted: false, errors: [baselineError] };
  return executeArena(input, adapters);
}

async function cleanupWorlds(worlds, adapters) {
  if (typeof adapters.disposeWorld !== 'function') return;
  for (const item of worlds) await adapters.disposeWorld(item.world);
}

module.exports = { MAX_ARENA_CANDIDATES, REQUIRED_METRICS, runMorphologyArena };
