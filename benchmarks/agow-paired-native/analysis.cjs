'use strict';

const assert = require('node:assert/strict');
const contract = require('./contract.cjs');

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function lossSummary(arms) {
  const losses = arms.map((arm) => arm.loss).filter((loss) => loss !== null);
  const sum = losses.reduce((total, loss) => total + loss, 0);
  const unknown = arms.length - losses.length;
  return { tasks: arms.length, measured: losses.length, unknown,
    coverage: losses.length / arms.length, meanKnownLoss: mean(losses),
    allTaskLossBounds: [sum / arms.length, (sum + unknown) / arms.length] };
}

function costSummary(arms) {
  const complete = arms.filter((arm) => arm.costs?.complete === true);
  const processes = complete.map((arm) => arm.costs.processes);
  const runtimeMs = complete.map((arm) => arm.costs.runtimeMs);
  assert.ok(processes.every((value) => Number.isSafeInteger(value) && value >= 0));
  assert.ok(runtimeMs.every((value) => Number.isFinite(value) && value >= 0));
  return { measured: complete.length, unknown: arms.length - complete.length,
    knownOracleProcesses: complete.length ? processes.reduce((sum, value) => sum + value, 0) : null,
    knownOracleRuntimeMs: complete.length ? runtimeMs.reduce((sum, value) => sum + value, 0) : null,
    localComputeUsd: null };
}

function pairSummary(arms, item) {
  const [shadow, bounded] = contract.CONDITIONS.map((condition) => arms.find((arm) =>
    arm.caseId === item.caseId && arm.condition === condition));
  const a = shadow.loss === null ? [0, 1] : [shadow.loss, shadow.loss];
  const b = bounded.loss === null ? [0, 1] : [bounded.loss, bounded.loss];
  return { caseId: item.caseId,
    knownDelta: shadow.loss !== null && bounded.loss !== null ? bounded.loss - shadow.loss : null,
    deltaBounds: [b[0] - a[1], b[1] - a[0]] };
}

function summarize(manifest, arms) {
  contract.validateManifest(manifest);
  const expected = manifest.schedule.map((slot) => `${slot.caseId}/${slot.condition}`).sort();
  const actual = arms.map((arm) => `${arm.caseId}/${arm.condition}`).sort();
  assert.deepEqual(actual, expected, 'Exactly one result is required for every preregistered slot');
  assert.equal(new Set(arms.map((arm) => arm.runId)).size, arms.length, 'Run reuse is forbidden');
  for (const arm of arms) contract.validateArm(manifest, arm);
  const pairs = manifest.cases.map((item) => pairSummary(arms, item));
  const known = pairs.filter((pair) => pair.knownDelta !== null);
  return { conditions: Object.fromEntries(contract.CONDITIONS.map((condition) => {
    const group = arms.filter((arm) => arm.condition === condition);
    return [condition, { ...lossSummary(group), costs: costSummary(group) }];
  })), pairs, pairedCoverage: known.length / pairs.length,
  meanKnownPairedDelta: mean(known.map((pair) => pair.knownDelta)),
  allPairDeltaBounds: [mean(pairs.map((pair) => pair.deltaBounds[0])),
    mean(pairs.map((pair) => pair.deltaBounds[1]))],
  deltaDirection: 'bounded_minus_shadow_loss', boundsKind: 'arithmetic_not_confidence_interval',
  interpretation: 'engineering_pairing_qualification_not_policy_uplift', promotionAllowed: false };
}

module.exports = { summarize };
