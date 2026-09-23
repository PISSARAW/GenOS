'use strict';

const assert = require('assert');
const svc = require('../src/services/controlledCausalExperimentService');

// 1. Runner mutates state → control and intervention start identical.
{
  const seen = [];
  const runner = (op, state) => {
    seen.push(state.x);
    state.x += 1;
    return { turns: ['A'] };
  };
  svc.runControlledExperiment({
    name: 'isolation',
    runner,
    control: { kind: 'control' },
    intervention: { kind: 'intervention' },
    initialState: { x: 0 },
  });
  assert.deepStrictEqual(seen, [0, 0], 'both branches start from x=0');
}

// 1b. Standalone executeBaseline / executeIntervention isolate too.
{
  const experiment = svc.createExperiment({
    name: 'standalone',
    runner: (op, state) => {
      state.n += 1;
      return state.n;
    },
    control: {},
    intervention: {},
    initialState: { n: 0 },
  });
  assert.strictEqual(svc.executeBaseline(experiment), 1);
  assert.strictEqual(svc.executeIntervention(experiment), 1, 'no leak between branches');
  assert.strictEqual(experiment.initialState.n, 0, 'stored initial state untouched');
}

// 2. Same prefix + extra event → diverged.
{
  const comparison = svc.compareTrajectories(['A', 'B'], ['A', 'B', 'C']);
  assert.strictEqual(comparison.lengthDiverged, true);
  assert.strictEqual(comparison.diverged, true, '[A,B] vs [A,B,C] diverges');
  assert.strictEqual(comparison.divergenceCount, 0);
}

// 3. Identical trajectories → NONE.
{
  const receipt = svc.runControlledExperiment({
    name: 'identical',
    runner: () => ({ turns: ['A', 'B'] }),
    control: {},
    intervention: {},
    initialState: {},
  });
  assert.strictEqual(receipt.trajectoryComparison.diverged, false);
  assert.strictEqual(receipt.trajectoryEvidenceStrength, 'none');
  assert.strictEqual(receipt.evidenceStrength, 'none');
}

// 4. Receipt stores the exact intervention (and control).
{
  const control = { op: 'keep', value: 1 };
  const intervention = { op: 'set', value: 2 };
  const receipt = svc.runControlledExperiment({
    name: 'receipt-content',
    runner: (op) => ({ turns: [op.op] }),
    control,
    intervention,
    initialState: {},
  });
  assert.deepStrictEqual(receipt.control, control);
  assert.deepStrictEqual(receipt.intervention, intervention);
}

// 5. Altered/missing initial states → experiment rejected.
{
  assert.throws(
    () => svc.createExperiment({ name: 'no-state', runner: () => ({}), control: {}, intervention: {} }),
    /explicit initialState/
  );
  assert.throws(
    () => svc.createExperiment({ name: 'no-runner', control: {}, intervention: {}, initialState: {} }),
    /runner function/
  );
}

// 6. Control/intervention same operation → no causal inference.
{
  const same = { op: 'identical' };
  const receipt = svc.runControlledExperiment({
    name: 'same-op',
    runner: (op) => ({ turns: [op.op] }),
    control: same,
    intervention: { ...same },
    initialState: {},
  });
  assert.strictEqual(receipt.trajectoryComparison.diverged, false);
  assert.strictEqual(receipt.trajectoryEvidenceStrength, 'none');
}

// 7. State hashes equal before execution.
{
  const receipt = svc.runControlledExperiment({
    name: 'hashes',
    runner: (op, state) => {
      state.touched = true;
      return { turns: ['A'] };
    },
    control: {},
    intervention: {},
    initialState: { seed: 42 },
  });
  assert.ok(receipt.controlInitialStateHash, 'control hash recorded');
  assert.ok(receipt.interventionInitialStateHash, 'intervention hash recorded');
  assert.strictEqual(receipt.controlInitialStateHash, receipt.interventionInitialStateHash);
  assert.strictEqual(receipt.initialStatesEqual, true);
  // Hashes cover the pre-execution state, not runner mutations.
  assert.notStrictEqual(receipt.controlInitialStateHash, svc.stateHash({ seed: 42, touched: true }));
}

// 8. Receipt cannot say strong unless required controls are proven.
{
  const receipt = svc.runControlledExperiment({
    name: 'capped',
    runner: (op) => ({ turns: op.kind === 'ctl' ? ['A', 'X'] : ['A', 'Y'] }),
    control: { kind: 'ctl' },
    intervention: { kind: 'int' },
    initialState: {},
  });
  assert.strictEqual(receipt.trajectoryComparison.diverged, true);
  assert.notStrictEqual(receipt.trajectoryEvidenceStrength, 'strong', 'contrast without replication caps below strong');
  assert.strictEqual(receipt.controls.replicated, false);
  assert.strictEqual(receipt.executable, false);
  assert.strictEqual(receipt.runtimeAuthority, false);
  assert.ok(!('verdict' in receipt), 'no causal verdict emitted');
}

console.log('Controlled causal experiment tests passed (isolation, length divergence, capped strength).');
