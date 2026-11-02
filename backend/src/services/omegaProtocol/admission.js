'use strict';

const { digest } = require('../evidenceProtocol/canonical');
const { validateMessage, validateCapabilities } = require('./contract');
const { AdmissionStore } = require('./admissionStore');
const { buildPlan } = require('./admissionPlan');

const same = (left, right) => digest(left) === digest(right);

function immutable(value) {
  const copy = structuredClone(value);
  for (const [key, child] of Object.entries(copy)) {
    if (child && typeof child === 'object') copy[key] = immutable(child);
  }
  return Object.freeze(copy);
}

function requiredCallbacks(options) {
  for (const name of ['authorize', 'describeRuntime', 'verifyPlan']) {
    if (typeof options[name] !== 'function') throw new Error(`OMEGA admission ${name} callback required.`);
  }
}

function context(message) {
  return { scope: message.scope, missionId: message.missionId, conversationId: message.conversationId,
    generations: message.generations, sender: message.sender, audience: message.audience,
    authority: message.authority, expiresAt: message.expiresAt };
}

function verifyContext(state, message) {
  const expected = context(state.descriptionMessage);
  const actual = context(message);
  delete expected.expiresAt;
  delete actual.expiresAt;
  if (!same(expected, actual)) throw new Error('OMEGA admission context mismatch.');
  if (message.operationId !== state.descriptionMessage.operationId) throw new Error('OMEGA admission operation mismatch.');
  if (!message.causalRefs.includes(state.lastMessageId)) throw new Error('OMEGA admission causal reference required.');
}

class OmegaAdmission {
  constructor(options) {
    requiredCallbacks(options);
    this.store = new AdmissionStore(options.dbPath || ':memory:');
    this.authorize = options.authorize;
    this.describeRuntime = options.describeRuntime;
    this.verifyPlan = options.verifyPlan;
    this.clock = options.clock || (() => Date.now());
  }

  state(query) { return this.store.state(query); }
  history() { return this.store.history(); }
  close() { this.store.close(); }

  acceptedPlan(query) {
    const state = this.store.state(query);
    if (!state || state.status !== 'accepted') return null;
    if (state.plan.planId !== query.planId || digest(state.plan) !== query.planDigest) return null;
    const clock = this.clock();
    const now = typeof clock === 'number' ? clock : Date.parse(clock);
    if (!Number.isFinite(now) || Date.parse(state.context.expiresAt) <= now) return null;
    return state;
  }

  async apply(input) {
    const message = validateMessage(input, { now: this.clock() });
    if (await this.authorize(immutable(message)) !== true) throw new Error('OMEGA admission authority rejected.');
    const replay = this.store.replay(message);
    if (replay) return replay;
    const version = this.store.version();
    const state = await this.transition(message);
    if (await this.authorize(immutable(message)) !== true) throw new Error('OMEGA admission authority revoked.');
    validateMessage(message, { now: this.clock() });
    if (state.submitMessage) validateMessage(state.submitMessage, { now: this.clock() });
    state.lastMessageId = message.messageId;
    const result = { messageId: message.messageId, status: state.status, capabilities: state.capabilities };
    if (state.plan) Object.assign(result, { planId: state.plan.planId, planDigest: digest(state.plan), plan: state.plan });
    return this.store.commit({ message, version, state, result });
  }

  async describe(message) {
    const capabilities = await this.describeRuntime(immutable({ message, stage: message.type }));
    return validateCapabilities(capabilities);
  }

  async transition(message) {
    const state = this.store.state(message);
    if (message.type === 'DESCRIBE_RUNTIME') return this.description(message, state);
    if (!state) throw new Error('OMEGA admission runtime description required.');
    verifyContext(state, message);
    if (message.type === 'SUBMIT_PROGRAM') return this.submit(message, state);
    if (message.type === 'ACCEPT_PLAN') return this.accept(message, state);
    throw new Error('OMEGA admission unsupported transition.');
  }

  async description(message, previous) {
    if (previous) throw new Error('OMEGA admission conversation already exists.');
    const capabilities = await this.describe(message);
    if (capabilities.runtimeId !== message.payload.runtimeId) throw new Error('OMEGA runtime identity mismatch.');
    return { status: 'described', capabilities, descriptionMessage: message };
  }

  async submit(message, state) {
    if (state.status !== 'described') throw new Error('OMEGA SUBMIT_PROGRAM out of order.');
    const current = await this.describe(message);
    if (!same(current, state.capabilities)) throw new Error('OMEGA runtime capabilities changed.');
    state.context = context(message);
    state.submission = message.payload.submission;
    state.submitMessage = message;
    state.program = state.submission.program;
    state.plan = buildPlan(state.submission, current, state.context);
    await this.verify(state, message);
    state.status = 'submitted';
    return state;
  }

  async verify(state, message) {
    const request = { stage: message.type, message, plan: state.plan, program: state.program,
      submission: state.submission, capabilities: state.capabilities, context: state.context };
    const receipt = await this.verifyPlan(immutable(request));
    if (receipt?.status !== 'validated' || receipt.requestDigest !== digest(request)
      || !/^sha256:[a-f0-9]{64}$/.test(receipt.receiptDigest || '')) throw new Error('OMEGA plan verification receipt mismatch.');
    state.verification = structuredClone(receipt);
    const current = await this.describe(message);
    if (!same(current, state.capabilities)) throw new Error('OMEGA capabilities changed during plan verification.');
  }

  async accept(message, state) {
    if (state.status !== 'submitted') throw new Error('OMEGA ACCEPT_PLAN out of order.');
    if (message.payload.planId !== state.plan.planId || message.payload.planDigest !== digest(state.plan)) {
      throw new Error('OMEGA accepted plan binding mismatch.');
    }
    const rebuilt = buildPlan(state.submission, state.capabilities, state.context);
    if (!same(rebuilt, state.plan)) throw new Error('OMEGA plan obligations or binding changed.');
    await this.verify(state, message);
    state.status = 'accepted';
    state.acceptMessage = message;
    return state;
  }
}

module.exports = { OmegaAdmission };
