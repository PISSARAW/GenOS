'use strict';
const assert = require('node:assert/strict');
const service = require('../src/services/axolotlRegenerationService');
const store = require('../src/services/axolotlStateStore');
const { fixture, planInput } = require('./axolotlTestHarness');
async function main() {
  const test = await fixture();
  let db = test.db;
  try {
    const input = planInput(db);
    input.currentTopology.knowledge.rule = 'damaged';
    input.cognitiveScope = ['rule'];
    const plan = await service.planRegeneration(input);
    const context = { db, orchestratorId: 'parent', sessionId: plan.sessionId };
    await assert.rejects(service.prepareCognitiveLearning(plan.sessionId, { ...context,
      candidates: [{ id: 'outside', key: 'other', content: 'unsafe' }] }), { code: 'AXOLOTL_COGNITIVE_SCOPE_DENIED' });
    await service.prepareCognitiveLearning(plan.sessionId, { ...context, candidates: [
      { id: 'wrong', key: 'rule', content: 'unsafe', sourceRefs: ['hypothesis-1'] },
      { id: 'right', key: 'rule', content: 'safe', sourceRefs: ['hypothesis-2'] }
    ] });
    const result = await service.executeRegeneration({ db, sessionId: plan.sessionId, context: { orchestratorId: 'parent',
      evaluateCognitiveCandidate: () => ({ passed: true, evidenceRefs: ['untrusted'] }), observedCost: { tokens: 999999 } } });
    assert.equal(result.success, true);
    assert.equal(result.cost.tokens, undefined);
    assert.equal(result.newTopology.knowledge.rule, 'safe');
    let session = await service.getRegenerationSession(plan.sessionId, context);
    assert.equal(session.learning.candidates[0].status, 'rejected_candidate');
    assert.equal(session.learning.candidates[1].status, 'supported_candidate');
    assert.equal(session.learning.experiments.length, 3);
    await db.close();
    db = await test.reopen();
    const request = { db, sessionId: plan.sessionId, orchestratorId: 'parent', candidateId: 'right' };
    const promotions = await Promise.all([service.promoteCognitiveCandidate(request), service.promoteCognitiveCandidate(request)]);
    assert.equal(promotions[0].traitId, promotions[1].traitId);
    assert.equal((await db.get('SELECT COUNT(*) AS count FROM learned_traits')).count, 1);
    await assert.rejects(service.promoteCognitiveCandidate({ ...request, candidateId: 'wrong' }), { code: 'COGNITIVE_CANDIDATE_UNSUPPORTED' });
    session = await service.getRegenerationSession(plan.sessionId, { db, orchestratorId: 'parent' });
    const originalProof = await db.get('SELECT payload_json FROM axolotl_evidence WHERE id = ?', session.evidenceRef);
    await db.run('UPDATE axolotl_evidence SET payload_json = ? WHERE id = ?', '{}', session.evidenceRef);
    await assert.rejects(service.promoteCognitiveCandidate(request), { code: 'AXOLOTL_EVIDENCE_TAMPERED' });
    await db.run('UPDATE axolotl_evidence SET payload_json = ? WHERE id = ?', originalProof.payload_json, session.evidenceRef);
    await service.rollbackRegeneration({ db, sessionId: plan.sessionId, orchestratorId: 'parent', reason: 'rollback' });
    const trait = await db.get('SELECT trait_data_json FROM learned_traits');
    assert.equal(JSON.parse(trait.trait_data_json).active, false);
    console.log('Axolotl cognitive learning, rejection, durable evidence, promotion and rollback: passed');
  } finally { await db.close(); await test.cleanup(); }
}
main().catch((failure) => { console.error(failure); process.exitCode = 1; });