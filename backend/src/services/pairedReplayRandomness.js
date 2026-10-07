'use strict';

const values = require('./trinityProvenanceValues');
const SCHEMA = 'genos.paired-randomness-observation/v1';
const ALGORITHM = 'sha256-event-slot/v1';
const ACCOUNTING = 'checkpointed-state-and-final-segment-only';

function valueFor(seed, eventId, slot) {
  return parseInt(values.digest({ algorithm: ALGORITHM, seed, eventId, slot }).slice(0, 13), 16) / 4503599627370496;
}

function address(contract, eventId, slot) {
  const event = contract.events.find(item => item.id === eventId);
  if (!event || !Number.isInteger(slot) || slot < 0 || slot >= event.slots) throw values.failure('CAUSAL_RANDOM_ADDRESS_INVALID');
  return `${eventId}:${slot}`;
}

function verify(proof, context) {
  verifyHeader(proof, context);
  const seen = new Set();
  for (const sample of proof.samples) {
    const key = address(context.contract, sample.eventId, sample.slot);
    verifySample(sample, context);
    if (seen.has(key)) throw values.failure('CAUSAL_RANDOMNESS_PROOF_INVALID');
    seen.add(key);
  }
  return proof;
}

function verifyHeader(proof, context) {
  if (proof?.schema !== SCHEMA || proof.algorithm !== ALGORITHM || proof.protocolHash !== context.protocolHash
      || proof.runnerHash !== context.runnerHash || proof.seed !== context.seed || proof.accounting !== ACCOUNTING) throw values.failure('CAUSAL_RANDOMNESS_PROOF_INVALID');
  if (!Array.isArray(proof.samples) || proof.samples.length > 2048) throw values.failure('CAUSAL_RANDOMNESS_PROOF_INVALID');
}

function verifySample(sample, context) {
  if (!Number.isSafeInteger(sample.calls) || sample.calls < 1
      || sample.value !== valueFor(context.seed, sample.eventId, sample.slot)) throw values.failure('CAUSAL_RANDOMNESS_PROOF_INVALID');
}

function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

function open(context, previous) {
  const samples = new Map();
  if (previous) {
    verify(previous, context);
    for (const sample of previous.samples) samples.set(address(context.contract, sample.eventId, sample.slot), { ...sample });
  }
  const randomFor = (eventId, slot = 0) => {
    const key = address(context.contract, eventId, slot);
    const sample = samples.get(key) || { eventId, slot, value: valueFor(context.seed, eventId, slot), calls: 0 };
    if (!Number.isSafeInteger(sample.calls + 1)) throw values.failure('CAUSAL_RANDOMNESS_REQUEST_OVERFLOW');
    sample.calls += 1;
    samples.set(key, sample);
    return sample.value;
  };
  return { context: Object.freeze({ events: freeze(values.clone(context.contract.events)), randomFor }),
    observation: () => ({ schema: SCHEMA, algorithm: ALGORITHM, protocolHash: context.protocolHash,
      runnerHash: context.runnerHash, seed: context.seed, accounting: ACCOUNTING,
      samples: [...samples.values()].sort((a, b) => address(context.contract, a.eventId, a.slot).localeCompare(address(context.contract, b.eventId, b.slot))).map(sample => ({ ...sample })) }) };
}

module.exports = { valueFor, verify, open };
