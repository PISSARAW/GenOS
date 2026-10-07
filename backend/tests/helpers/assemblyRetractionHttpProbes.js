'use strict';

const assert = require('node:assert/strict');

async function qualify(spec, request) {
  const view = await request(spec, `/api/product-proofs/consumer-runs/${spec.run.id}`);
  const source = view.body.provenance[0];
  const endpoint = `/api/product-proofs/assemblies/${source.assemblyId}/retract`;
  const body = { expectedAssemblyHash: source.currentAssurance.assemblyHash,
    rationale: 'Controlled source retraction after independent review.', actorId: 'forged-body-actor' };
  assert.equal((await fetch(`${spec.url}${endpoint}`, { method: 'POST' })).status, 401);
  assert.equal((await request(spec, endpoint, { body })).status, 403, 'operator cannot withdraw source assurance');
  await spec.db.run("UPDATE access_keys SET role='admin' WHERE id='b06-key'");
  assert.equal((await request(spec, endpoint, { body, project: 'b06-other' })).status, 404);
  assert.equal((await request(spec, endpoint, { body: { ...body, expectedAssemblyHash: 'stale' } })).status, 409);
  const first = await request(spec, endpoint, { body });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.status, 'retracted');
  assert.equal(first.body.actorId, 'b06-key', 'author comes from the authenticated principal');
  const replay = await request(spec, endpoint, { body });
  assert.deepEqual(replay, first);
  assert.equal((await request(spec, endpoint, { body: { ...body, rationale: 'Changed rationale' } })).status, 409);
  const after = await request(spec, `/api/product-proofs/consumer-runs/${spec.run.id}`);
  assert.equal(after.status, 200, JSON.stringify(after.body));
  assert.equal(after.body.run.status, 'completed');
  assert.equal(after.body.provenance[0].assemblyAccepted, true);
  assert.equal(after.body.provenance[0].currentAssurance.status, 'retracted');
  assert.equal(after.body.provenance[0].memories[0].fidelity.reason, 'AEIS_ASSEMBLY_RETRACTED');
  console.log('Assembly retraction HTTP: authorization, tenant isolation, authenticated author, stable replay and historical inspection passed.');
}

module.exports = { qualify };
