'use strict';

const { randomBytes } = require('node:crypto');
const { digest } = require('../evidenceProtocol/canonical');
const { validateMessage } = require('./contract');
const { RecognitionStore } = require('./recognitionStore');
const validation = require('./recognitionValidation');

function callbacks(options) {
  for (const name of ['authorize', 'verifyAttestation']) {
    if (typeof options[name] !== 'function') throw new Error(`CONTINUITY recognition ${name} callback required.`);
  }
}

class RecognitionConversation {
  constructor(options) {
    callbacks(options);
    this.maxChallengeTtlMs = options.maxChallengeTtlMs ?? 300000;
    if (!Number.isSafeInteger(this.maxChallengeTtlMs) || this.maxChallengeTtlMs < 1) {
      throw new Error('CONTINUITY recognition challenge TTL must be a positive safe integer.');
    }
    this.store = new RecognitionStore(options.dbPath || ':memory:');
    this.authorize = options.authorize;
    this.verifyAttestation = options.verifyAttestation;
    this.clock = options.clock || (() => Date.now());
  }

  state(context) { return this.store.state(context); }
  history() { return this.store.history(); }
  close() { this.store.close(); }

  now() {
    const value = this.clock();
    const parsed = typeof value === 'number' ? value : Date.parse(value);
    if (!Number.isFinite(parsed)) throw new Error('CONTINUITY recognition clock invalid.');
    return parsed;
  }

  async apply(input) {
    const message = validateMessage(input, { now: this.now() });
    if (await this.authorize(validation.immutable(message)) !== true) throw new Error('CONTINUITY recognition authority rejected.');
    const replay = this.store.replay(message);
    if (replay) return replay;
    const version = this.store.version();
    const state = await this.transition(message);
    if (await this.authorize(validation.immutable(message)) !== true) throw new Error('CONTINUITY recognition authority revoked.');
    validateMessage(message, { now: this.now() });
    if (message.type !== 'PRESENT') this.requireFreshChallenge(state);
    const result = { messageId: message.messageId, status: state.status, identity: state.presentation.payload.identity,
      relation: state.presentation.payload.relation, permissionsInherited: false, authorityTransferred: false };
    return this.store.commit({ message, version, state, result });
  }

  async transition(message) {
    const state = this.store.state(message);
    if (message.type === 'PRESENT') return this.present(message, state);
    if (!state) throw new Error('CONTINUITY recognition unknown presentation.');
    validation.context(state, message);
    const handlers = { CHALLENGE: () => this.challenge(state, message), ATTEST: () => this.attest(state, message),
      CONTINUITY_PROOF: () => this.proof(state, message) };
    if (!Object.hasOwn(handlers, message.type)) throw new Error('CONTINUITY unsupported recognition transition.');
    await handlers[message.type]();
    state.lastMessageId = message.messageId;
    return state;
  }

  present(message, previous) {
    if (previous) throw new Error('CONTINUITY presentation already exists; use a new conversation.');
    validation.presentation(message);
    return { status: 'presented', presentation: message, lastMessageId: message.messageId };
  }

  challenge(state, message) {
    if (state.status !== 'presented') throw new Error('CONTINUITY CHALLENGE out of order.');
    validation.participants(state, message, true);
    if (message.payload.presentationMessageId !== state.presentation.messageId) throw new Error('CONTINUITY presentation reference mismatch.');
    const expires = Date.parse(message.payload.challengeExpiresAt);
    const upper = Math.min(this.now() + this.maxChallengeTtlMs, Date.parse(message.expiresAt), Date.parse(state.presentation.expiresAt));
    if (expires > upper) {
      throw new Error('CONTINUITY recognition challenge exceeds allowed TTL.');
    }
    state.challenge = message;
    state.challengerGeneration = message.generations.incarnation;
    state.status = 'challenged';
    this.requireFreshChallenge(state);
  }

  requireFreshChallenge(state) {
    if (Date.parse(state.challenge.payload.challengeExpiresAt) <= this.now()) throw new Error('CONTINUITY recognition challenge expired.');
  }

  async attest(state, message) {
    if (state.status !== 'challenged') throw new Error('CONTINUITY ATTEST out of order.');
    validation.participants(state, message, false);
    this.requireFreshChallenge(state);
    this.requireAttestation(state, message);
    const request = validation.verificationRequest(state, message);
    const receipt = await this.verifyAttestation(validation.immutable(request));
    if (!validation.boundVerification(receipt, request)) throw new Error('CONTINUITY attestation binding or retained history rejected.');
    state.attestation = message;
    state.verification = structuredClone(receipt);
    state.status = 'attested';
  }

  requireAttestation(state, message) {
    const challenge = state.challenge;
    if (message.payload.challengeMessageId !== challenge.messageId || message.payload.nonce !== challenge.payload.nonce) {
      throw new Error('CONTINUITY attestation challenge or nonce mismatch.');
    }
    if (message.payload.presentationDigest !== digest(state.presentation.payload)) throw new Error('CONTINUITY presentation digest mismatch.');
  }

  proof(state, message) {
    if (state.status !== 'attested') throw new Error('CONTINUITY CONTINUITY_PROOF out of order.');
    validation.participants(state, message, true);
    this.requireFreshChallenge(state);
    if (message.payload.attestationMessageId !== state.attestation.messageId
      || message.payload.proofDigest !== state.verification.proofDigest) throw new Error('CONTINUITY final proof binding mismatch.');
    state.status = 'recognized';
  }
}

const newNonce = () => randomBytes(32).toString('hex');

module.exports = { RecognitionConversation, newNonce };
