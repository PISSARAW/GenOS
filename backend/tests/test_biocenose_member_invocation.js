'use strict';

const assert = require('node:assert/strict');
const modelRouter = require('../src/services/modelRouter');
const invocation = require('../src/services/biocenose/runtime/memberInvocationService');

async function run() {
  assert.equal(invocation.defaultTimeoutMs({ constitution: { variant: 'representative_community' } }), 300000);
  assert.equal(invocation.defaultTimeoutMs({ constitution: { variant: 'epistemic_jury' } }), 60000);
  const mixedClaims = invocation.responseFormatFor('SEALED_JUDGMENT', 'hybrid_oracle_community').schema
    .properties.judgment.properties.claims.items;
  assert.ok(mixedClaims.required.includes('type'));
  assert.deepEqual(mixedClaims.properties.type.enum, ['FACTUAL', 'PROBABILISTIC', 'NORMATIVE', 'DESIGN', 'EXPLORATORY']);
  assert.match(invocation.promptFor({ member: { role: 'generator' }, phase: 'SEALED_JUDGMENT', task: 'Judge',
    session: { question: 'Mixed', questionType: 'MIXED' }, constitution: { variant: 'hybrid_oracle_community' } }),
  /For every claim, set type to FACTUAL/);
  const originalGenerate = modelRouter.generate;
  const prompts = [];
  const responses = [
    { text: JSON.stringify({ changedClaims: ['claim-1'], reasonCodes: ['NEW_EVIDENCE'], evidenceRefs: [] }) },
    { text: JSON.stringify({ previousPosition: 'Old', newPosition: 'New', changedClaims: ['claim-1'], reasonCodes: ['NEW_EVIDENCE'], evidenceRefs: [] }) }
  ];
  modelRouter.generate = async (options) => {
    prompts.push(options.prompt);
    return responses.shift();
  };
  try {
    const result = await invocation.invoke({
      phase: 'REVISION', task: 'Revise claims', session: {
        communityId: 'community-1', question: 'Question', questionType: 'FACTUAL', round: 0
      }, member: { memberId: 'member-1', role: 'reviewer', model: 'test-model' },
      details: { initialJudgment: { position: 'Old' }, claims: [{ claimId: 'claim-1', statement: 'Claim' }] }
    });
    assert.equal(result.newPosition, 'New');
    assert.equal(prompts.length, 2);
  assert.match(prompts[1], /newPosition is required/);
  assert.match(prompts[1], /Do not invent facts, evidence references/);
  assert.match(prompts[1], /"previousPosition":"Old","newPosition":"Old"/);
  assert.match(invocation.responseContract('REVIEW'), /QUALIFY\|DEPENDS_ON/);
  } finally {
    modelRouter.generate = originalGenerate;
  }

  const injectedRequests = [];
  const repairedInjection = await invocation.invoke({
    phase: 'REVISION', task: 'Revise claims',
    session: { communityId: 'community-injected', question: 'Question', questionType: 'DESIGN', round: 0 },
    member: { memberId: 'injected-member', role: 'reviewer' },
    details: { initialJudgment: { position: 'Old' }, claims: [{ claimId: 'claim-1', statement: 'Claim' }] },
    memberInvoker: async (request) => {
      injectedRequests.push(request);
      return injectedRequests.length === 1 ? { newPosition: 'Old' }
        : { previousPosition: 'Old', newPosition: 'Old', changedClaims: [], reasonCodes: [], evidenceRefs: [] };
    }
  });
  assert.deepEqual(repairedInjection.changedClaims, []);
  assert.equal(injectedRequests.length, 2);
  assert.match(injectedRequests[1].validationErrors.join('; '), /changedClaims must be an array/);

  let attempts = 0;
  modelRouter.generate = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('Provider returned invalid structured JSON.');
    return { text: JSON.stringify({ changedClaims: [] }) };
  };
  try {
    const result = await invocation.invoke({
      phase: 'REVISION', task: 'Revise claims', session: {
        communityId: 'community-1', question: 'Question', questionType: 'FACTUAL', round: 0
      }, member: { memberId: 'member-1', role: 'reviewer', model: 'test-model' }, details: { claims: [] }
    });
    assert.deepEqual(result.changedClaims, []);
    assert.equal(attempts, 2);
  } finally {
    modelRouter.generate = originalGenerate;
  }

  let invalidReferenceAttempts = 0;
  const observedRoutes = [];
  modelRouter.generate = async () => {
    invalidReferenceAttempts += 1;
    return { provider: 'ollama', servedModel: 'qwen-test', text: JSON.stringify({
      previousPosition: 'Old', newPosition: 'Changed', changedClaims: ['invented-claim'],
      reasonCodes: ['NEW_EVIDENCE'], evidenceRefs: []
    }) };
  };
  try {
    const result = await invocation.invoke({
      phase: 'REVISION', task: 'Revise claims', session: {
        communityId: 'community-1', question: 'Question', questionType: 'FACTUAL', round: 0
      }, constitution: { variant: 'epistemic_jury' },
      member: { memberId: 'member-1', role: 'reviewer', model: 'test-model' },
      details: { initialJudgment: { position: 'Old' }, claims: [{ claimId: 'claim-1', statement: 'Claim' }] },
      onProviderObserved: async (route) => observedRoutes.push(route)
    });
    assert.equal(invalidReferenceAttempts, 2);
    assert.equal(result.newPosition, 'Old', 'an invalid claim reference cannot change the sealed position');
    assert.deepEqual(result.changedClaims, []);
    assert.deepEqual(result.rejectedClaimIds, ['invented-claim']);
    assert.equal(observedRoutes[0].provider, 'ollama');
  } finally {
    modelRouter.generate = originalGenerate;
  }

  const oraclePrompts = [];
  const oracleJudgment = { position: 'Unknown', confidence: 0.5,
    claims: [{ statement: '221 is prime', type: 'FACTUAL', 'verification.kinds': 'formal_proof' }],
    assumptions: [], evidenceRefs: [], unknowns: [], abstentions: [], probabilities: [] };
  modelRouter.generate = async ({ prompt }) => {
    oraclePrompts.push(prompt);
    if (oraclePrompts.length === 2) oracleJudgment.claims[0] = {
      statement: '221 is prime', type: 'FACTUAL', verification: { kinds: ['formal_proof'] }
    };
    return { provider: 'ollama', text: JSON.stringify({ judgment: oracleJudgment }) };
  };
  try {
    const result = await invocation.invoke({ phase: 'SEALED_JUDGMENT', task: 'Judge',
      session: { communityId: 'oracle-community', question: 'Is 221 prime?', questionType: 'MIXED', round: 0 },
      constitution: { variant: 'hybrid_oracle_community' },
      member: { memberId: 'oracle-member', role: 'generator', model: 'test-model' } });
    assert.equal(oraclePrompts.length, 2);
    assert.match(oraclePrompts[1], /verification\.kinds must be a nonempty string array/);
    assert.deepEqual(result.judgment.claims[0].verification.kinds, ['formal_proof']);
  } finally {
    modelRouter.generate = originalGenerate;
  }
}

run().then(() => process.stdout.write('Biocenose member invocation checks: PASS\n')).catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
