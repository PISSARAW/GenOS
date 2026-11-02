'use strict';

const { digest } = require('../../src/services/evidenceProtocol/canonical');
const fixture = require('./gqwfExchangeProcessFixtures.cjs');

function query(candidate) {
  return { scope: fixture.SCOPE, missionId: fixture.MISSION,
    conversationId: fixture.CONVERSATION, candidateId: candidate.candidateId };
}

async function step(net, candidate, type) {
  const state = type === 'OFFER_CANDIDATE' ? null : await net.nodes.receiver.request('state', query(candidate));
  const payload = state ? { candidateId: candidate.candidateId, candidateDigest: digest(candidate) } : { candidate };
  const message = fixture.message(type, payload, { causes: state ? [state.lastMessageId] : [] });
  const result = await net.nodes.receiver.request('candidate', message, fixture.PRODUCER);
  return { message, result };
}

async function prepare(net, candidate) {
  for (const type of ['OFFER_CANDIDATE', 'REQUEST_EVIDENCE', 'PREPARE_PROMOTION']) await step(net, candidate, type);
}

async function race(net, candidates) {
  const messages = await Promise.all(candidates.map(async candidate => {
    const state = await net.nodes.receiver.request('state', query(candidate));
    return fixture.message('COMMIT', { candidateId: candidate.candidateId, candidateDigest: digest(candidate) },
      { causes: [state.lastMessageId] });
  }));
  const results = await Promise.allSettled(messages.map(message =>
    net.nodes.receiver.request('candidate', message, fixture.PRODUCER)));
  return { messages, results };
}

module.exports = { query, step, prepare, race };
