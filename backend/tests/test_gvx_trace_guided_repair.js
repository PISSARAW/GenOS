'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const repair = require('../src/services/gvxTraceGuidedRepair');
const registryService = require('../src/services/gvxVerifierRegistry');
const controlPlane = require('../src/services/gvxVerifierControlPlaneRegistry');
const attribution = require('../src/services/gvxTraceLocusAttribution');
const ledger = require('../src/services/gvxDevelopmentLedger');

const REQUIREMENTS = [attribution.ATTRIBUTION_REQUIREMENT, 'metric:quality', 'metric:latency'];
controlPlane.registerVerifierImplementation({ id: 'artifact', requirements: REQUIREMENTS,
  verify: async ({ artifact }) => ({ verified: true, businessDecision: JSON.parse(artifact.toString()) }) });

function locus() {
  return { locusId: 'route-policy', componentRef: 'router:v1', field: 'fallbackPolicy', currentValue: 'direct',
    mutationPolicy: { maxEdits: 1, maxCandidates: 1, maxSerializedBytes: 64,
      allowedValues: ['fallback'], recipes: { add_counterexample: [
        { value: 'fallback', expectedEffect: 'recover missing route' }
      ] } } };
}

function attestation(context, scope, controls) {
  return { executionId: `exec:${context.arm.role}`, processId: `process:${context.arm.role}`,
    isolationId: context.arm.isolationId, snapshotHashObserved: context.arm.snapshotHash,
    toolsetHashObserved: controls.toolsetHash, environmentHashObserved: controls.environmentHash,
    scope, cost: 1, model: controls.model, durationMs: 10 };
}

function metricDecision(input) {
  const { metric, mean, context, proof, controls } = input;
  return { metric, mean, arm: context.arm.role, isolationId: context.arm.isolationId,
    executionId: proof.executionId, snapshotHashObserved: proof.snapshotHashObserved,
    toolsetHashObserved: controls.toolsetHash, environmentHashObserved: controls.environmentHash,
    processId: proof.processId, cost: proof.cost, model: proof.model, durationMs: proof.durationMs };
}

function options(db, artifacts) {
  const scope = { organizationId: 'org', projectId: 'project' };
  const fullScope = { ...scope, entityId: 'agent' };
  const controls = { model: 'fixed-model', toolsetHash: 'b'.repeat(64), environmentHash: 'c'.repeat(64) };
  artifacts.set('cause-proof', Buffer.from(JSON.stringify({ traceId: 'trace-1', hypothesisId: 'cause-1',
    locusId: 'route-policy', independentVerifier: { actorId: 'reviewer', workspaceId: 'review-world' } })));
  return { db, scope, entityId: 'agent', snapshotHash: 'a'.repeat(64), worldBudget: 2, controls,
    trace: { traceId: 'trace-1', producer: { actorId: 'solver', workspaceId: 'producer-world' },
      events: [{ eventId: 'event-1', componentRef: 'router:v1', status: 'failed' }] }, loci: [locus()],
    hypotheses: [{ hypothesisId: 'cause-1', statement: 'The direct route missed a fallback.',
      locusId: 'route-policy', eventRefs: ['event-1'], diagnosis: 'false_negative',
      evidence: { artifactRef: 'cause-proof', verifierId: 'artifact' } }],
    verifierRegistry: registryService.fromTrustedRegistry(['artifact']),
    artifactReader: async ({ artifactRef }) => artifacts.get(artifactRef),
    datasets: { trainingRefs: ['train:1'], holdoutRefs: ['holdout:1'] }, maxCandidates: 1,
    decisionPolicy: { objective: { metric: 'quality', direction: 'maximize', minimumDelta: 0.05 },
      regressions: [{ metric: 'latency', direction: 'minimize', maxRegression: 5 }] },
    createCandidateBranch: async ({ arm }) => ({ worldId: arm.worldId, isolationId: arm.isolationId,
      branchId: `branch:${arm.role}`, production: false }),
    evaluateWorld: async (context) => {
      assert.equal(context.evaluationSet.kind, 'sealed_holdout');
      assert.deepEqual(context.evaluationSet.refs, ['holdout:1']);
      if (context.arm.role === 'candidate') assert.equal(context.mutation.editCount, 1);
      const proof = attestation(context, fullScope, controls);
      const metrics = context.arm.role === 'candidate' ? { quality: 0.8, latency: 102 }
        : { quality: 0.7, latency: 100 };
      const evidence = Object.entries(metrics).map(([metric, mean]) => {
        const artifactRef = `${context.arm.armId}:${metric}`;
        artifacts.set(artifactRef, Buffer.from(JSON.stringify(metricDecision({
          metric, mean, context, proof, controls
        }))));
        return { requirement: `metric:${metric}`, verifierId: 'artifact', artifactRef };
      });
      return { status: 'completed', cost: 1, metrics, evidence, isolationAttestation: proof };
    } };
}

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateGvxLedger(db);
    const artifacts = new Map();
    const input = options(db, artifacts);
    const result = await repair.run(input);
    assert.equal(result.status, 'external_review_required');
    assert.equal(result.eligible.length, 1);
    assert.equal(result.promotionAllowed, false);
    assert.ok(Math.abs(result.eligible[0].decision.objectiveGain - 0.1) < 1e-9);
    const events = await ledger.listAllEvents(db, { ...input.scope, entityId: input.entityId });
    assert.ok(events.some((event) => event.payload.kind === 'trace_locus_attribution'));
    assert.ok(events.some((event) => event.payload.kind === 'trace_guided_mutation_plan'));
    assert.ok(events.some((event) => event.payload.kind === 'trace_guided_candidate_decision'));

    assert.throws(() => repair.validateDatasets({ trainingRefs: ['same'], holdoutRefs: ['same'] }), {
      code: 'GVX_REPAIR_HOLDOUT_OVERLAP'
    });
    const regression = repair.assessComparison([{ role: 'baseline', metrics: { quality: 0.7, latency: 100 } },
      { role: 'candidate', metrics: { quality: 0.9, latency: 110 } }], input.decisionPolicy);
    assert.equal(regression.reason, 'regression-limit-exceeded');
  } finally { await db.close(); }
  console.log('GVX trace-guided repair checks passed.');
}

main().catch((failure) => { console.error(failure); process.exitCode = 1; });
