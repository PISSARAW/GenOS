'use strict';
const values = require('./trinityProvenanceValues');
const traces = require('./trinityTraceEvents');

function assertScope(capsule, expected) {
  const scope = capsule.correlation;
  if (!scope) throw values.failure('TRINITY_CAPSULE_SCOPE_INVALID');
  for (const key of ['missionId', 'worldId', 'workerId', 'runId', 'parentId', 'tenantId']) {
    if ((scope[key] ?? null) !== (expected[key] ?? null)) throw values.failure('TRINITY_CAPSULE_SCOPE_INVALID');
  }
  if (scope.trinityExperimentId !== expected.experimentId) throw values.failure('TRINITY_CAPSULE_SCOPE_INVALID');
}

async function anchor(context, manifest) {
  const capsule = context.genosCapsule;
  if (!capsule?.correlation) return null;
  const seal = await require('./trinityCapsuleSeal').verify(capsule);
  const expected = manifest.payload.correlation;
  assertScope(capsule, expected);
  if (seal.payload.sourceSnapshotHash !== expected.snapshotHash) {
    throw values.failure('TRINITY_CAPSULE_SCOPE_INVALID');
  }
  return traces.append(context.db, { correlation: expected,
    eventId: 'capsule-binding:' + expected.runId, stage: 'capsule_binding', status: 'observed',
    timestamp: manifest.payload.timestamp.value, details: {
      capsuleId: capsule.id, capsuleSealHash: capsule.sealHash, snapshotId: capsule.snapshotId,
      bootstrapMode: capsule.bootstrapMode, fallbackReason: capsule.fallbackReason,
      fileHashes: seal.payload.files, qualification: 'capsule-bytes-and-scope-bound', decisionAuthority: 'none' } });
}

async function assertAnchored(context, manifest) {
  const capsule = context.genosCapsule;
  if (!capsule?.correlation) return null;
  const seal = await require('./trinityCapsuleSeal').verify(capsule);
  assertScope(capsule, manifest.payload.correlation);
  const events = await traces.read(context.db, { missionId: manifest.payload.correlation.missionId });
  const event = events.find(item => item.eventId === 'capsule-binding:' + context.executionRun.id);
  if (!event || event.details.capsuleSealHash !== seal.hash) throw values.failure('TRINITY_CAPSULE_ANCHOR_INVALID');
  return seal;
}

module.exports = { anchor, assertAnchored };
