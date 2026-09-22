'use strict';

// Procedural runner/evaluator/environment/snapshot registry.
// Replaces the previous design where functions were passed directly in primitive
// payloads (not transportable by MCP/agents that only send JSON) with an ID-based
// resolution model. Callers send runnerId / evaluatorId / environmentId / snapshotId
// and the runtime resolves the actual function or value from the registry.

const runners = new Map();
const evaluators = new Map();
const environments = new Map();
const snapshots = new Map();

function registerRunner(id, runner) {
  if (typeof runner !== 'function') {
    throw new Error(`procedural registry: runner '${id}' must be a function`);
  }
  runners.set(id, runner);
  return { registered: true, id };
}

function resolveRunner(id) {
  const r = runners.get(id);
  if (!r) throw new Error(`procedural registry: no runner registered for id '${id}'`);
  return r;
}

function unregisterRunner(id) {
  return runners.delete(id);
}

function registerEvaluator(id, evaluator) {
  // evaluator is a function that computes metrics from a variant:
  //   metrics = evaluator(variant)   → { success, robustness, evidence, ... }
  if (typeof evaluator !== 'function') {
    throw new Error(`procedural registry: evaluator '${id}' must be a function`);
  }
  evaluators.set(id, evaluator);
  return { registered: true, id };
}

function resolveEvaluator(id) {
  const e = evaluators.get(id);
  if (!e) throw new Error(`procedural registry: no evaluator registered for id '${id}'`);
  return e;
}

function unregisterEvaluator(id) {
  return evaluators.delete(id);
}

function registerEnvironment(id, environmentSpec) {
  environments.set(id, environmentSpec);
  return { registered: true, id };
}

function resolveEnvironment(id) {
  const e = environments.get(id);
  if (!e) throw new Error(`procedural registry: no environment registered for id '${id}'`);
  return e;
}

function unregisterEnvironment(id) {
  return environments.delete(id);
}

function registerSnapshot(id, snapshot) {
  snapshots.set(id, snapshot);
  return { registered: true, id };
}

function resolveSnapshot(id) {
  const s = snapshots.get(id);
  if (!s) throw new Error(`procedural registry: no snapshot registered for id '${id}'`);
  return s;
}

function unregisterSnapshot(id) {
  return snapshots.delete(id);
}

// Pre-populate with known defaults useful for testing and demo.
function seedDefaults() {
  // deterministic fake runner for tests: walks a graph until terminal or dead-end.
  registerRunner('test-deterministic', (organism, initialState) => {
    void initialState;
    const nodes = organism.structure.nodes;
    const synapses = organism.structure.synapses;
    const turns = [];
    let current = nodes[0];
    let steps = 0;
    while (current && steps < 10) {
      turns.push({ node: current.id, type: current.type });
      if (current.type === 'terminal') return { turns, outcome: 'success' };
      const outgoing = synapses.filter((s) => s.from === current.id);
      if (!outgoing.length) return { turns, outcome: 'failure' };
      const usable = outgoing.find((s) => (s.weight == null ? 0.5 : Number(s.weight)) > 0.2);
      if (!usable) return { turns, outcome: 'failure' };
      current = nodes.find((n) => n.id === usable.to);
      steps++;
    }
    return { turns, outcome: 'failure' };
  });

  // trivial evaluator returning fixed metrics — useful for baselines.
  registerEvaluator('test-fixed', (variant) => ({
    success: 0.9,
    robustness: 0.8,
    evidence: 0.9,
    generalization: 0.6,
    cost: 0.2,
    risk: 0.05,
    complexity: 0.3,
  }));
}

function listRunners() {
  return Array.from(runners.entries()).map(([id]) => ({ id }));
}

function listEvaluators() {
  return Array.from(evaluators.entries()).map(([id]) => ({ id }));
}

function listEnvironments() {
  return Array.from(environments.entries()).map(([id]) => ({ id }));
}

function listSnapshots() {
  return Array.from(snapshots.entries()).map(([id]) => ({ id }));
}

// Auto-seed defaults so existing tests keep working without explicit registration.
seedDefaults();

module.exports = {
  registerRunner,
  resolveRunner,
  unregisterRunner,
  registerEvaluator,
  resolveEvaluator,
  unregisterEvaluator,
  registerEnvironment,
  resolveEnvironment,
  unregisterEnvironment,
  registerSnapshot,
  resolveSnapshot,
  unregisterSnapshot,
  listRunners,
  listEvaluators,
  listEnvironments,
  listSnapshots,
  seedDefaults,
};
