'use strict';

const crypto = require('node:crypto');
const { createReceipt, readReceipt } = require('./versionedContractService');
const { persistReceipt, loadReceipt } = require('./versionedContractPersistenceService');

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function validateSamples(samples, minimum) {
  if (!Array.isArray(samples) || samples.length < minimum || samples.some((sample) => !sample
    || typeof sample !== 'object' || Array.isArray(sample) || !Number.isFinite(sample.value)
    || typeof sample.sourceRef !== 'string' || !sample.sourceRef.trim())) {
    fail('PHYSICS_INSUFFICIENT_DATA', `At least ${minimum} finite, referenced samples are required.`);
  }
  return samples.map((sample) => ({ value: sample.value, sourceRef: sample.sourceRef.trim() }));
}

function mean(samples) {
  return samples.reduce((sum, sample) => sum + sample.value, 0) / samples.length;
}

function deviation(samples, center) {
  return Math.sqrt(samples.reduce((sum, sample) => sum + (sample.value - center) ** 2, 0) / samples.length);
}

function verifySources(samples) {
  const refs = samples.map((sample) => sample.sourceRef.trim());
  if (new Set(refs).size !== refs.length) fail('PHYSICS_INSUFFICIENT_DATA', 'Every sample must have a distinct evidence reference.');
  return refs;
}

function verifyMeasurementEvidence(receipt, sample, input) {
  const payload = receipt?.payload || {};
  const measured = payload.delta?.[input.parameterId];
  const valid = receipt?.contractType === 'WorldTransition'
    && payload.context?.missionClass === input.missionClass
    && Number.isFinite(measured) && valuesMatch(measured, sample.value);
  if (!valid) fail('PHYSICS_INSUFFICIENT_DATA', `Evidence receipt '${sample.sourceRef}' does not substantiate this mission parameter sample.`);
  const hasProvenance = receipt.sourceRefs.length > 0
    || (Array.isArray(payload.evidenceRefs) && payload.evidenceRefs.some((ref) => typeof ref === 'string' && ref.trim()));
  if (!hasProvenance) fail('PHYSICS_INSUFFICIENT_DATA', `Evidence receipt '${sample.sourceRef}' has no source provenance.`);
}

function valuesMatch(actual, expected) {
  const precision = Number.EPSILON * Math.max(1, Math.abs(actual), Math.abs(expected)) * 4;
  return Math.abs(actual - expected) <= precision;
}

async function verifyStoredEvidence(db, samples, input) {
  for (const entry of samples) {
    const sample = { ...entry, sourceRef: entry.sourceRef.trim() };
    const receiptId = sample.sourceRef;
    const receipt = await loadReceipt(db, receiptId);
    if (!receipt) fail('PHYSICS_INSUFFICIENT_DATA', `Evidence receipt '${receiptId}' is missing.`);
    verifyMeasurementEvidence(receipt, sample, input);
  }
}

async function latestVersion(db, missionClass, parameterId) {
  const rows = await db.all('SELECT payload_json FROM versioned_contract_receipts WHERE contract_type = ?', ['MissionPhysicsParameterSet']);
  return rows.map((row) => JSON.parse(row.payload_json))
    .filter((item) => item.missionClass === missionClass && item.parameterId === parameterId)
    .reduce((version, item) => Math.max(version, item.version), 0);
}

function validateCandidateBounds(bounds) {
  const valid = bounds && typeof bounds === 'object' && !Array.isArray(bounds)
    && Number.isFinite(bounds.min) && Number.isFinite(bounds.max) && bounds.min <= bounds.max;
  if (!valid) fail('PHYSICS_BOUND_VIOLATION', 'Explicit ordered bounds are required.');
}

function validateCandidateStatistics(stats) {
  if (![stats.estimate, stats.holdoutMean, stats.observedDrift].every(Number.isFinite)) {
    fail('PHYSICS_INSUFFICIENT_DATA', 'Sample arithmetic must remain finite.');
  }
  if (stats.estimate < stats.bounds.min || stats.estimate > stats.bounds.max) {
    fail('PHYSICS_BOUND_VIOLATION', 'Learned value falls outside the declared bounds.');
  }
  if (stats.observedDrift > stats.maxValidationDrift) {
    fail('PHYSICS_VALIDATION_FAILED', 'Holdout observations disagree beyond the declared tolerance.');
  }
}

function buildCandidate(input, version) {
  const trainingSamples = validateSamples(input.trainingSamples, 3);
  const validationSamples = validateSamples(input.validationSamples, 2);
  validateCandidateBounds(input.bounds);
  if (!Number.isFinite(input.maxValidationDrift) || input.maxValidationDrift < 0) {
    fail('PHYSICS_VALIDATION_FAILED', 'A non-negative holdout drift threshold is required.');
  }
  const allSamples = [...trainingSamples, ...validationSamples];
  const sourceRefs = verifySources(allSamples);
  const estimate = mean(trainingSamples);
  const holdoutMean = mean(validationSamples);
  const observedDrift = Math.abs(holdoutMean - estimate);
  validateCandidateStatistics({ estimate, holdoutMean, observedDrift, bounds: input.bounds, maxValidationDrift: input.maxValidationDrift });
  const samplePayload = { training: trainingSamples, validation: validationSamples };
  return {
    missionClass: input.missionClass,
    parameterId: input.parameterId,
    version,
    unit: input.unit,
    value: estimate,
    uncertainty: deviation(input.trainingSamples, estimate),
    bounds: input.bounds,
    sampleCount: input.trainingSamples.length + input.validationSamples.length,
    sourceRefs,
    trainingHash: crypto.createHash('sha256').update(JSON.stringify(samplePayload)).digest('hex'),
    validation: { status: 'passed', sampleCount: input.validationSamples.length, observedDrift, maxDrift: input.maxValidationDrift },
    state: 'candidate',
    previousReceiptId: null,
  };
}

async function proposeParameter(db, input) {
  if (!input || ['missionClass', 'parameterId', 'unit'].some((key) => typeof input[key] !== 'string' || !input[key].trim())) fail('PHYSICS_INSUFFICIENT_DATA', 'Mission class, parameter ID and unit are required.');
  input = { ...input, missionClass: input.missionClass.trim(), parameterId: input.parameterId.trim(), unit: input.unit.trim() };
  const version = await latestVersion(db, input.missionClass, input.parameterId) + 1;
  const payload = buildCandidate(input, version);
  await verifyStoredEvidence(db, [...input.trainingSamples, ...input.validationSamples], input);
  const receipt = createReceipt('MissionPhysicsParameterSet', payload, { runId: input.runId, sourceRefs: payload.sourceRefs });
  const persisted = await persistReceipt(db, receipt, { eventType: 'MISSION_PHYSICS_PARAMETER_CANDIDATE' });
  return { ...persisted, receipt };
}

async function transitionParameter(db, receiptId, state) {
  const original = await loadReceipt(db, receiptId);
  const validSourceState = state === 'active' ? 'candidate' : 'active';
  if (!original || original.contractType !== 'MissionPhysicsParameterSet' || original.payload.state !== validSourceState) fail('PHYSICS_VALIDATION_FAILED', 'Parameter state transition is invalid.');
  const active = await resolveActiveParameter(db, original.payload.missionClass, original.payload.parameterId);
  const previousReceiptId = state === 'rolled_back' ? original.payload.previousReceiptId : (active?.receiptId || null);
  const payload = { ...original.payload, state, previousReceiptId };
  const receipt = createReceipt('MissionPhysicsParameterSet', payload, { runId: original.runId, sourceRefs: original.sourceRefs });
  const persisted = await persistReceipt(db, receipt, { eventType: state === 'active' ? 'MISSION_PHYSICS_PARAMETER_ACTIVATED' : 'MISSION_PHYSICS_PARAMETER_ROLLED_BACK' });
  return { ...persisted, receipt };
}

async function activateParameter(db, receiptId) {
  return transitionParameter(db, receiptId, 'active');
}

async function rollbackParameter(db, receiptId) {
  const current = await loadReceipt(db, receiptId);
  if (!current || current.contractType !== 'MissionPhysicsParameterSet' || current.payload.state !== 'active') fail('PHYSICS_VALIDATION_FAILED', 'Only an active parameter version can be rolled back.');
  const active = await resolveActiveParameter(db, current.payload.missionClass, current.payload.parameterId);
  if (active?.receiptId !== receiptId) fail('PHYSICS_VALIDATION_FAILED', 'Only the currently active parameter version can be rolled back.');
  return transitionParameter(db, receiptId, 'rolled_back');
}

async function resolveActiveParameter(db, missionClass, parameterId) {
  const rows = await db.all('SELECT receipt_id, payload_json FROM versioned_contract_receipts WHERE contract_type = ? ORDER BY rowid DESC', ['MissionPhysicsParameterSet']);
  const events = rows.map((row) => ({ receiptId: row.receipt_id, payload: JSON.parse(row.payload_json) }))
    .filter((entry) => entry.payload.missionClass === missionClass && entry.payload.parameterId === parameterId && entry.payload.state !== 'candidate');
  const latest = events[0];
  if (!latest) return null;
  if (latest.payload.state === 'rolled_back') return latest.payload.previousReceiptId ? loadReceipt(db, latest.payload.previousReceiptId) : null;
  return latest.payload.state === 'active' ? loadReceipt(db, latest.receiptId) : null;
}

function validateCandidate(receipt) {
  const validation = readReceipt(receipt);
  if (!validation.valid || receipt.contractType !== 'MissionPhysicsParameterSet' || receipt.payload.state !== 'candidate') fail('PHYSICS_VALIDATION_FAILED', 'Candidate receipt is invalid or not pending activation.');
  return true;
}

module.exports = { proposeParameter, activateParameter, rollbackParameter, resolveActiveParameter, validateCandidate };
