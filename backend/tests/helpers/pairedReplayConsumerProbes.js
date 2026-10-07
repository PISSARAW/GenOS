'use strict';

const assert = require('node:assert/strict');
const fixture = require('../fixtures/pairedReplayRunner.cjs');
const handlers = require('../../src/services/primitiveHandlers/proceduralHandlers').HANDLERS;

function graphInput(ref) {
  return { experimentId: 'p1-addressed-replay', scope: fixture.scope,
    graph: { nodes: [{ id: 'intervention', kind: 'intervention', evidenceRefs: [ref] },
      { id: 'outcome', kind: 'outcome', evidenceRefs: [ref] }],
    edges: [{ source: 'intervention', target: 'outcome', status: 'observed', evidenceRefs: [ref] }], evidenceRefs: [ref] } };
}

async function qualify(db, groups) {
  const input = { db, experimentId: 'p1-addressed-replay', scope: fixture.scope, groups, analysisSeed: 7, bootstrapReplicates: 1000 };
  const analysis = await handlers.procedural_causal_analyze_snapshots(input);
  assert.ok(Math.abs(analysis.aggregateMeanDifference - 2) < 1e-12);
  assert.equal(analysis.replayControls.causalGuarantee, false);
  assert.equal(analysis.replayControls.runtimeAuthority, false);
  const graphRequest = { db, ...graphInput(`analysis:${analysis.analysisId}`) };
  const graph = await handlers.procedural_causal_graph(graphRequest);
  assert.equal(graph.replayControls.protocolHash, analysis.replayControls.protocolHash);
  assert.equal((await handlers.procedural_causal_graph(graphRequest)).graphId, graph.graphId);
  const foreign = { ...fixture.scope, organizationId: 'foreign' };
  await assert.rejects(handlers.procedural_causal_analyze_snapshots({ ...input, scope: foreign }), { code: 'CAUSAL_REPLAY_SCOPE_MISMATCH' });
  await assert.rejects(handlers.procedural_causal_graph({ ...graphRequest, scope: foreign }), { code: 'CAUSAL_REPLAY_SCOPE_MISMATCH' });
  console.log('Derived analysis and graph revalidate current paired evidence in a transaction and preserve no-authority limits.');
}

async function stale(db) {
  const row = await db.get("SELECT analysis_id FROM procedural_causal_analyses WHERE experiment_id='p1-addressed-replay'");
  await assert.rejects(handlers.procedural_causal_graph({ db, ...graphInput(`analysis:${row.analysis_id}`) }), { code: 'CAUSAL_RANDOMNESS_PROOF_INVALID' });
  const groups = await db.all("SELECT diff_id,snapshot_id FROM procedural_causal_diffs JOIN procedural_causal_forks ON baseline_fork_id=fork_id WHERE procedural_causal_diffs.experiment_id='p1-addressed-replay' ORDER BY snapshot_id,seed");
  const input = { db, experimentId: 'p1-addressed-replay', scope: fixture.scope,
    groups: [...new Set(groups.map(item => item.snapshot_id))].map(snapshotId => ({ snapshotId, diffIds: groups.filter(item => item.snapshot_id === snapshotId).map(item => item.diff_id) })),
    analysisSeed: 7, bootstrapReplicates: 1000 };
  await assert.rejects(handlers.procedural_causal_analyze_snapshots(input), { code: 'CAUSAL_RANDOMNESS_PROOF_INVALID' });
  console.log('Cached diffs and an old derived analysis cannot hide a new false random observation.');
}

module.exports = { qualify, stale };
