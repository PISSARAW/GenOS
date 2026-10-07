'use strict';

const values = require('./trinityProvenanceValues');
const protocol = require('./pairedReplayProtocol');
const runtime = require('./pairedReplayRuntime');
const experiments = require('./proceduralCausalExperimentService');

function metadata(experiment) {
  return { protocolHash: experiment.replay_protocol_hash, causalGuarantee: false, runtimeAuthority: false };
}

async function currentDiff(db, row, input) {
  if (values.digest(JSON.parse(row.diff_json)) !== row.diff_hash) throw values.failure('CAUSAL_DIFF_INTEGRITY_INVALID');
  const observed = await require('./proceduralCausalReplayService').inspectDiff(db,
    { baselineForkId: row.baseline_fork_id, interventionForkId: row.intervention_fork_id, scope: input.scope });
  if (values.digest(observed) !== row.diff_hash) throw values.failure('CAUSAL_DIFF_CHANGED');
}

async function graph(db, { experiment, input }) {
  if (!protocol.enabled(experiment)) return;
  for (const ref of input.graph.evidenceRefs) {
    const [kind, id] = ref.split(':');
    if (kind === 'fork') await forkReference(db, { experiment, input, id });
    if (kind === 'diff') await diffReference(db, { experiment, input, id });
    if (kind === 'analysis') await analysisReference(db, { experiment, input, id });
  }
}

async function diffReference(db, { experiment, input, id }) {
  const row = await db.get('SELECT * FROM procedural_causal_diffs WHERE diff_id=? AND experiment_id=?', [id, experiment.experiment_id]);
  if (!row) throw values.failure('CAUSAL_DIFF_REFERENCE_MISSING');
  await currentDiff(db, row, input);
}

async function forkReference(db, { experiment, input, id }) {
  const fork = await experiments.loadFork(db, id);
  const context = runtime.binding(experiment, fork, input);
  const event = fork.events.filter(item => ['RUN_RESULT', 'CHECKPOINT'].includes(item.event_type)).at(-1);
  if (event) require('./pairedReplayRandomness').verify(event.payload.replayObservation, context);
}

async function analysisReference(db, { experiment, input, id }) {
  const row = await db.get('SELECT * FROM procedural_causal_analyses WHERE analysis_id=? AND experiment_id=?', [id, experiment.experiment_id]);
  if (!row || values.hashBytes(Buffer.from(row.payload_json)) !== row.analysis_hash) throw values.failure('CAUSAL_ANALYSIS_INTEGRITY_INVALID');
  const analysis = JSON.parse(row.payload_json);
  if (analysis.replayControls?.protocolHash !== experiment.replay_protocol_hash) throw values.failure('CAUSAL_ANALYSIS_CONTEXT_CHANGED');
  for (const ref of analysis.evidenceRefs) {
    if (!ref.startsWith('diff:')) throw values.failure('CAUSAL_ANALYSIS_CONTEXT_CHANGED');
    await diffReference(db, { experiment, input, id: ref.slice(5) });
  }
}

module.exports = { metadata, currentDiff, graph };
