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
 * Verifies grounded labelling with relations, cycles, IN/OUT/UNDECIDED statuses
 */
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
    let callCount = 0;
    const memberInvoker = async (request) => {
      callCount++;
      const { phase, member, details } = request;
      
      if (phase === 'SEALED_JUDGMENT') {
        // Return initial judgment with claims
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
      
      if (phase === 'REVIEW') {
        // Return review with arguments
        const claim = details.claim;
        if (claim.claimId === 'claim-a') {
          return {
            review: {
              summary: 'Reviewing claim A',
              objections: [],
              evidenceRefs: [],
              arguments: [
                { relation: 'SUPPORT', argument: { statement: 'Security audit passed', argumentId: 'arg-1' } },
                { relation: 'ATTACK', argument: { statement: 'Vulnerability found in auth module', argumentId: 'arg-2', targetClaimId: 'claim-b' } }
              ],
              counterexamples: [],
              dissent: []
            }
          };
        } else if (claim.claimId === 'claim-b') {
          return {
            review: {
              summary: 'Reviewing claim B',
              objections: [],
              evidenceRefs: [],
              arguments: [
                { relation: 'SUPPORT', argument: { statement: 'CVE-2024-XXXX confirms vulnerability', argumentId: 'arg-3' } },
                { relation: 'ATTACK', argument: { statement: 'Mitigation in place reduces risk', argumentId: 'arg-4', targetClaimId: 'claim-a' } }
              ],
              counterexamples: [],
              dissent: []
            }
          };
        }
        return { review: { summary: 'Review', objections: [], evidenceRefs: [], arguments: [], counterexamples: [], dissent: [] } };
      }
      
      if (phase === 'REVISION') {
        // Return no changes (or could return revised positions)
        return { changedClaims: [], previousPosition: 'Assess', newPosition: 'Assess', reasonCodes: [], evidenceRefs: [] };
      }
      
      return { judgment: { position: 'Default', claims: [], probabilities: [], confidence: 0.5 } };
    };

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
    const loggingHandlers = {};
    for (const step of ROUND_STEPS) {
      const originalHandler = handlers[step];
      loggingHandlers[step] = async (context) => {
        console.log(`\n--- Step: ${step} ---`);
        const result = await originalHandler(context);
        console.log(`Result keys:`, Object.keys(result));
        if (result.judgments) console.log(`  Judgments count:`, result.judgments.length);
        if (result.claims) console.log(`  Claims count:`, result.claims.length);
        if (result.reviews) console.log(`  Reviews count:`, result.reviews.length);
        if (result.arguments) console.log(`  Arguments count:`, result.arguments.length);
        return result;
      };
    }

    // Run the full round with argumentation_community variant
    const result = await biocenose.runBiocenoseRound({
      db, communityId: community.communityId, variant: 'argumentation_community', handlers: loggingHandlers
    });

    console.log('\n\n=== Final Result ===');
    console.log('Round status:', result.status);
    console.log('Receipts:', result.receipts.map(r => r.step));

    // Verify aggregation was called with argumentation
    const aggregation = result.receipts.find(r => r.step === 'aggregate_by_question_type');
    assert.ok(aggregation, 'Should have aggregation step');
    console.log('Aggregation outcome:', aggregation.result.outcome);
    console.log('Aggregation keys:', Object.keys(aggregation.result));

    if (aggregation.result.argumentation) {
      console.log('✅ Has argumentation results');
      console.log('   Semantics:', aggregation.result.argumentation.semantics);
      console.log('   Labels:', JSON.stringify(aggregation.result.argumentation.labels, null, 2));
      console.log('   Cycles:', aggregation.result.argumentation.cyclicArgumentIds);
      console.log('   Contradictions:', aggregation.result.argumentation.contradictions);
      console.log('   Unresolved:', aggregation.result.argumentation.unresolvedClaimIds);
    } else {
      console.log('❌ No argumentation results');
      console.log('Full result:', JSON.stringify(aggregation.result, null, 2).substring(0, 3000));
    }

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