'use strict';

const assert = require('node:assert/strict');
const contract = require('./contract.cjs');
const store = require('../../backend/src/services/biologicalWorkerStore');
const journal = require('../../backend/src/services/epistemic/nativeOracleJournal');
const observation = require('../../backend/src/services/agow/missionObservationContract');

async function measurement(db, record) {
  if (record.status !== 'verified') return null;
  const events = await store.observations(db, record.binding.runId);
  const terminal = events.find((item) => item.event.eventType === 'AGENT_COMPLETED')?.event;
  assert.ok(terminal, 'A measured native loss requires the canonical terminal event');
  const input = { db, binding: record.binding, event: terminal,
    eventIdentity: observation.eventIdentity(terminal, record.binding) };
  const result = await require('../../backend/src/services/agow/nativeMissionOutcomeVerifier').verify(input);
  const normalized = observation.measurement(result, input);
  assert.equal(contract.digest(normalized), record.observation.measurementHash);
  return normalized;
}

async function costs(db, request) {
  const allocation = await journal.read(db, { ...request, kind: 'reservation' });
  if (!allocation) return null;
  const current = await require('../../backend/src/services/epistemic/nativeOracleExecutionJournal').costs(db, { allocation });
  const attestation = await journal.read(db, { ...request, kind: 'attestation' });
  if (attestation) assert.equal(contract.digest(current), contract.digest(attestation.value.costs));
  return current;
}

async function read(db, reference) {
  const record = (await require('../../backend/src/services/agow/missionObservationService')
    .list({ db, agentId: reference.agentId })).find((item) => item.binding.runId === reference.runId);
  assert.ok(record, 'The native mission must have its own AGOW observation binding');
  const { bindingHash, ...binding } = record.binding;
  assert.equal(bindingHash, contract.digest(binding));
  assert.equal(binding.measurementContract, 'genos.agow.native-subset-outcome/v2');
  const run = await db.get('SELECT status FROM strategy_execution_runs WHERE id=? AND agent_id=?',
    reference.runId, reference.agentId);
  assert.ok(run);
  const authority = await require('../../backend/src/services/missionEnvelopeAuthority').read(db, reference.runId);
  const sealed = await store.binding(db, reference.runId);
  await campaignBinding(db, { sealed, reference, scope: authority.envelope.scope });
  const checked = await measurement(db, record);
  return { runId: reference.runId, agentId: reference.agentId, runStatus: run.status,
    manifestHash: reference.manifestHash, caseId: reference.caseId, condition: reference.condition,
    startedAt: record.startedAt, observationStatus: record.status,
    controlAuthority: binding.controlAuthority,
    methodHash: contract.digest(sealed.genome.workerContract.mission.methodContract),
    limits: authority.envelope.limits, nativeRevalidated: checked !== null,
    loss: checked?.metrics.realizedLoss ?? null, evidenceRefs: checked?.evidenceRefs ?? [],
    costs: await costs(db, { ...reference, scope: authority.envelope.scope }) };
}

async function campaignBinding(db, input) {
  assert.equal(input.sealed?.genome.workerContract?.mission?.objective,
    contract.mission(input.reference), 'native-campaign-binding-required');
  const request = { runId: input.reference.runId, agentId: input.reference.agentId, scope: input.scope };
  const attestation = await journal.read(db, { ...request, kind: 'attestation' });
  assert.ok(attestation, 'native-campaign-attestation-required');
  const subject = await require('../../backend/src/services/epistemic/nativeOracleDomains').load(db, request);
  assert.equal(require('../../backend/src/services/trinityProvenanceValues').digest(subject),
    attestation.value.subjectHash, 'native-campaign-subject-mismatch');
}

module.exports = { read };
