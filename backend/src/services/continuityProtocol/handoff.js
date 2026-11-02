'use strict';

const { validateMessage } = require('./contract');
const { immutable } = require('../evidenceProtocol/conversation');
const { digest } = require('../evidenceProtocol/canonical');
const { HandoffStore } = require('./handoffStore');
const bindings = require('./handoffBindings');

function requireCallbacks(options) {
  for (const name of ['authorize', 'verifyCheckpoint', 'activateAuthority']) {
    if (typeof options[name] !== 'function') throw new Error(`CONTINUITY ${name} callback required.`);
  }
}

class ContinuityHandoff {
  constructor(options) {
    requireCallbacks(options);
    this.store = new HandoffStore(options.dbPath || ':memory:');
    this.authorize = options.authorize;
    this.verifyCheckpoint = options.verifyCheckpoint;
    this.activateAuthority = options.activateAuthority;
    this.clock = options.clock || (() => new Date().toISOString());
  }

  state(id) { return this.store.state(id); }
  history() { return this.store.history(); }
  close() { this.store.close(); }

  async apply(input) {
    const message = validateMessage(input, { now: this.clock() });
    await this.authorized(message);
    const replay = this.store.replay(message);
    if (replay) return replay;
    const expected = this.state(message.payload.transferId);
    const transition = await this.transition(message, expected);
    await this.authorized(message);
    validateMessage(message, { now: this.clock() });
    const state = transition.state;
    state.revision += 1;
    state.lastMessageId = message.messageId;
    const result = { transferId: state.transferId, status: state.status,
      bundleDigest: state.bundleDigest, messageId: message.messageId, revision: state.revision };
    return this.store.commit({ message, expected: transition.expected, state, result });
  }

  async authorized(message) {
    if (await this.authorize(immutable(message)) !== true) throw new Error('CONTINUITY authority rejected or revoked.');
  }

  async transition(message, expected) {
    if (message.type === 'OFFER_HANDOFF') return { expected, state: this.offer(message, expected) };
    if (!expected) throw new Error('CONTINUITY unknown transfer.');
    bindings.requireContext(expected, message);
    const state = structuredClone(expected);
    const handlers = { SEAL_CHECKPOINT: this.seal, ACCEPT_RESPONSIBILITY: this.accept,
      ACTIVATE_SUCCESSOR: this.activate, ABORT_HANDOFF: this.abort };
    const handler = handlers[message.type];
    if (!handler) throw new Error('CONTINUITY unsupported handoff transition.');
    return handler.call(this, message, { expected, state });
  }

  offer(message, expected) {
    if (expected) throw new Error('CONTINUITY transfer already exists.');
    bindings.requireOffer(message);
    return { ...message.payload, bundleDigest: digest(message.payload.bundle), context: bindings.context(message),
      sourceIncarnationGeneration: message.generations.incarnation, status: 'offered', revision: 0 };
  }

  async seal(message, transition) {
    const state = transition.state;
    bindings.requireActor(state, message, false);
    if (state.status !== 'offered') throw new Error('CONTINUITY SEAL_CHECKPOINT out of order.');
    if (message.generations.incarnation !== state.sourceIncarnationGeneration) throw new Error('CONTINUITY stale source incarnation generation.');
    const receipt = await this.verifyCheckpoint(immutable(bindings.checkpointRequest(state)));
    if (!bindings.validCheckpoint(receipt, state)) throw new Error('CONTINUITY checkpoint receipt mismatch.');
    state.checkpointReceipt = structuredClone(receipt);
    state.status = 'sealed';
    return transition;
  }

  accept(message, transition) {
    const state = transition.state;
    bindings.requireActor(state, message, true);
    if (state.status !== 'sealed') throw new Error('CONTINUITY ACCEPT_RESPONSIBILITY requires sealed checkpoint.');
    state.acceptedResponsibility = { bundleDigest: state.bundleDigest, successor: bindings.actor(state.successor),
      acceptedMessageId: message.messageId };
    state.successorIncarnationGeneration = message.generations.incarnation;
    state.status = 'accepted';
    return transition;
  }

  async activate(message, transition) {
    const state = transition.state;
    bindings.requireActor(state, message, true);
    if (!['accepted', 'activation_pending'].includes(state.status)) throw new Error('CONTINUITY ACTIVATE_SUCCESSOR requires accepted responsibility.');
    if (message.generations.incarnation !== state.successorIncarnationGeneration) throw new Error('CONTINUITY stale successor incarnation generation.');
    const request = bindings.activationRequest(state);
    if (state.status === 'accepted') {
      state.status = 'activation_pending';
      state.activationRequest = request;
      state.revision += 1;
      transition.expected = this.store.pending({ ...transition, message });
    }
    if (!bindings.same(request, state.activationRequest)) throw new Error('CONTINUITY activation recovery binding mismatch.');
    const receipt = await this.activateAuthority(immutable(request));
    if (!bindings.validActivation(receipt, request)) throw new Error('CONTINUITY activation receipt mismatch; recovery required.');
    state.activationReceipt = structuredClone(receipt);
    state.status = 'activated';
    return transition;
  }

  abort(message, transition) {
    const state = transition.state;
    bindings.requireActor(state, message, false);
    if (!['offered', 'sealed'].includes(state.status)) throw new Error('CONTINUITY transfer cannot abort; recovery may be required.');
    state.status = 'aborted';
    state.abortReason = message.payload.reason;
    return transition;
  }
}

module.exports = { ContinuityHandoff };
