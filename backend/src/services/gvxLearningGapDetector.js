'use strict';

function validSkill(skillId) { return typeof skillId === 'string' && /^[a-z0-9][a-z0-9._-]{0,99}$/.test(skillId); }

function tally(records, weight, targetMap) {
  for (const record of records || []) {
    if (!validSkill(record.skillId) || !Number.isFinite(record.severity ?? record.relevance)) continue;
    const current = targetMap.get(record.skillId) || { skillId: record.skillId, signalCount: 0, score: 0, sources: [] };
    current.signalCount += 1;
    current.score += Math.max(0, Math.min(1, record.severity ?? record.relevance)) * weight;
    current.sources.push(record.sourceId || record.source || 'unspecified');
    targetMap.set(record.skillId, current);
  }
}

function candidates(input) {
  const map = new Map();
  tally(input.predictionErrors, 1, map);
  tally(input.failures, 0.8, map);
  tally(input.futureTasks, 0.4, map);
  for (const progress of input.learningProgress || []) {
    if (validSkill(progress.skillId) && Number.isFinite(progress.rate)) {
      const item = map.get(progress.skillId);
      if (item) item.score += Math.max(0, 0.5 - progress.rate) * 0.5;
    }
  }
  return [...map.values()].map((item) => {
    const node = input.graph.nodes.find((entry) => entry.skillId === item.skillId);
    return { ...item, epistemicStatus: node?.epistemicStatus || 'unknown',
      confidence: Math.min(0.95, item.signalCount / (item.signalCount + 2)),
      eligible: item.signalCount >= 2 && item.score >= Number(input.minScore ?? 0.5) };
  }).filter((item) => item.eligible).sort((left, right) => right.score - left.score || left.skillId.localeCompare(right.skillId));
}

function detect(options) {
  if (!options?.graph || !Array.isArray(options.graph.nodes)) throw new Error('competence-graph-required');
  const ranked = candidates({ ...options, predictionErrors: options.predictionErrors || [],
    failures: options.failures || [], futureTasks: options.futureTasks || [], learningProgress: options.learningProgress || [] });
  const maxGoals = Math.max(1, Math.min(20, Number(options.maxGoals) || 5));
  return { schema: 'genos.gvx.learning-gaps/v1', goals: ranked.slice(0, maxGoals).map((item) => ({
    skillId: item.skillId, priority: Number((item.score * item.confidence).toFixed(4)),
    evidence: { sources: [...new Set(item.sources)], signalCount: item.signalCount },
    epistemicStatus: item.epistemicStatus, status: 'proposed'
  })), candidates: ranked, generatedAt: new Date().toISOString() };
}

async function proposeBackgroundGoals(options) {
  if (options?.background !== true || !options.authority || typeof options.authority.isAllowed !== 'function') {
    throw Object.assign(new Error('bounded-background-authority-required'), { code: 'GVX_BACKGROUND_GOAL_DENIED' });
  }
  const detected = detect(options);
  const goals = [];
  for (const goal of detected.goals) {
    const allowed = await options.authority.isAllowed(goal.skillId, { maxCost: options.maxCost, maxSteps: 1 });
    if (allowed === true) goals.push({ ...goal, budget: { maxCost: options.maxCost, maxSteps: 1 }, execution: 'requires_external_dispatch' });
  }
  return { ...detected, goals, autonomousExecution: false };
}

module.exports = { detect, proposeBackgroundGoals, candidates };
