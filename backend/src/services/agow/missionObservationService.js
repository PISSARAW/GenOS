'use strict';

const persistence = require('./agowStatePersistenceService');
const contract = require('./missionObservationContract');
const { digest } = require('../evidenceProtocol/canonical');
const SCOPE = 'agow_mission_observations';
const MAX_RECORDS = 2000;

async function list(options) {
  const { state } = await persistence.load({ ...options, scope: SCOPE });
  return state.records || [];
}

async function bindingFor(options) {
  const { agentId, missionId, runId, candidateId } = options;
  if (![agentId, missionId, runId, candidateId].every(contract.identifier)) {
    throw new Error('agow-mission-binding-identity-required');
  }
  const frame = await require('./workspaceFrameStore').get({ agentId, db: options.db, frameId: options.frameId });
  const loaded = await require('./cognitiveModeExperienceService').load(options);
  const receipt = (loaded.state.receipts || []).find((item) => item.receiptId === options.decisionReceiptId);
  validateDecision({ frame, receipt, candidateId });
  if (frame.activeGoal !== missionId) throw new Error('agow-mission-frame-goal-mismatch');
  const binding = { schema: 'genos.agow.mission-observation/v1', agentId, missionId, runId,
    candidateId, frameId: frame.frameId, decisionReceiptId: receipt.receiptId,
    chosenMode: receipt.chosenMode, predictedLoss: receipt.predictedLoss,
    controlAuthority: options.controlAuthority === 'agow' ? 'agow' : 'historical' };
  return { ...binding, bindingHash: digest(binding) };
}

function validateDecision(input) {
  const { frame, receipt, candidateId } = input;
  if (!frame || frame.realityMode !== 'real') throw new Error('agow-mission-real-frame-required');
  if (![frame.primaryContent, ...frame.secondaryContents].includes(candidateId)) {
    throw new Error('agow-mission-candidate-not-selected');
  }
  if (!receipt || receipt.frameId !== frame.frameId || !Number.isFinite(receipt.predictedLoss)) {
    throw new Error('agow-mission-decision-receipt-mismatch');
  }
}

async function updateRecord(options, transform) {
  let result;
  await persistence.update({ scope: SCOPE, agentId: options.agentId, db: options.db }, (state) => {
    const records = state.records || [];
    const index = records.findIndex((record) => record.binding.runId === options.runId);
    result = transform(index < 0 ? null : records[index]);
    if (index < 0) {
      if (records.length >= MAX_RECORDS) throw new Error('agow-mission-journal-capacity');
      records.push(result);
    } else records[index] = result;
    return { records };
  });
  return result;
}

async function start(options) {
  const prior = (await list(options)).find((record) => record.binding.runId === options.runId);
  if (prior) {
    validateReplay(prior.binding, options);
    return prior;
  }
  const binding = await bindingFor(options);
  return updateRecord(options, (prior) => {
    if (prior && prior.binding.bindingHash !== binding.bindingHash) throw new Error('agow-mission-binding-conflict');
    return prior || { binding, startedAt: Date.now(), status: 'awaiting_outcome', observation: null,
      promotionAllowed: false, policyUpdated: false };
  });
}

function validateReplay(binding, options) {
  const fields = ['agentId', 'missionId', 'runId', 'candidateId', 'frameId', 'decisionReceiptId'];
  const authority = options.controlAuthority === 'agow' ? 'agow' : 'historical';
  if (fields.some((key) => binding[key] !== options[key]) || binding.controlAuthority !== authority) {
    throw new Error('agow-mission-binding-conflict');
  }
}

function matchEvent(prior, identity) {
  if (!prior) throw new Error('agow-mission-binding-not-found');
  const recorded = prior.observation;
  if (recorded && (recorded.eventId !== identity.eventId || recorded.eventDigest !== identity.eventDigest)) {
    throw new Error('agow-mission-outcome-conflict');
  }
}

async function pending(options, identity, reason) {
  return updateRecord(options, (prior) => {
    matchEvent(prior, identity);
    if (prior.status === 'verified') return prior;
    return { ...prior, status: 'verification_pending',
      observation: { ...identity, reason, receivedAt: prior.observation?.receivedAt || Date.now() } };
  });
}

async function invokeVerifier(verifier, input, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => verifier({ ...structuredClone(input), signal: controller.signal })),
      new Promise((_, reject) => { timer = setTimeout(() => {
        reject(new Error('agow-mission-verifier-timeout')); controller.abort();
      }, timeoutMs); })
    ]);
  } finally { clearTimeout(timer); }
}

async function verify(options, prior, identity) {
  const bindings = require('./agowRuntimeBindingsService').resolve({ agentId: options.agentId, db: options.db });
  if (!bindings.missionOutcomeVerifier) return pending(options, identity, 'verifier_unavailable');
  const context = { binding: prior.binding, eventIdentity: identity,
    event: { eventId: identity.eventId, ...contract.eventContent(options.event) } };
  let measured;
  try {
    const result = await invokeVerifier(bindings.missionOutcomeVerifier, context, bindings.missionOutcomeTimeoutMs ?? 5000);
    measured = contract.measurement(result, context);
  } catch (error) {
    const reason = error?.message === 'agow-mission-verifier-timeout' ? 'verifier_timeout' : 'verification_failed';
    return pending(options, identity, reason);
  }
  return updateRecord(options, (current) => verifiedRecord(current, { identity, measured }));
}

function verifiedRecord(prior, input) {
  matchEvent(prior, input.identity);
  const measurementHash = digest(input.measured);
  if (prior.status === 'verified') {
    if (prior.observation.measurementHash !== measurementHash) throw new Error('agow-mission-measurement-conflict');
    return prior;
  }
  return { ...prior, status: 'verified', observation: { ...input.identity, ...input.measured,
    measurementHash, verifiedAt: Date.now(),
    predictionError: input.measured.metrics.realizedLoss - prior.binding.predictedLoss },
    promotionAllowed: false, policyUpdated: false };
}

async function observe(options) {
  const prior = (await list(options)).find((record) => record.binding.runId === options.runId);
  if (!prior) return { recorded: false, reason: 'mission_binding_unavailable' };
  const identity = contract.eventIdentity(options.event, prior.binding);
  matchEvent(prior, identity);
  if (prior.status === 'verified') return prior;
  await pending(options, identity, 'verification_requested');
  return verify(options, prior, identity);
}

module.exports = { SCOPE, start, list, observe };
