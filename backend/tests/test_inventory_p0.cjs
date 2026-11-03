'use strict';

const assert = require('node:assert/strict');
const registry = require('../src/services/ontogenesis/canonicalConceptRegistry');
const fixture = require('./helpers/gqelProgressFixture.cjs');

function publication() {
  const [alias, canonical] = registry.resolveConceptReferences(['morphogenèse', 'morphogenese'], 'a_team');
  assert.equal(alias.publication.key, canonical.publication.key);
  assert.equal(alias.lifecycle.qualified, null);
  assert.equal(alias.lifecycle.activated, null);
  const [wrongVersion, wrongNamespace, missing] = registry.resolveConceptReferences([
    { id: 'morphogenese', version: 2 }, { id: 'morphogenese', namespace: 'philosophy' }, 'absent-zzzz'
  ], 'a_team');
  assert.equal(wrongVersion.executable, false);
  assert.equal(wrongNamespace.available, false);
  assert.equal(missing.lifecycle.declared, false);
}

async function obligations() {
  const contract = fixture.contract();
  const request = { schema: 'genos.quality-repair-request/v1', attempt: 1,
    unverifiedCriteria: ['brief_coverage'] };
  const prompts = [], events = [];
  const result = await fixture.execute({ contract, planScenes: false, repairObligations: request,
    generator: async input => { prompts.push(input.prompt); return fixture.reply(fixture.GOOD); },
    onCheckpoint: async session => { events.push(...session.events); } });
  assert.ok(prompts[0].includes('brief_coverage'));
  assert.ok(events.some(event => event.type === 'REPAIR_OBLIGATIONS_ACCEPTED'));
  assert.equal(result.promoted, true);
  const rejected = await fixture.execute({ contract,
    repairObligations: { ...request, unverifiedCriteria: ['invented'] } });
  assert.equal(rejected.promoted, false);
  assert.equal(rejected.session.budget.calls, 0);
  assert.equal(rejected.terminalError.code, 'GQEL_REPAIR_OBLIGATIONS_INVALID');
}

async function main() { publication(); await obligations(); console.log('Inventory P0: PASS (bounded synthetic controller probes).'); }
main().catch(error => { console.error(error); process.exitCode = 1; });
