'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const biocenose = require('../src/services/biocenoseService');
const store = require('../src/services/biocenose/communityStore');
const protocolHandlers = require('../src/services/biocenose/runtime/protocolHandlers');
const { ROUND_STEPS } = require('../src/services/biocenose/runtime/deliberationPlanner');

/**
 * Test argumentation_community variant through full runtime
 * Verifies persisted SUPPORT/ATTACK relations and grounded unresolved labels.
 * Injected judgments and verifier receipts are fixtures, not real security evidence.
 */
function makeSealedJudgment() {
  return {
    judgment: {
      position: 'Assess the argument structure',
      claims: [
        { statement: 'Claim A: The system is secure', claimId: 'claim-a' },
        { statement: 'Claim B: The system has vulnerabilities', claimId: 'claim-b' }
      ],
      probabilities: [],
      assumptions: [],
      evidenceRefs: [],
      unknowns: [],
      abstentions: [],
      confidence: 0.7
    }
  };
}

function makeReviewArguments(claimId) {
  return [
    { relation: 'SUPPORT', argument: { statement: 'Fixture support for the assigned claim' } },
    { relation: 'ATTACK', argument: { statement: 'Fixture objection to the assigned claim', targetClaimId: claimId } }
  ];
}

function makeReviewResponse(details) {
  const claim = details.claim;
  assert.equal(typeof claim.claimId, 'string');
  assert.ok(claim.claim.statement);
  return {
    summary: 'Reviewing ' + claim.claim.statement,
    objections: [],
    evidenceRefs: [],
    arguments: makeReviewArguments(claim.claimId),
    counterexamples: [],
    dissent: []
  };
}

function makeRevisionResponse() {
  return { changedClaims: [], previousPosition: 'Assess', newPosition: 'Assess', reasonCodes: [], evidenceRefs: [] };
}

function makeMemberInvoker() {
  return async (request) => {
    const { phase, context: details } = request;
    if (phase === 'SEALED_JUDGMENT') return makeSealedJudgment();
    if (phase === 'REVIEW') return makeReviewResponse(details);
    if (phase === 'REVISION') return makeRevisionResponse();
    return { judgment: { position: 'Default', claims: [], probabilities: [], confidence: 0.5 } };
  };
}

function makeLoggingHandlers(handlers) {
  const loggingHandlers = {};
  for (const step of ROUND_STEPS) {
    const originalHandler = handlers[step];
    loggingHandlers[step] = async (context) => {
      console.log(`\n--- Step: ${step} ---`);
      const result = await originalHandler(context);
      console.log(`Result keys:`, Object.keys(result));
      return result;
    };
  }
  return loggingHandlers;
}

function assertArgumentationAggregation(aggregation) {
  assert.ok(aggregation, 'Should have aggregation step');
  const { argumentation } = aggregation.result;
  assert.ok(argumentation, 'Missing argumentation cannot be reported as a pass');
  assert.equal(argumentation.semantics, 'grounded');
  assert.equal(argumentation.labels.length, 2);
  assert.ok(Object.values(argumentation.graphLabels).includes('IN'));
  assert.ok(Object.values(argumentation.graphLabels).includes('OUT'));
  assert.ok(argumentation.unresolvedClaimIds.length > 0);
  assert.equal(aggregation.result.outcome, 'ARGUMENTS_UNRESOLVED');
}

async function testArgumentationCommunityRuntime() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    // Create community with argumentation_community variant
    const community = await biocenose.prepareCommunity({
      db, orchestratorId: 'orchestrator', mission: 'Evaluate this argument map with claims and relations',
      options: { variant: 'argumentation_community', population: { generators: 2, reviewers: 2, verifiers: 1 } }
    });

    // Verify constitution has the correct variant
    const constitution = await store.latestConstitution(db, community.communityId);
    assert.equal(constitution.constitution.variant, 'argumentation_community');

    // Create mock memberInvoker that returns appropriate responses for each phase
    const memberInvoker = makeMemberInvoker();

    // Create handlers using protocol handlers with our mock invoker
    const handlers = protocolHandlers.createHandlers({ 
      db, 
      communityId: community.communityId, 
      actorId: 'orchestrator',
      memberInvoker,
      timeoutMs: 30000,
      maxTokens: 2500,
      isTrustedReceipt: () => true,
      verificationExecutor: async () => ({ status: 'VERIFIED', receiptId: 'mock-receipt' })
    });

    // Wrap handlers to add logging
    const loggingHandlers = makeLoggingHandlers(handlers);

    // Run the full round with argumentation_community variant
    const result = await biocenose.runBiocenoseRound({
      db, communityId: community.communityId, variant: 'argumentation_community', handlers: loggingHandlers
    });

    console.log('\n\n=== Final Result ===');
    console.log('Round status:', result.status);
    console.log('Receipts:', result.receipts.map(r => r.step));
    const graph = result.receipts.find(r => r.step === 'build_argument_graph');
    assert.ok(graph.result.arguments.length >= 4, 'Both claims must receive persisted arguments');
    const claims = result.receipts.find(r => r.step === 'build_claim_graph').result.claims;
    assert.equal(claims.length, 2);
    for (const claim of claims) {
      const assigned = graph.result.arguments.filter(item => item.claimId === claim.claimId);
      assert.ok(assigned.some(item => item.relation === 'SUPPORT'));
      assert.ok(assigned.some(item => item.relation === 'ATTACK'));
    }

    // Verify aggregation was called with argumentation
    const aggregation = result.receipts.find(r => r.step === 'aggregate_by_question_type');
    assertArgumentationAggregation(aggregation);

    console.log('✅ argumentation_community runtime test passed');

  } finally {
    await db.close();
  }
}

testArgumentationCommunityRuntime().catch(err => {
  console.error('Test failed:', err);
  console.error(err.stack);
  process.exit(1);
});
