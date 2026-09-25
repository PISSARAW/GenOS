'use strict';

const { validateMorphologyPatch } = require('./morphologyPatch');
const { adaptTopologyTransition } = require('../adapters/topologyAdapterService');

const TRANSITION_STAGES = Object.freeze([
  'PLAN', 'VALIDATE', 'SNAPSHOT', 'BRANCH', 'EXPERIMENT', 'COMPARE',
  'PROMOTION_GATE', 'APPLY_PATCH', 'VERIFY', 'COMMIT'
]);

function validateAdapters(adapters) {
  const required = ['snapshot', 'branch', 'experiment', 'compare', 'promotionGate', 'applyPatch', 'verify', 'commit', 'restore'];
  return required.filter((name) => typeof adapters[name] !== 'function').map((name) => `transition adapter is required: ${name}`);
}

function planErrors(patch, graph) {
  const errors = validateMorphologyPatch(patch).errors;
  if (!graph || !Number.isInteger(graph.version)) return errors.concat('current graph version is required');
  if (graph.version !== patch.baseGraphVersion) errors.push('patch base graph version is stale');
  return errors;
}

function graphTopology(graph) {
  if (!graph) return null;
  if (graph.topology) return graph.topology;
  const root = (graph.nodes || []).find((node) => node.nodeId === graph.rootNodeId);
  return root?.topology || null;
}

function topologyHandoff(context) {
  const fromTopology = graphTopology(context.graph);
  const toTopology = context.patch.targetTopology || graphTopology(context.patch.graph);
  if (!fromTopology || !toTopology || fromTopology === toTopology) return { supported: true, adapted: false };
  return adaptTopologyTransition({
    fromTopology,
    toTopology,
    payload: context.patch.topologyTransitionPayload || context.topologyTransitionPayload || {}
  });
}

async function restoreSnapshot(snapshot, adapters, cause) {
  const domains = ['graph', 'workers', 'leases', 'state', 'budgets'];
  return adapters.restore(snapshot, { domains, cause });
}

async function executeStages(context, adapters) {
  const { patch } = context;
  const snapshot = await adapters.snapshot(context);
  let branch;
  try {
    branch = await adapters.branch(snapshot, patch);
    const experiment = await adapters.experiment(branch, patch);
    const comparison = await adapters.compare(experiment, context);
    const gate = await adapters.promotionGate(comparison, patch);
    if (!gate || gate.passed !== true) throw new Error('morphology promotion gate rejected the patch');
    const applied = await adapters.applyPatch(branch, patch);
    const verification = await adapters.verify(applied, patch);
    if (!verification || verification.valid !== true) throw new Error('morphology patch verification failed');
    const commit = await adapters.commit(applied, patch, verification);
    return { committed: true, snapshot, branch, experiment, comparison, gate, applied, verification, commit };
  } catch (error) {
    await restoreSnapshot(snapshot, adapters, error);
    return { committed: false, snapshot, branch: branch || null, error: error.message, rolledBack: true };
  }
}

async function transitionMorphology(context, adapters) {
  const adapterErrors = validateAdapters(adapters || {});
  if (adapterErrors.length) return { committed: false, errors: adapterErrors };
  const errors = planErrors(context.patch, context.graph);
  if (errors.length) return { committed: false, errors };
  const handoff = topologyHandoff(context);
  if (!handoff.supported) return { committed: false, errors: [`topology transition rejected: ${handoff.reason}`] };
  const patch = { ...context.patch, topologyHandoff: handoff };
  return executeStages({ ...context, patch }, adapters);
}

module.exports = { TRANSITION_STAGES, transitionMorphology };
