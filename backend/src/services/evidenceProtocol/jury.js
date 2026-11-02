'use strict';

const { digest } = require('./canonical');
const { aggregateGroups } = require('./juryGroups');
const { HASH, identifier, normalizeParticipants, boundedContext, validReveal, normalizePolicy } = require('./juryValidation');

const clone = (value) => JSON.parse(JSON.stringify(value));

function commitmentFor(descriptor, reveal) {
  return digest({ profile: 'genos.evidence.jury/commit/v1', ...descriptor, ...validReveal(reveal) });
}

class BlindJury {
  #round;
  #commitments = Object.create(null);
  #reveals = Object.create(null);

  constructor(options) {
    const context = boundedContext(options.context, options.maxContextBytes);
    this.#round = {
      profile: 'genos.evidence.jury/v1', juryId: identifier(options.juryId), context,
      contextDigest: digest(context), participants: normalizeParticipants(options.participants),
    };
  }

  descriptor() {
    return {
      juryId: this.#round.juryId, contextDigest: this.#round.contextDigest,
      rosterDigest: digest(this.#round.participants),
    };
  }

  context() { return clone(this.#round.context); }

  #participant(id) {
    identifier(id);
    if (!this.#round.participants.some((item) => item.agentId === id)) {
      throw new Error('Unknown jury participant.');
    }
  }

  commit(request) {
    this.#participant(request.verifierId);
    if (!HASH.test(request.commitment)) throw new Error('Invalid jury commitment digest.');
    const previous = this.#commitments[request.verifierId];
    if (previous && previous !== request.commitment) throw new Error('Conflicting jury commitment.');
    if (Object.keys(this.#reveals).length && !previous) throw new Error('Jury reveal phase already opened.');
    this.#commitments[request.verifierId] = request.commitment;
    return { committed: true, verifierId: request.verifierId };
  }

  reveal(request) {
    this.#participant(request.verifierId);
    if (Object.keys(this.#commitments).length !== this.#round.participants.length) {
      throw new Error('Every jury commitment is required before any reveal.');
    }
    const value = validReveal(request);
    if (commitmentFor(this.descriptor(), value) !== this.#commitments[value.verifierId]) {
      throw new Error('Jury reveal does not match committed verdict, nonce or context.');
    }
    const previous = this.#reveals[value.verifierId];
    if (previous && digest(previous) !== digest(value)) throw new Error('Conflicting jury reveal.');
    this.#reveals[value.verifierId] = value;
    return { applied: true, verifierId: value.verifierId };
  }

  aggregate(policy) {
    if (policy === undefined) throw new Error('A minSupportGroups policy is required.');
    const acceptedPolicy = normalizePolicy(policy);
    if (Object.keys(this.#reveals).length !== this.#round.participants.length) {
      throw new Error('All jury reveals are required for aggregation.');
    }
    const result = aggregateGroups(this.#round.participants, this.#reveals);
    return {
      ...this.descriptor(), ...result, policy: acceptedPolicy,
      verdict: result.supportGroups >= acceptedPolicy.minSupportGroups &&
        result.rejectGroups === 0 && result.unresolvedGroups === 0 ? 'supported' : 'not_supported',
    };
  }

  snapshot() {
    const state = {
      ...clone(this.#round), commitments: clone(this.#commitments), reveals: clone(this.#reveals),
    };
    return { state, stateDigest: digest(state) };
  }

  static restore(snapshot) {
    if (digest(snapshot.state) !== snapshot.stateDigest) throw new Error('Jury snapshot digest mismatch.');
    const state = snapshot.state;
    if (state.profile !== 'genos.evidence.jury/v1') throw new Error('Unsupported jury snapshot profile.');
    const jury = new BlindJury(state);
    if (jury.descriptor().contextDigest !== state.contextDigest) throw new Error('Jury context digest mismatch.');
    for (const [verifierId, commitment] of Object.entries(state.commitments)) {
      jury.commit({ verifierId, commitment });
    }
    for (const [verifierId, reveal] of Object.entries(state.reveals)) {
      if (reveal.verifierId !== verifierId) throw new Error('Jury snapshot reveal identity mismatch.');
      jury.reveal(reveal);
    }
    return jury;
  }
}

module.exports = { BlindJury, commitmentFor };
