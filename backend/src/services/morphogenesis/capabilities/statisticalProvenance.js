'use strict';

const { withTransaction } = require('../../../db');
const artifacts = require('./runtimeArtifacts');
const receipts = require('./statisticalReceipt');

function validateProtocol(protocol) {
  if (protocol?.method !== receipts.METHOD || protocol.nullConditionalWinProbability !== 0.5
    || !protocol.unitDefinition || !protocol.successPredicate || !protocol.environmentVersion) {
    throw new Error('PREREGISTERED_STATISTICAL_PROTOCOL_REQUIRED');
  }
  validateManifest(protocol.evaluationUnits);
}

function validateManifest(units) {
  if (!Array.isArray(units) || !units.length || units.length > 10000
    || new Set(units).size !== units.length || units.some((id) => typeof id !== 'string' || !id)) {
    throw new Error('ORDERED_EVALUATION_MANIFEST_REQUIRED');
  }
}

async function registerProtocol(db, input) {
  validateProtocol(input.protocol);
  if (!input.verifierId) throw new Error('INDEPENDENT_STATISTICAL_VERIFIER_REQUIRED');
  return withTransaction(db, async (tx) => {
    const scope = await tx.get('SELECT root_id FROM morph_risk_scopes WHERE scope_id = ?', [input.scopeId]);
    if (!scope) throw new Error('RISK_SCOPE_REQUIRED');
    const protocolHash = artifacts.digest(input.protocol);
    const prior = await tx.get('SELECT * FROM morph_statistical_protocols WHERE protocol_hash = ?', [protocolHash]);
    if (prior) {
      if (prior.scope_id !== input.scopeId || prior.verifier_id !== input.verifierId) throw new Error('PROTOCOL_SCOPE_CONFLICT');
      return { protocolHash, artifactRef: prior.artifact_ref };
    }
    const artifactRef = await artifacts.put(tx, { scopeId: input.scopeId, kind: 'statistical-protocol',
      content: { protocol: input.protocol, verifierId: input.verifierId } });
    await tx.run(`INSERT INTO morph_statistical_protocols
      (protocol_hash, scope_id, verifier_id, protocol_json, artifact_ref, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [protocolHash, input.scopeId, input.verifierId, JSON.stringify(input.protocol), artifactRef, new Date().toISOString()]);
    return { protocolHash, artifactRef };
  });
}

async function binding(db, input) {
  const test = await db.get('SELECT * FROM morph_risk_tests WHERE test_id = ?', [input.testId]);
  if (!test) throw new Error('RESERVED_STATISTICAL_TEST_REQUIRED');
  const protocol = await db.get('SELECT * FROM morph_statistical_protocols WHERE protocol_hash = ? AND scope_id = ?', [test.protocol_hash, input.scopeId]);
  if (!protocol || protocol.verifier_id !== input.verifierId) throw new Error('STATISTICAL_PROTOCOL_BINDING_INVALID');
  const grant = await db.get('SELECT owner_node_id, root_id FROM morph_risk_grants WHERE grant_id = ?', [test.grant_id]);
  if (grant.owner_node_id === input.verifierId) throw new Error('INDEPENDENT_STATISTICAL_VERIFIER_REQUIRED');
  const scope = await db.get('SELECT scope_id FROM morph_risk_scopes WHERE root_id = ?', [grant.root_id]);
  if (scope?.scope_id !== input.scopeId) throw new Error('RISK_SCOPE_MISMATCH');
  const reservation = await db.get(`SELECT a.rowid AS sequence FROM morph_statistical_reservations r
    JOIN morph_capability_artifacts a ON a.artifact_ref = r.reservation_ref WHERE r.test_id = ?`, [input.testId]);
  if (!reservation) throw new Error('PREREGISTERED_TEST_RESERVATION_REQUIRED');
  const protocolSequence = await requireProtocolArtifact(db, protocol);
  return { test, protocol, contract: JSON.parse(protocol.protocol_json), reservationSequence: reservation.sequence, protocolSequence };
}

function manifestPrefix(samples, contract) {
  if (!samples.length || samples.length > contract.evaluationUnits.length) throw new Error('EVALUATION_MANIFEST_PREFIX_REQUIRED');
  for (let index = 0; index < samples.length; index++) {
    if (samples[index].evaluationUnitId !== contract.evaluationUnits[index]) throw new Error('EVALUATION_MANIFEST_PREFIX_REQUIRED');
  }
}

async function resolveSample(db, input, bound) {
  const artifact = await artifacts.get(db, { scopeId: input.scopeId, ref: input.sample.evidenceRef });
  const sample = artifact?.content;
  if (artifact?.kind !== 'paired-evaluation' || ![0, 1].includes(sample?.outcome)) throw new Error('PAIRED_EVALUATION_EVIDENCE_REQUIRED');
  if (sample.protocolHash !== bound.test.protocol_hash || sample.verifierId !== bound.protocol.verifier_id
    || sample.environmentVersion !== bound.contract.environmentVersion) throw new Error('EVALUATION_PROTOCOL_BINDING_INVALID');
  await requireObservationOrder(db, { artifact, evidenceRef: input.sample.evidenceRef }, bound);
  const unit = await artifacts.get(db, { scopeId: input.scopeId, ref: sample.unitRef });
  if (unit?.kind !== 'statistical-evaluation-unit') throw new Error('EVALUATION_UNIT_SOURCE_REQUIRED');
  if (!sample.sampleId || !sample.evaluationUnitId) throw new Error('EVALUATION_SAMPLE_IDENTITY_REQUIRED');
  return { ...sample, evidenceRef: input.sample.evidenceRef, unitHash: artifacts.digest(unit.content) };
}

async function retainSample(db, input) {
  const prior = await db.get('SELECT * FROM morph_statistical_samples WHERE sample_id = ?', [input.sample.sampleId]);
  if (prior) {
    if (prior.test_id !== input.testId || prior.evidence_ref !== input.sample.evidenceRef) throw new Error('STATISTICAL_SAMPLE_REUSE_FORBIDDEN');
    return;
  }
  const reused = await db.get('SELECT sample_id FROM morph_statistical_samples WHERE unit_hash = ? OR evidence_ref = ?', [input.sample.unitHash, input.sample.evidenceRef]);
  if (reused) throw new Error('EVALUATION_UNIT_REUSE_FORBIDDEN');
  await db.run(`INSERT INTO morph_statistical_samples (sample_id, test_id, evidence_ref, unit_hash, sample_json)
    VALUES (?, ?, ?, ?, ?)`, [input.sample.sampleId, input.testId, input.sample.evidenceRef, input.sample.unitHash, JSON.stringify(input.sample)]);
}

async function resolveSamples(db, input, bound) {
  if (!Array.isArray(input.samples) || input.samples.length > 10000) throw new Error('BOUNDED_STATISTICAL_SAMPLES_REQUIRED');
  const samples = [];
  for (const sample of input.samples) samples.push(await resolveSample(db, { scopeId: input.scopeId, sample }, bound));
  manifestPrefix(samples, bound.contract);
  for (const sample of samples) await retainSample(db, { testId: input.testId, sample });
  return samples;
}

async function issueVerifiedReceipt(db, input) {
  return withTransaction(db, async (tx) => {
    const bound = await binding(tx, input);
    const samples = await resolveSamples(tx, input, bound);
    const observations = samples.map(({ outcome, evidenceRef }) => ({ outcome, evidenceRef }));
    const assessmentRef = await artifacts.put(tx, { scopeId: input.scopeId, kind: 'statistical-assessment',
      content: { testId: input.testId, protocolHash: bound.test.protocol_hash,
        verifierId: input.verifierId, samples } });
    return receipts.issue({ testId: input.testId, protocolHash: bound.test.protocol_hash,
      evaluationSetId: bound.test.evaluation_set_id, verifierId: input.verifierId, assessmentRef, observations });
  });
}

async function verifyProvenance(db, input) {
  const bound = await binding(db, { ...input, verifierId: input.receipt.verifierId });
  const assessment = await artifacts.get(db, { scopeId: input.scopeId, ref: input.receipt.assessmentRef });
  const content = assessment?.content;
  if (assessment?.kind !== 'statistical-assessment' || content?.testId !== input.testId
    || content.protocolHash !== bound.test.protocol_hash || content.verifierId !== input.receipt.verifierId) {
    throw new Error('STATISTICAL_ASSESSMENT_PROVENANCE_REQUIRED');
  }
  const samples = await resolveSamples(db, { ...input, samples: content.samples }, bound);
  const observations = samples.map(({ outcome, evidenceRef }) => ({ outcome, evidenceRef }));
  if (JSON.stringify(observations) !== JSON.stringify(input.receipt.observations)) throw new Error('STATISTICAL_OBSERVATION_PROVENANCE_INVALID');
  return true;
}

module.exports = { registerProtocol, issueVerifiedReceipt, verifyProvenance };

async function requireObservationOrder(db, input, bound) {
  const sequence = await db.get('SELECT rowid AS sequence FROM morph_capability_artifacts WHERE artifact_ref = ?', [input.evidenceRef]);
  if (sequence.sequence <= bound.protocolSequence) throw new Error('EVALUATION_BEFORE_PREREGISTRATION');
  if (sequence.sequence <= bound.reservationSequence) throw new Error('EVALUATION_BEFORE_RESERVATION');
}

async function requireProtocolArtifact(db, protocol) {
  const artifact = await artifacts.get(db, { scopeId: protocol.scope_id, ref: protocol.artifact_ref });
  if (artifact?.kind !== 'statistical-protocol' || artifact.content.verifierId !== protocol.verifier_id
    || artifacts.digest(artifact.content.protocol) !== protocol.protocol_hash) throw new Error('STATISTICAL_PROTOCOL_ARTIFACT_REQUIRED');
  const row = await db.get('SELECT rowid AS sequence FROM morph_capability_artifacts WHERE artifact_ref = ?', [protocol.artifact_ref]);
  return row.sequence;
}
