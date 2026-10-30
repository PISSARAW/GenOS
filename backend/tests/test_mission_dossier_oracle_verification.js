'use strict';
const assert = require('node:assert/strict');
const store = require('../src/services/biologicalWorkerStore');
const gate = require('../src/services/epistemic/nativeOracleGate');
const provenance = require('../src/services/gvxMissionProvenance');
const verify = require('../src/services/missionDossierOracleVerification');

async function main() {
  const original = { binding: store.binding, observations: store.observations,
    historical: gate.historical, agentScope: provenance.agentScope };
  const scope = { organizationId: 'org', projectId: 'project', entityId: 'worker' };
  const report = { outcome: 'success', claims: [{ statement: 'answer', evidence: ['mission'] }] };
  const ref = { hash: 'hash', eventId: 'event' };
  const originalEvent = { eventType: 'AGENT_COMPLETED', payload: { evidenceReport: report, nativeOracleRef: ref } };
  const dossierEvent = { executionRunId: 'run', eventType: 'AGENT_COMPLETED', evidenceReport: report, nativeOracleRef: ref };
  store.binding = async () => ({ missionId: 'mission', workerId: 'worker' });
  store.observations = async () => [{ applied: true, event: originalEvent }];
  provenance.agentScope = async () => scope;
  gate.historical = async (_db, input) => {
    assert.equal(input.event, originalEvent);
    return { proof: { attestation: { value: { accepted: true, domain: 'model_subset_sum', scope } } } };
  };
  try {
    const input = { db: {}, missionId: 'mission', workerId: 'worker', event: dossierEvent };
    assert.equal(await verify.trustedEvent(input), true);
    assert.equal(await verify.trustedEvent({ ...input, missionId: 'other' }), false);
    assert.equal(await verify.trustedEvent({ ...input, workerId: 'other' }), false);
    assert.equal(await verify.trustedEvent({ ...input, event: { ...dossierEvent, nativeOracleRef: { ...ref, hash: 'forged' } } }), false);
    provenance.agentScope = async () => ({ ...scope, projectId: 'other' });
    assert.equal(await verify.trustedEvent(input), false);
    provenance.agentScope = async () => scope;
    gate.historical = async () => ({ proof: { attestation: { value: { accepted: true, domain: 'worker_artifact', scope } } } });
    assert.equal(await verify.trustedEvent(input), false);
    gate.historical = async () => { throw new Error('invalid proof'); };
    const filtered = await verify.validateDossiers({}, 'mission', [{ workerId: 'worker', events: [dossierEvent] }]);
    assert.equal(filtered[0].events[0].nativeOracleRef, null);
  } finally {
    Object.assign(store, { binding: original.binding, observations: original.observations });
    gate.historical = original.historical;
    provenance.agentScope = original.agentScope;
  }
  console.log('Mission dossier oracle verification: PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
