'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Policies = require('../../src/services/search/planningGapPolicies');
const { ActuatorModules } = require('../../src/services/search/actuatorModules');
const { NegativeSearchMemory } = require('../../src/services/search/negativeSearchMemoryService');
const { transitionStatement, taskSignature, ORACLE_EVIDENCE_PREFIX,
  COST_DOMINANCE_CONDITION, hasVerifiedDominanceTrail } = require('../../src/services/search/planningGapNegativeMemoryPolicy');
const { heldoutTasks, verify, BUDGET } = require('./test_natural_search_heldout');

const SEEDS = [7, 41, 43, 77, 101, 137, 202, 313];
const ORACLE_EVIDENCE_STRENGTH = 0.95;
const CERTIFICATE_CACHE = new Map();

function oracleKey(state) {
  return `${state.x},${state.y}|${[...state.keys].sort().join(',')}`;
}

function oracleMoves(task, state) {
  const out = [];
  for (const [dx, dy, direction] of [[1, 0, 'E'], [-1, 0, 'W'], [0, 1, 'S'], [0, -1, 'N']]) {
    const x = state.x + dx;
    const y = state.y + dy;
    const cell = `${x},${y}`;
    const gateKey = task.doors.get(cell);
    if (!inside(task, x, y) || task.walls.has(cell) || (gateKey && !state.keys.has(gateKey))) continue;
    out.push({ action: `go ${direction}`, state: { x, y, keys: new Set(state.keys) } });
  }
  const key = task.keysOn.get(`${state.x},${state.y}`);
  if (key && !state.keys.has(key)) out.push({ action: `pick ${key}`,
    state: { x: state.x, y: state.y, keys: new Set([...state.keys, key]) } });
  return out;
}

function inside(task, x, y) {
  return x >= 0 && y >= 0 && x < task.w && y < task.h;
}

function oracleDistanceToGoal(task, start) {
  const queue = [{ ...start, distance: 0 }];
  const visited = new Set([oracleKey(start)]);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current.x === task.goal.x && current.y === task.goal.y) return current.distance;
    for (const move of oracleMoves(task, current)) {
      const key = oracleKey(move.state);
      if (visited.has(key)) continue;
      visited.add(key);
      const distance = current.distance + 1;
      queue.push({ ...move.state, distance });
    }
  }
  return Infinity;
}

function allReachable(task) {
  const start = { ...task.start, keys: new Set() };
  const queue = [start];
  const states = new Map([[oracleKey(start), start]]);
  for (let index = 0; index < queue.length; index += 1) {
    for (const move of oracleMoves(task, queue[index])) {
      const key = oracleKey(move.state);
      if (states.has(key)) continue;
      states.set(key, move.state);
      queue.push(move.state);
    }
  }
  return [...states.values()];
}

function dominatedActions(task, state) {
  const moves = oracleMoves(task, state);
  const costs = moves.map(move => ({ ...move, cost: 1 + oracleDistanceToGoal(task, move.state) }));
  const bestCost = Math.min(...costs.map(item => item.cost));
  return costs.filter(item => item.cost > bestCost).map(item => ({
    action: item.action, bestCost, candidateCost: item.cost,
    stateKey: oracleKey(state), state,
  }));
}

function certificateId(taskId, statement) {
  return `oracle-${taskId}-${crypto.createHash('sha256').update(statement).digest('hex').slice(0, 20)}`;
}

function seedVerifiedTrails(task, seed) {
  const modules = new ActuatorModules({ emit: () => {} });
  const memory = modules.negativeMemory;
  assert.ok(memory instanceof NegativeSearchMemory, 'phase 10 module owns solver memory');
  const agentId = `heldout-${seed}-${task.id}`;
  const certificates = new Map();
  for (const candidate of verifiedCandidates(task)) {
    recordCertificate({ candidate, task, modules, agentId, certificates });
  }
  verifyCertificates({ task, memory, agentId, certificates });
  return { memory, agentId, certifiedTrails: certificates.size };
}

function verifiedCandidates(task) {
  if (CERTIFICATE_CACHE.has(task.id)) return CERTIFICATE_CACHE.get(task.id);
  const candidates = allReachable(task).flatMap(state => dominatedActions(task, state));
  verifyDominanceCandidates(task, candidates);
  CERTIFICATE_CACHE.set(task.id, candidates);
  return candidates;
}

function verifyDominanceCandidates(task, candidates) {
  for (const candidate of candidates) {
    const moves = oracleMoves(task, candidate.state);
    const costs = moves.map(move => 1 + oracleDistanceToGoal(task, move.state));
    const selected = moves.findIndex(move => move.action === candidate.action);
    assert.ok(costs[selected] > Math.min(...costs), 'cost-dominance certificate must be strict');
    assert.equal(costs[selected], candidate.candidateCost);
    assert.equal(Math.min(...costs), candidate.bestCost);
  }
}

function recordCertificate(spec) {
  const { candidate, task, modules, agentId, certificates } = spec;
  const statement = transitionStatement({ taskId: task.id, stateKey: candidate.stateKey,
    action: candidate.action });
  const id = certificateId(task.id, statement);
  const trail = modules.recordNegativeOutcome(agentId, { id, statement }, { ref: `${ORACLE_EVIDENCE_PREFIX}${id}`,
    strength: ORACLE_EVIDENCE_STRENGTH, reliability: ORACLE_EVIDENCE_STRENGTH },
  { signature: taskSignature(task.id), conditions: [COST_DOMINANCE_CONDITION], scope: 'task' });
  certificates.set(statement, { candidate, trailId: trail.id });
}

function verifyCertificates(spec) {
  const active = spec.memory.getActiveTrails(spec.agentId);
  assert.equal(active.length, spec.certificates.size);
  for (const [statement, record] of spec.certificates) {
    const { candidate, trailId } = record;
    assert.equal(statement, transitionStatement({ taskId: spec.task.id,
      stateKey: candidate.stateKey, action: candidate.action }));
    assert.ok(active.some(trail => trail.id === trailId && trail.statement === statement),
      'phase 10 entrypoint must create every injected trail');
  }
}

function runSolverArm(spec) {
  return Policies.genosPolicy(spec.task, BUDGET, {
    agentTag: 'verified-negative', agentId: spec.agentId, negativeMemory: spec.memory,
    useVerifiedNegativeMemory: spec.enabled, seed: spec.seed,
  });
}

function scorePair(task, seed, source) {
  const full = runSolverArm({ task, seed, enabled: true, ...source });
  const ablated = runSolverArm({ task, seed, enabled: false, ...source });
  assert.ok(full.expansions <= BUDGET && ablated.expansions <= BUDGET);
  assert.equal(full.valid, verify(task, full.plan), 'full arm independent action verifier');
  assert.equal(ablated.valid, verify(task, ablated.plan), 'ablated arm independent action verifier');
  assert.ok(full.prunedTransitions > 0, `${task.id}/${seed}: intervention must reach a decision`);
  return { taskId: task.id, seed, certifiedTrails: source.certifiedTrails,
    full: outcome(full), ablated: outcome(ablated),
    expansionDelta: full.expansions - ablated.expansions };
}

function outcome(result) {
  return { success: result.valid, expansions: result.expansions,
    planLength: result.plan.length, prunedTransitions: result.prunedTransitions };
}

function aggregate(pairs) {
  const count = pairs.length;
  return ['full', 'ablated'].map(arm => {
    const solved = pairs.filter(pair => pair[arm].success).length;
    const totalExpansions = pairs.reduce((sum, pair) => sum + pair[arm].expansions, 0);
    const optimalPlans = pairs.filter(pair => pair[arm].success && pair[arm].planLength === pair.oracleLength).length;
    return { arm, solved, trials: count, meanExpansions: Number((totalExpansions / count).toFixed(2)),
      oracleOptimal: optimalPlans };
  });
}

function addOracleLengths(pairs, tasks) {
  const lengths = new Map(tasks.map(task => [task.id,
    oracleDistanceToGoal(task, { ...task.start, keys: new Set() })]));
  for (const pair of pairs) pair.oracleLength = lengths.get(pair.taskId);
}

function persistResults(result) {
  const artifactDir = path.join(__dirname, '..', 'artifacts');
  fs.mkdirSync(artifactDir, { recursive: true });
  const artifactPath = path.join(artifactDir, 'natural-search-phase10-actuator-ablation.json');
  fs.writeFileSync(artifactPath, `${JSON.stringify(result, null, 2)}\n`);
  return artifactPath;
}

function runCampaign() {
  verifyPolicyMappingContract();
  const tasks = heldoutTasks();
  const pairs = [];
  for (const seed of SEEDS) {
    for (const task of tasks) pairs.push(scorePair(task, seed, seedVerifiedTrails(task, seed)));
  }
  addOracleLengths(pairs, tasks);
  const result = { contract: 'planning-gap-transition/v1; exact task/state/action match; oracle cost-dominated only',
    trailSource: 'ActuatorModules.recordNegativeOutcome -> NegativeSearchMemory.recordFailure',
    exploratoryArtifact: 'natural-search-verified-negative-ablation.json (created before phase-entrypoint provenance check)',
    corpus: '8 held-out synthetic keyed mazes', budget: BUDGET, seeds: SEEDS,
    pairedTrials: pairs.length, verifier: 'independent action replay + independent BFS optimal-cost oracle',
    summary: aggregate(pairs), pairs };
  const artifactPath = persistResults(result);
  console.log(JSON.stringify({ artifactPath, summary: result.summary,
    meanExpansionDelta: Number((pairs.reduce((sum, pair) => sum + pair.expansionDelta, 0) / pairs.length).toFixed(2)),
    prunedTransitions: pairs.reduce((sum, pair) => sum + pair.full.prunedTransitions, 0),
    pairs: pairs.length, budget: BUDGET }, null, 2));
  return result;
}

function verifyPolicyMappingContract() {
  const memory = new NegativeSearchMemory();
  const input = { taskId: 'contract-task', stateKey: '2,1|k', action: 'go W' };
  const agentId = 'contract-agent';
  const statement = transitionStatement(input);
  memory.recordFailure(agentId, { id: 'contract-trail', statement },
    { ref: `${ORACLE_EVIDENCE_PREFIX}contract`, strength: 0.95, reliability: 0.95 },
    { signature: taskSignature(input.taskId), conditions: [COST_DOMINANCE_CONDITION], scope: 'task' });
  assert.equal(hasVerifiedDominanceTrail({ memory, agentId, ...input }), true);
  assert.equal(hasVerifiedDominanceTrail({ memory, agentId, ...input, action: 'go E' }), false);
  assert.equal(hasVerifiedDominanceTrail({ memory, agentId, ...input, taskId: 'other-task' }), false);
}

if (require.main === module) {
  try { runCampaign(); }
  catch (error) { console.error(error); process.exitCode = 1; }
}

module.exports = { runCampaign, oracleMoves, oracleDistanceToGoal, seedVerifiedTrails };
