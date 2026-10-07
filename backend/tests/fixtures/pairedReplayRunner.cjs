'use strict';

const registry = require('../../src/services/proceduralRegistryService');
const protocol = require('../../src/services/pairedReplayProtocol');
const scope = { organizationId: 'paired-org', projectId: 'paired-project', entityId: 'paired-agent' };
const initial = { cursor: 0, value: 0, trajectory: [] };
const secondInitial = { cursor: 0, value: 10, trajectory: [] };
const environment = { schema: 'paired-test-environment/v1', node: process.version, dependency: 'none' };

async function runner(arm, state, context) {
  const replay = context.pairedReplay;
  if (arm.invalidAddress) replay.randomFor('not-declared', 0);
  if (arm.invalidSlot) replay.randomFor('before', 9);
  if (arm.mutateEvents) replay.events[0].payload.amount = 999;
  for (const event of replay.events.slice(state.cursor)) {
    const random = replay.randomFor(event.id, 0);
    if (event.id === 'fault' && arm.extraDraw) replay.randomFor(event.id, 1);
    state.value += event.payload.amount + random * 0.01 + (event.id === 'fault' ? arm.delta : 0);
    state.trajectory.push({ eventId: event.id, random, value: state.value });
    state.cursor += 1;
    await context.checkpoint(state);
    if (context.signal?.aborted) throw Object.assign(new Error('test pause'), { code: 'TEST_PAUSED' });
  }
  if (arm.replaceRunner) registry.registerRunner('paired-runner', async () => ({ metric: 99 }));
  return { metric: state.value, trajectory: state.trajectory };
}

function register() {
  registry.registerRunner('paired-runner', runner);
  registry.registerSnapshot('paired-snapshot', structuredClone(initial));
  registry.registerSnapshot('paired-snapshot-b', structuredClone(secondInitial));
  registry.registerEnvironment('paired-environment', structuredClone(environment));
}

function spec(experimentId = 'p1-addressed-replay') {
  return { experimentId, protocolVersion: protocol.VERSION, runnerId: 'paired-runner',
    environmentId: 'paired-environment', environmentManifest: environment,
    snapshots: [{ snapshotId: 'paired-snapshot', state: initial }, { snapshotId: 'paired-snapshot-b', state: secondInitial }],
    arms: { control: { delta: 0, extraDraw: false }, intervention: { delta: 2, extraDraw: true } },
    seeds: [7, 13, 29], budget: { maxSteps: 8, maxRuns: 12 }, analysis: { method: 'paired-observation' },
    replayContract: { schema: protocol.VERSION, scope,
      events: ['before', 'fault', 'after'].map(id => ({ id, slots: 2, payload: { amount: 1 } })) } };
}

function replayInput(forkId, snapshotId = 'paired-snapshot') {
  return { forkId, scope, runnerId: 'paired-runner', environmentId: 'paired-environment',
    environmentManifest: environment, snapshotState: snapshotId === 'paired-snapshot' ? initial : secondInitial, runner };
}

module.exports = { register, spec, replayInput, runner, initial, environment, scope };
