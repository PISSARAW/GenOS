'use strict';

const protocol = require('./pairedReplayProtocol');
const randomness = require('./pairedReplayRandomness');
const values = require('./trinityProvenanceValues');

function binding(experiment, fork, input) {
  const contract = protocol.verify(experiment, input);
  const created = fork.events.find(event => event.event_type === 'FORK_CREATED');
  if (!contract) {
    if (created?.payload.protocolHash) throw values.failure('CAUSAL_REPLAY_VERSION_MISMATCH');
    return null;
  }
  if (created?.payload.protocolHash !== experiment.replay_protocol_hash
      || created.payload.seed !== fork.seed || created.payload.arm !== fork.arm
      || created.payload.snapshotId !== fork.snapshot_id) throw values.failure('CAUSAL_REPLAY_FORK_BINDING_INVALID');
  const hashes = JSON.parse(experiment.snapshot_hashes_json);
  if (fork.experiment_id !== experiment.experiment_id) throw values.failure('CAUSAL_REPLAY_FORK_BINDING_INVALID');
  if (hashes[fork.snapshot_id] !== fork.snapshot_hash) throw values.failure('CAUSAL_SNAPSHOT_MISMATCH');
  verifyState(fork);
  return { contract, protocolHash: experiment.replay_protocol_hash, runnerHash: experiment.runner_hash, seed: fork.seed };
}

function verifyState(fork) {
  const checkpoint = fork.events.filter(event => event.event_type === 'CHECKPOINT').at(-1);
  const expectedHash = checkpoint?.state_hash || fork.snapshot_hash;
  const expectedVersion = checkpoint?.payload.version || 0;
  if (fork.state_hash !== expectedHash || fork.checkpoint_version !== expectedVersion) throw values.failure('CAUSAL_REPLAY_STATE_BINDING_INVALID');
}

function open(experiment, fork, input) {
  const context = binding(experiment, fork, input);
  if (!context) return null;
  protocol.verifyRunner(experiment, input);
  const checkpoint = fork.events.filter(event => event.event_type === 'CHECKPOINT').at(-1);
  if (checkpoint && !checkpoint.payload.replayObservation) throw values.failure('CAUSAL_RANDOMNESS_PROOF_REQUIRED');
  return randomness.open(context, checkpoint?.payload.replayObservation);
}

function comparison(experiment, forks, input) {
  protocol.verify(experiment, input);
  if (!protocol.enabled(experiment)) {
    if (forks.some(fork => fork.events[0]?.payload.protocolHash)) throw values.failure('CAUSAL_REPLAY_VERSION_MISMATCH');
    return { status: 'legacy_declared', randomness: 'not_observed' };
  }
  const observed = forks.map(fork => {
    const context = binding(experiment, fork, input);
    const result = fork.events.filter(event => event.event_type === 'RUN_RESULT').at(-1);
    if (!result?.payload.replayObservation) throw values.failure('CAUSAL_RANDOMNESS_PROOF_REQUIRED');
    return randomness.verify(result.payload.replayObservation, context);
  });
  const right = new Map(observed[1].samples.map(sample => [`${sample.eventId}:${sample.slot}`, sample]));
  const shared = observed[0].samples.filter(sample => right.has(`${sample.eventId}:${sample.slot}`));
  if (!shared.length) throw values.failure('CAUSAL_PAIRED_RANDOMNESS_UNOBSERVED');
  return { status: 'addressed_randomness_observed', protocolHash: experiment.replay_protocol_hash,
    runnerHash: experiment.runner_hash, algorithm: observed[0].algorithm,
    accounting: observed[0].accounting, sharedAddresses: shared.length,
    observations: observed, causalGuarantee: false, runtimeAuthority: false };
}

async function assertCurrent(db, { experiment, fork, input }) {
  if (!protocol.enabled(experiment)) return;
  const current = await db.get('SELECT * FROM procedural_causal_experiments WHERE experiment_id=?', experiment.experiment_id);
  const currentFork = await require('./proceduralCausalExperimentService').loadFork(db, fork.fork_id);
  const context = binding(current, currentFork, input);
  if (!context || current.replay_protocol_hash !== experiment.replay_protocol_hash) throw values.failure('CAUSAL_REPLAY_PROTOCOL_CHANGED');
  protocol.verifyRunner(current, input);
}

module.exports = { binding, open, comparison, assertCurrent };
