'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeInput, successfulRun } = require('../src/controllers/neuroGliaStreamController');

const validRequest = () => ({
  missionId: '1b4d2fa0-0d16-4c3f-9a72-38b014cc5ac9',
  producerId: 'f13b3329-9067-4d0c-8363-7dd56dd8dedc',
  eventId: 'c63558c6-caa9-4fd3-bb0b-cf6084c92662',
  eventType: 'BIOLOGICAL_EXECUTION_RECEIPT', payload: { status: 'complete' },
  payloadSha256: 'b'.repeat(64), tick: 4, idempotencyKey: 'event-4', signatureHex: 'a'.repeat(128),
});

test('neuro-glia bridge accepts bounded, signed producer events', () => {
  const input = normalizeInput(validRequest());
  assert.equal(input.missionId, validRequest().missionId);
  assert.equal(input.eventType, 'BIOLOGICAL_EXECUTION_RECEIPT');
  assert.deepEqual(input.payload, { status: 'complete' });
});

test('neuro-glia bridge rejects malformed identity, event, signature, tick, and oversized payloads', () => {
  for (const patch of [
    { missionId: 'arbitrary' }, { producerId: 'arbitrary' }, { eventType: 'UNTRUSTED_EVENT' },
    { eventId: 'arbitrary' }, { payloadSha256: 'wrong' },
    { signatureHex: 'not-a-signature' }, { tick: 1.5 }, { idempotencyKey: '' },
    { payload: { text: 'x'.repeat(1_048_577) } },
  ]) assert.equal(normalizeInput({ ...validRequest(), ...patch }), null);
});

test('neuro-glia bridge fails closed on an unexpected CLI receipt identity', () => {
  const input = normalizeInput(validRequest());
  const tenant = { principalId: 'member', organizationId: 'org', projectId: 'project' };
  const run = { ok: true, json: { success: true, execution_mode: 'experimental', entry: {
    schema: 'genos.mission-neuro-glia-event/v1', mission_id: input.missionId,
    event_id: input.eventId,
    event_type: input.eventType, idempotency_key: input.idempotencyKey,
    tick: input.tick, source: { producer_id: input.producerId, backend_authorization: {
      schema: 'genos.neuro-glia-backend-authorization/v1', principalId: tenant.principalId,
      organizationId: tenant.organizationId, projectId: tenant.projectId, missionId: input.missionId,
      producerId: input.producerId, eventId: input.eventId, eventType: input.eventType,
      tick: input.tick, idempotencyKey: input.idempotencyKey, payloadSha256: input.payloadSha256,
      signatureHex: 'c'.repeat(128),
    } },
  } } };
  assert.equal(successfulRun({ run, input, rustMissionId: input.missionId, tenant }), true);
  const legacy = structuredClone(run);
  delete legacy.json.entry.source.backend_authorization;
  assert.equal(successfulRun({ run: legacy, input, rustMissionId: input.missionId, tenant }), false);
  assert.equal(successfulRun({ run, input, rustMissionId: '90c44d3d-cac2-4326-a4a2-5b11c6c70ae1', tenant }), false);
  assert.equal(successfulRun({ run: { ...run, json: { ...run.json, execution_mode: 'backend-authorized' } }, input, rustMissionId: input.missionId, tenant }), false);
});
