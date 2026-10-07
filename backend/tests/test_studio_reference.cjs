'use strict';
const assert = require('node:assert/strict');
const { withFixture, writeRefusals } = require('./helpers/studioGenosFixture.cjs');
const { request } = require('./helpers/studioRequest.cjs');

async function catalogs(spec, root) {
  const expected = require('../src/services/ontogenesis/canonicalConceptInventory').entries();
  const initial = await request(spec, root + '?namespace=canonical&limit=100');
  assert.equal(initial.status, 200);
  assert.equal(initial.value.total, expected.length);
  const items = [...initial.value.items];
  for (let offset = 100; offset < expected.length; offset += 100) {
    const page = await request(spec, root + '?namespace=canonical&limit=100&offset=' + offset + '&catalogHash=' + initial.value.catalogHash);
    assert.equal(page.status, 200);
    items.push(...page.value.items);
  }
  assert.deepEqual(items.map(item => item.id).sort(), expected.map(item => item.domain + ':' + item.id).sort());
  assert.equal((await request(spec, root + '?catalogHash=stale')).status, 409);
  assert.equal((await request(spec, root + '?offset=-1')).status, 400);
  assert.equal((await request(spec, root + '?limit=101')).status, 400);
  assert.equal((await request(spec, root + '?namespace=unknown')).status, 400);
  assert.equal((await request(spec, root + '?namespace=runtime')).status, 200);
  const found = await request(spec, root + '?namespace=philosophy&q=logic.propositional');
  assert.equal(found.value.items[0].id, 'logic.propositional');
  const detail = await request(spec, root + '/concept?namespace=philosophy&id=logic.propositional');
  assert.equal(detail.status, 200);
  assert.equal(detail.value.contract.runtimeAuthority, false);
  assert.equal(detail.value.runtimeVerified, false);
  assert.equal((await request(spec, root + '/concept?id=unknown')).status, 404);
  assert.equal((await request(spec, root, { project: 'b06-other' })).status, 404);
}

async function logic(spec, root) {
  for (const [formula, classification] of [['A|!A', 'tautology'], ['A&!A', 'contradiction'], ['A>B', 'contingency']]) {
    const result = await request(spec, root + '/logic', { body: { formula } });
    assert.equal(result.status, 200);
    assert.equal(result.value.classification, classification);
    assert.equal(result.value.externalFactsVerified, false);
    assert.equal(result.value.promotionEligible, false);
    const memory = await request(spec, '/api/studio/memories/' + result.value.analysisId);
    assert.equal(memory.value.memory.integrityChecked, true);
  }
  assert.equal((await request(spec, root + '/logic', { body: { formula: 'A|B|C|D|E|F|G|H|I' } })).status, 400);
  assert.equal((await request(spec, root + '/logic', { body: { formula: 'A+' } })).status, 400);
  assert.equal((await request(spec, root + '/logic', { body: { formula: '(A' } })).status, 400);
  await writeRefusals(spec, root + '/logic');
}
withFixture(async spec => {
  const root = '/api/studio/agents/' + spec.settings.agent + '/reference';
  await catalogs(spec, root);
  await logic(spec, root);
  console.log('Studio reference: full canonical pagination, runtime/philosophy contracts, real truth tables and bounded refusal states passed.');
}).catch(error => { console.error(error); process.exitCode = 1; });
