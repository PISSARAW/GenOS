'use strict';

const { validateMessage } = require('./contract');
const { EvidenceStore } = require('./store');
const { boundReceipt, assertContext, canPromote, same } = require('./acceptance');

function freeze(value) {
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') freeze(child);
  }
  return Object.freeze(value);
}

function immutable(value) { return freeze(structuredClone(value)); }

function requiredCallbacks(options) {
  for (const name of ['authorize', 'verifyEvidence', 'acceptPolicy']) {
    if (typeof options[name] !== 'function') throw new Error(`EVIDENCE ${name} callback required.`);
  }
}

class EvidenceConversation {
  constructor(options) {
    requiredCallbacks(options);
    this.store = new EvidenceStore(options.dbPath || ':memory:');
    this.authorize = options.authorize;
    this.verifyEvidence = options.verifyEvidence;
    this.acceptPolicy = options.acceptPolicy;
    this.clock = options.clock || (() => new Date().toISOString());
    this.handlers = new Map();
  }

  claim(id) { return this.store.claim(id); }
  history() { return this.store.history(); }
  close() { this.store.close(); }
  canPromote(request) { return canPromote(this.store, request); }

  async apply(input) {
    const message = validateMessage(input, { now: this.clock() });
    if (await this.authorize(immutable(message)) !== true) throw new Error('EVIDENCE authority rejected.');
    const replay = this.store.replay(message);
    if (replay) return replay;
    const version = this.store.version();
    const change = await this.transition(message);
    if (await this.authorize(immutable(message)) !== true) throw new Error('EVIDENCE authority revoked before commit.');
    validateMessage(message, { now: this.clock() });
    return this.store.commit({ message, version, ...change });
  }

  async transition(message) {
    if (message.type === 'ASSERT') return this.assert(message);
    const state = this.claim(message.payload.claimId);
    if (!state) throw new Error('EVIDENCE unknown claim.');
    assertContext(state, message);
    const extension = this.handlers.get(message.type);
    if (extension) return extension(message, state);
    return this.advance(message, state);
  }

  assert(message) {
    const claim = message.payload.claim;
    if (claim.provenance.producerId !== message.sender.agentId) throw new Error('EVIDENCE producer identity mismatch.');
    if (this.claim(claim.claimId)) throw new Error('EVIDENCE claim already exists.');
    for (const id of claim.dependencies) {
      const parent = this.claim(id);
      if (!parent || !same(parent.scope, message.scope)) throw new Error('EVIDENCE unknown or foreign dependency.');
      assertContext(parent, message);
    }
    const state = { claim, status: 'asserted', revision: 0, scope: message.scope,
      missionId: message.missionId, conversationId: message.conversationId, generations: message.generations };
    return this.change(message, state);
  }

  async advance(message, state) {
    if (!message.causalRefs.includes(state.lastMessageId)) throw new Error('EVIDENCE previous message causal reference required.');
    const actions = {
      REQUEST_EVIDENCE: () => this.request(state),
      VERIFY: () => this.verify(message, state),
      ACCEPT_UNDER_POLICY: () => this.accept(message, state),
    };
    const action = actions[message.type];
    if (!action) throw new Error('EVIDENCE unsupported transition.');
    await action();
    return this.change(message, state);
  }

  request(state) {
    if (state.status !== 'asserted') throw new Error('EVIDENCE REQUEST_EVIDENCE out of order.');
    state.status = 'evidence_requested';
  }

  async verify(message, state) {
    if (state.status !== 'evidence_requested') throw new Error('EVIDENCE VERIFY out of order.');
    const receipt = await this.verifyEvidence(immutable({ claim: state.claim, message }));
    if (!boundReceipt(receipt, state.claim)) throw new Error('EVIDENCE verification receipt mismatch.');
    state.verification = structuredClone(receipt);
    state.status = 'verified';
  }

  async accept(message, state) {
    if (state.status !== 'verified') throw new Error('EVIDENCE ACCEPT_UNDER_POLICY out of order.');
    const context = immutable({ claim: state.claim, receipt: state.verification, message });
    if (await this.acceptPolicy(context) !== true) throw new Error('EVIDENCE policy rejected.');
    state.status = 'accepted';
  }

  change(message, state) {
    state.revision += 1;
    state.lastMessageId = message.messageId;
    return { states: [state], result: { messageId: message.messageId, claimId: state.claim.claimId,
      status: state.status, revision: state.revision } };
  }
}

module.exports = { EvidenceConversation, immutable };
