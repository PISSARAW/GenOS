'use strict';

const { digest } = require('../evidenceProtocol/canonical');
const { withTransaction } = require('../../db');
const { CandidatePromotion } = require('../gqwfExchange/promotion');
const { environmentDigest } = require('../gqwfExchange/qualification');
const context = require('./context');
const worlds = require('./gqwfWorld');
const proof = require('./gqwfProof');

const POLICY = { policyId: 'mission-native-commonjs-syntax', version: '1', allowedOrigins: ['isolated'],
  verifierRefs: ['mission-native-node-syntax'] };
const HEAD = 'mission-runtime';

async function authorization(session, request) {
  await context.assertCurrent(session.binding);
  if (request.candidateDigest !== digest(session.candidate)) throw new Error('MISSION_GQWF_CANDIDATE_AUTHORITY_MISMATCH');
  if (request.stage !== 'COMMIT') {
    if (session.mode !== 'prepare') throw new Error('MISSION_GQWF_PROMOTION_GATE_REQUIRED');
    require('../strategyPromotionGate').assertPromotionGate(session.promotion.contract, session.gateContext);
    return true;
  }
  const journal = await require('../promotionExecutionJournal').read(session.binding.db, session.binding.runId);
  if (!journal || journal.phase !== 'reserved' || journal.payload.promotion.agentId !== session.binding.agentId ||
    digest(journal.payload.promotion.gqwfProtocol) !== digest(session.descriptor)) {
    throw new Error('MISSION_GQWF_SIGNED_RESERVED_INTENT_REQUIRED');
  }
  return true;
}

async function create(session) {
  await withTransaction(session.binding.db, async () => {
    session.promotionProtocol = new CandidatePromotion({ db: session.binding.db, workspaceId: session.binding.workspaceId,
      deferCatalogCheckpoint: session.mode === 'reserved',
      policy: POLICY, authorize: request => worlds.authorize(session, request),
      verifiedWorld: query => session.exchange.verifiedWorld(query),
      verifyEvidence: request => proof.verify(session, request), authorizePromotion: request => authorization(session, request),
      assertSafeCas: () => session.exchange.assertSafeCas() });
    await session.promotionProtocol.ready;
  });
  return session.promotionProtocol;
}

function candidate(metadata, world) {
  return { candidateId: `${metadata.runId}:candidate`, worldId: world.worldId, worldDigest: digest(world),
    rootHash: world.rootHash, closureHash: world.closureHash, baseHash: metadata.baseHash, baseGeneration: metadata.baseGeneration,
    headName: HEAD, environmentDigest: environmentDigest(world), predicate: { command: world.closure.command, expectedExitCode: 0 },
    policy: { policyId: POLICY.policyId, version: POLICY.version }, evidenceRefs: [] };
}

function descriptor(session, state) {
  const value = session.candidate;
  return { runId: session.binding.runId, workspaceId: session.binding.workspaceId,
    conversationId: session.conversationId, candidateId: value.candidateId, candidateDigest: digest(value),
    worldDigest: value.worldDigest, rootHash: value.rootHash, baseHash: value.baseHash, baseGeneration: value.baseGeneration,
    headName: value.headName, policyDigest: digest(POLICY), evidenceDigest: state.evidence.receiptDigest,
    externalEffectsAuthorized: false };
}

async function prepare(session, metadata) {
  const world = metadata.candidateWorld;
  session.candidate = candidate(metadata, world);
  session.conversationId = `gqwf:${world.worldId}`;
  const offered = session.exchange.store.state({ scope: session.binding.scope, missionId: session.binding.missionId,
    conversationId: session.conversationId, worldId: world.worldId, worldDigest: digest(world) });
  let previous;
  for (const type of ['OFFER_CANDIDATE', 'REQUEST_EVIDENCE', 'PREPARE_PROMOTION']) {
    const payload = type === 'OFFER_CANDIDATE' ? { candidate: session.candidate }
      : { candidateId: session.candidate.candidateId, candidateDigest: digest(session.candidate) };
    const frame = worlds.frame(session, { type, payload, conversationId: session.conversationId, previous,
      createdAt: offered.offerMessage.createdAt, expiresAt: offered.offerMessage.expiresAt });
    await session.promotionProtocol.apply(frame); previous = frame.messageId;
  }
  const query = { scope: session.binding.scope, missionId: session.binding.missionId,
    conversationId: session.conversationId, candidateId: session.candidate.candidateId };
  const state = await session.promotionProtocol.state(query);
  const head = await session.promotionProtocol.head({ scope: session.binding.scope, name: HEAD });
  if (head.rootHash !== metadata.baseHash || head.generation !== metadata.baseGeneration) throw new Error('MISSION_GQWF_BASE_REEVALUATION_REQUIRED');
  return descriptor(session, state);
}

module.exports = { HEAD, POLICY, create, candidate, descriptor, prepare };
