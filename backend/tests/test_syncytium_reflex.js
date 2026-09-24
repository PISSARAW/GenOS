'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');

async function main() {
  const session = await syncytium.createSession('Independent reflex channel.', {
    nuclearDomains: [
      { domainId: 'security', members: ['guard'], mayVeto: ['SECURITY_CRITICAL', 'STOP'] },
      { domainId: 'workers', members: ['worker'], subscriptions: ['reflex.*'] }
    ]
  });

  const emitted = await syncytium.publishReflexSignal(session.sessionId, {
    signalId: 'signal-1', type: 'SECURITY_CRITICAL', actorId: 'guard', sourceOpId: 'operation-9',
    metadata: { severity: 'critical', reason: 'credential exposure', detail: { secret: 'discarded' } }
  });
  assert.deepEqual(emitted.recipients, ['security', 'workers']);
  assert.equal(emitted.delivery, 'IMMEDIATE');
  assert.equal(emitted.signal.metadata.detail, undefined);
  assert.deepEqual((await syncytium.publishReflexSignal(session.sessionId, {
    signalId: 'signal-1', type: 'SECURITY_CRITICAL', actorId: 'guard'
  })).duplicate, true);

  const regular = await syncytium.snapshot(session.sessionId);
  const worker = await syncytium.snapshot(session.sessionId, { domainId: 'workers' });
  const audit = await syncytium.snapshot(session.sessionId, { domainId: 'audit' }).catch((error) => error);
  assert.equal(regular.shared.logSize, 0);
  assert.equal(regular.reflex.signals.length, 1);
  assert.equal(worker.reflex.signals.length, 1);
  assert.equal(audit.code, 'SYNCYTIUM_DOMAIN_UNKNOWN');

  const fluxSession = await syncytium.createSession('Cytoplasm is only physiological context.');
  const flux = await syncytium.applyOperation(fluxSession.sessionId, {
    opId: 'large-flux', kind: { type: 'flux_Ca2+', deltaFlux: 1000 }
  });
  assert.equal(flux.consistency.verdict, 'consistent');
  assert.equal(flux.consistency.physiology, 'unstable');
}

main().then(() => console.log('Syncytium reflex checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
