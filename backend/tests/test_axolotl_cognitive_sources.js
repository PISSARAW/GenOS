'use strict';
const assert = require('node:assert/strict');
const service = require('../src/services/axolotlRegenerationService');
const { fixture, planInput } = require('./axolotlTestHarness');
async function main() {
  const test = await fixture();
  const db = test.db;
  try {
    const input = { ...planInput(db), cognitiveScope: ['rule'], cognitiveSourceRefs: [{ memoryId: 'source', key: 'rule' }] };
    input.currentTopology.knowledge.rule = 'damaged';
    await assert.rejects(service.planRegeneration({ ...input, cognitiveSourceRefs: [{ memoryId: 'foreign', key: 'rule' }] }), { code: 'AXOLOTL_COGNITIVE_SOURCE_DENIED' });
    await assert.rejects(service.planRegeneration({ ...input, cognitiveSourceRefs: [{ memoryId: 'purged', key: 'rule' }] }), { code: 'AXOLOTL_COGNITIVE_SOURCE_DENIED' });
    const plan = await service.planRegeneration(input);
    const result = await service.executeRegeneration({ db, sessionId: plan.sessionId, context: { orchestratorId: 'parent' } });
    assert.equal(result.success, true);
    assert.equal(result.newTopology.knowledge.rule, 'safe');
    const session = await service.getRegenerationSession(plan.sessionId, { db, orchestratorId: 'parent' });
    assert.equal(session.learning.candidates[0].status, 'supported_candidate');
    assert.match(session.learning.candidates[0].sourceRefs[0].reference, /^episodic_memory:source$/);
    console.log('Axolotl cognitive reconstruction from owner memory and source confinement: passed');
  } finally { await db.close(); await test.cleanup(); }
}
main().catch((failure) => { console.error(failure); process.exitCode = 1; });
