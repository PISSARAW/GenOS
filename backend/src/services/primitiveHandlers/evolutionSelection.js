/**
 * Lot 3 : selection primitives (select, paretoSelect) — split of evolution.js.
 */
const telemetry = require('../telemetryObserver');
const { getDatabase } = require('../../db');
const { boundedPercentage } = require('./evolutionShared');

function normalizeSelectionCandidates(context) {
  return (context.candidates || []).map((candidate) => {
    const id = typeof candidate === 'string' ? candidate : candidate?.id;
    return { id, input: candidate };
  }).filter((candidate) => candidate.id);
}

async function loadSelectionRow(db, candidateId, workspaceId) {
  if (workspaceId) {
    return db.get('SELECT a.id, a.status, a.current_task, l.score AS lineage_score FROM agents a LEFT JOIN lineage_nodes l ON l.id = a.id WHERE a.id = ? AND a.workspace_id = ?', candidateId, workspaceId);
  }
  return db.get('SELECT a.id, a.status, a.current_task, l.score AS lineage_score FROM agents a LEFT JOIN lineage_nodes l ON l.id = a.id WHERE a.id = ?', candidateId);
}

function fitnessFromInput(input, lineageScore) {
  const inputFitness = Number(input?.fitnessScore ?? input?.score);
  if (Number.isFinite(inputFitness)) return boundedPercentage(inputFitness);
  return boundedPercentage(Number(lineageScore || 0) * 100);
}

function statusScoreFor(status) {
  if (status === 'completed') return 10;
  if (status === 'running') return 5;
  return 0;
}

async function scoreSelectionCandidate(db, candidate, workspaceId) {
  const row = await loadSelectionRow(db, candidate.id, workspaceId);
  if (!row) return null;
  const fitnessScore = fitnessFromInput(candidate.input, row.lineage_score);
  const evidenceScore = boundedPercentage(candidate.input?.evidenceScore);
  const score = statusScoreFor(row.status) + (fitnessScore * 0.7) + (evidenceScore * 0.3);
  return { id: candidate.id, status: row.status, fitnessScore, evidenceScore, score };
}

async function markSelectionOutcome(db, scored, winnerId) {
  for (const candidate of scored) {
    await db.run('UPDATE lineage_nodes SET metadata = json_set(COALESCE(metadata, \'{}\'), \'$.selectionStatus\', ?, \'$.selectionScore\', ?) WHERE id = ?',
      candidate.id === winnerId ? 'winner' : 'loser', candidate.score, candidate.id).catch(() => {});
  }
}

function selectionDetail(winner, count) {
  const winnerId = winner ? winner.id : 'none';
  return 'Selected winner ' + winnerId + ' from ' + count + ' candidates.';
}

async function select(context) {
  const db = await getDatabase();
  const candidates = normalizeSelectionCandidates(context);
  if (candidates.length === 0) {
    return { success: false, error: 'No candidates provided for selection.' };
  }
  const scored = [];
  for (const candidate of candidates) {
    const entry = await scoreSelectionCandidate(db, candidate, context.workspaceId);
    if (entry) scored.push(entry);
  }
  const uniqueScored = [...scored.reduce((byId, candidate) => {
    const previous = byId.get(candidate.id);
    if (!previous || candidate.score > previous.score) byId.set(candidate.id, candidate);
    return byId;
  }, new Map()).values()];
  uniqueScored.sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)));
  const winner = uniqueScored[0] || null;
  const losers = uniqueScored.slice(1).map(s => s.id);
  if (winner) {
    await markSelectionOutcome(db, uniqueScored, winner.id);
  }
  telemetry.emitEvent({
    eventType: 'EVOLUTION_SELECTION',
    agentId: context.orchestratorId || 'strategy_adapter',
    action: 'SELECT',
    detail: selectionDetail(winner, candidates.length),
    severity: 'info',
    payload: { winner, losers, scored: uniqueScored }
  });
  return { success: !!winner, winner, losers, scored: uniqueScored };
}

function directionForObjective(objective, directions) {
  const explicit = directions[objective];
  if (explicit !== undefined) {
    if (explicit !== 'min' && explicit !== 'max') throw new Error(`Direction for '${objective}' must be 'min' or 'max'.`);
    return explicit;
  }
  if (/cost|latency|time|token|risk|error/i.test(objective)) return 'min';
  return 'max';
}

function buildParetoPoint(candidate, index, objectives) {
  if (!candidate || typeof candidate !== 'object') return { error: `Candidate at index ${index} must be an object.` };
  const id = candidate.id || `candidate-${index}`;
  const scores = objectives.map((objective) => Number(candidate[objective]));
  if (scores.some((score) => !Number.isFinite(score))) {
    return { error: `Candidate '${id}' is missing a numeric Pareto score.` };
  }
  return { point: { id, key: `${id}#${index}`, scores } };
}

function dominates(other, point, spec) {
  if (other.key === point.key) return false;
  const { objectives, directions } = spec;
  const atLeastAsGood = other.scores.every((score, index) => directions[objectives[index]] === 'min' ? score <= point.scores[index] : score >= point.scores[index]);
  if (!atLeastAsGood) return false;
  return other.scores.some((score, index) => directions[objectives[index]] === 'min' ? score < point.scores[index] : score > point.scores[index]);
}

async function persistParetoStatuses(points, paretoFront) {
  const db = await getDatabase();
  for (const candidate of points) {
    const status = paretoFront.some((item) => item.key === candidate.key) ? 'front' : 'dominated';
    await db.run('UPDATE lineage_nodes SET metadata = json_set(COALESCE(metadata, \'{}\'), \'$.paretoStatus\', ?, \'$.paretoScores\', ?) WHERE id = ?',
      status, JSON.stringify(candidate.scores), candidate.id).catch(() => {});
  }
}

async function paretoSelect(context) {
  const candidates = context.candidates || [];
  const objectives = context.objectives || ['quality', 'cost'];
  const directions = context.directions || {};
  if (candidates.length === 0) {
    return { success: false, error: 'No candidates for Pareto selection.' };
  }
  const objectiveDirections = Object.fromEntries(objectives.map((objective) => [objective, directionForObjective(objective, directions)]));
  const points = [];
  for (const [index, candidate] of candidates.entries()) {
    const built = buildParetoPoint(candidate, index, objectives);
    if (built.error) return { success: false, error: built.error };
    points.push(built.point);
  }
  const spec = { objectives, directions: objectiveDirections };
  const paretoFront = points.filter((point) => !points.some((other) => dominates(other, point, spec)));
  const dominated = points.filter((point) => !paretoFront.some((front) => front.key === point.key));
  await persistParetoStatuses(points, paretoFront);
  telemetry.emitEvent({
    eventType: 'EVOLUTION_PARETO',
    agentId: context.orchestratorId || 'strategy_adapter',
    action: 'PARETO_SELECT',
    detail: 'Pareto front: ' + paretoFront.length + ' non-dominated / ' + points.length + ' total.',
    severity: 'info',
    payload: { paretoFront, dominated, objectives, directions: objectiveDirections }
  });
  return { success: paretoFront.length > 0, paretoFront, dominated, objectives, directions: objectiveDirections };
}

module.exports = {
  select,
  paretoSelect
};
