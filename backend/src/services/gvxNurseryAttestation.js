'use strict';

const { error, sameScope } = require('./gvxContracts');

function validate(context) {
  const { options, arm, outcome, evidence } = context;
  if (!options.requireAttestation) return;
  validateMetrics(context);
  const proof = outcome.isolationAttestation;
  const controls = options.plan.controls;
  validateIsolation({ proof, arm, controls, snapshotHash: options.plan.snapshotHash });
  if (!Number.isFinite(outcome.cost) || outcome.cost < 0 || outcome.cost > arm.budget) {
    throw error('GVX_NURSERY_BUDGET_EXCEEDED');
  }
  for (const [metric, value] of Object.entries(outcome.metrics || {})) {
    const measured = evidence.find((item) => item.requirement === `metric:${metric}`);
    const decision = measured?.signedReceipt?.businessDecision || measured?.businessDecision;
    if (!matches(decision, { arm, proof, controls, metric, value })) throw error('GVX_NURSERY_METRIC_UNBOUND');
  }
}

function matches(decision, expected) {
  const { arm, proof, controls, metric, value } = expected;
  return decision?.metric === metric && decision.mean === value && decision.arm === arm.role
    && decision.isolationId === arm.isolationId && decision.executionId === proof.executionId
    && decision.snapshotHashObserved === proof.snapshotHashObserved
    && decision.toolsetHashObserved === controls.toolsetHash
    && decision.environmentHashObserved === controls.environmentHash && resourceMatch(decision, proof);
}

module.exports = { validate };

function validateIsolation({ proof, arm, controls, snapshotHash }) {
  if (!proof?.processId || proof.isolationId !== arm.isolationId
      || proof.snapshotHashObserved !== snapshotHash
      || proof.toolsetHashObserved !== controls.toolsetHash
      || proof.environmentHashObserved !== controls.environmentHash) {
    throw error('GVX_NURSERY_ISOLATION_UNVERIFIED');
  }
}

function resourceMatch(decision, proof) {
  return decision.processId === proof.processId && decision.cost === proof.cost
    && decision.model === proof.model && decision.durationMs === proof.durationMs;
}

function validateMetrics({ options, outcome }) {
  const input=options.input||options;
  const proof=outcome.isolationAttestation;
  if(!sameScope(proof?.scope,{...input.scope,entityId:input.entityId})) throw error('GVX_NURSERY_SCOPE_MISMATCH');
  const names=Object.keys(outcome.metrics||{});
  const required=options.metricAllowlist||[];
  if(!required.length||names.length!==required.length||!required.every(name=>Number.isFinite(outcome.metrics[name]))) {
    throw error('GVX_NURSERY_METRIC_SET_INVALID');
  }
  if(outcome.cost!==proof.cost) throw error('GVX_NURSERY_COST_UNBOUND');
}
