'use strict';

const { digest } = require('../evidenceProtocol/canonical');
const { validateMessage } = require('./contract');
const v = require('./conversationBindings');
const { outbound } = require('./conversationMessages');

class ConversationPhases {
  constructor(runtime) { this.runtime = runtime; this.store = runtime.store; }

  locate(message) {
    if (message.type === 'OFFER_DELTA') {
      const dialogue = this.store.forContext(message, message.payload.delta.contextDigest);
      if (!dialogue) throw new Error('SYNAPSE declared context required.');
      const query = v.messageDeltaQuery(message);
      if (dialogue.deltaId || this.store.transfer(query)) throw new Error('SYNAPSE this dialogue already has a delta.');
      const delta = message.payload.delta;
      if (delta.baseDigest !== dialogue.context.base.stateDigest) throw new Error('SYNAPSE delta base differs from declared context.');
      return { dialogue, transfer: { query, documentQuery: dialogue.query, delta,
        direction: v.same(message.sender, this.runtime.actor) ? 'outgoing' : 'incoming',
        offerMessageId: message.messageId, representation: message.payload.representation, status: 'offered' } };
    }
    const query = v.messageDeltaQuery(message);
    const transfer = this.store.transfer(query);
    if (!transfer || !v.same(transfer.query, query)) throw new Error('SYNAPSE delta scope or digest mismatch.');
    return { transfer, dialogue: this.store.dialogue(transfer.documentQuery) };
  }

  async qualify(message, change) {
    const document = this.store.document(change.dialogue.query);
    let local = await this.runtime.localInput(change.dialogue.query, document);
    const input = { context: change.dialogue.context, delta: change.transfer.delta,
      representation: message.payload.representation, local };
    await this.runtime.codec.qualify(input);
    local = await this.runtime.localInput(change.dialogue.query, document);
    await this.runtime.allowed('APPLY', message);
    const result = await this.runtime.codec.qualify({ ...input, local });
    if (!v.same(this.store.document(change.dialogue.query), document)) throw new Error('SYNAPSE local state changed during context verification.');
    return { document, result };
  }

  missing(message, change, result) {
    const frame = outbound(this.runtime, { type: 'REQUEST_MISSING', message,
      expiresAt: this.runtime.responseExpiry(message, change.dialogue),
      payload: { deltaId: change.transfer.delta.deltaId, deltaDigest: change.transfer.query.deltaDigest,
        missing: result.missing, canonicalRequested: result.canonicalRequested } });
    change.transfer.requestMessageId = frame.messageId;
    change.transfer.status = 'missing';
    this.store.enqueue(change.dialogue.query, frame);
    return frame;
  }

  async offer(message, change) {
    v.requireCause(message, [change.dialogue.declaration.messageId]);
    const { result } = await this.qualify(message, change);
    const localSender = change.transfer.direction === 'outgoing';
    if (localSender && !result.compatible) throw new Error('SYNAPSE outgoing delta is incompatible with the local installed context.');
    change.dialogue.deltaId = change.transfer.delta.deltaId;
    change.transfer.status = localSender ? 'sent' : 'ready';
    const frames = [];
    if (!localSender && !result.compatible) frames.push(this.missing(message, change, result));
    if (result.compatible) change.transfer.decoded = { contextDigest: change.transfer.delta.contextDigest,
      operationsDigest: change.transfer.delta.operationsDigest, representationDigest: digest(message.payload.representation),
      sourceReceiptDigest: digest({ messageId: message.messageId, operations: result.operations }) };
    return { status: change.transfer.status, outbound: frames };
  }

  async applyDelta(message, change) {
    if (['applied', 'acknowledged'].includes(change.transfer.status)) throw new Error('SYNAPSE delta already applied or acknowledged; replay the original message.');
    v.requireCause(message, [change.transfer.requestMessageId || change.transfer.offerMessageId]);
    const { document, result } = await this.qualify(message, change);
    if (change.transfer.direction === 'outgoing') {
      if (!result.compatible) throw new Error('SYNAPSE outgoing delta is incompatible with the local installed context.');
      change.transfer.status = 'apply_sent';
      change.transfer.applyMessageId = message.messageId;
      return { status: 'sent', outbound: [] };
    }
    if (!result.compatible) return { status: 'missing', outbound: [this.missing(message, change, result)] };
    change.transfer.decoded = { contextDigest: change.transfer.delta.contextDigest,
      operationsDigest: change.transfer.delta.operationsDigest, representationDigest: digest(message.payload.representation),
      sourceReceiptDigest: digest({ messageId: message.messageId, operations: result.operations }) };
    const receipt = v.receipt(change.transfer, change.dialogue, message);
    if (document.generation !== receipt.previousGeneration || document.stateDigest !== receipt.baseDigest) throw new Error('SYNAPSE actual document base changed.');
    const next = { value: result.value, generation: receipt.generation, stateDigest: digest(result.value) };
    if (next.stateDigest !== receipt.resultDigest) throw new Error('SYNAPSE actual target differs from delta result digest.');
    this.runtime.validateFrames(message, change.dialogue);
    this.store.writeDocument(change.dialogue.query, next, document);
    this.store.writeReceipt(change.transfer.query, receipt);
    const ack = outbound(this.runtime, { type: 'ACK_STATE', message, expiresAt: this.runtime.responseExpiry(message, change.dialogue),
      payload: { deltaId: change.transfer.delta.deltaId, deltaDigest: change.transfer.query.deltaDigest, resultDigest: receipt.resultDigest } });
    this.store.enqueue(change.dialogue.query, ack);
    change.transfer.status = 'applied';
    change.transfer.applyMessageId = message.messageId;
    return { status: 'applied', receipt, outbound: [ack] };
  }

  reverse(message, change) {
    if (change.transfer.direction !== 'outgoing' || !v.same(this.runtime.actor, change.dialogue.context.publisher)) {
      throw new Error('SYNAPSE reverse frame must be received by the original publisher.');
    }
    if (message.type === 'REQUEST_MISSING') {
      v.requireCause(message, [change.transfer.offerMessageId, change.transfer.applyMessageId]);
      if (change.transfer.status === 'acknowledged') throw new Error('SYNAPSE already acknowledged delta cannot reopen.');
      change.transfer.requestMessageId = message.messageId;
      change.transfer.peerRequest = message.payload;
      change.transfer.status = 'requested';
      return { status: 'requested', outbound: [] };
    }
    v.requireCause(message, [change.transfer.applyMessageId]);
    if (message.payload.resultDigest !== change.transfer.delta.targetDigest) throw new Error('SYNAPSE peer acknowledgement result mismatch.');
    change.transfer.peerAcknowledgement = message;
    change.transfer.status = 'acknowledged';
    return { status: 'acknowledged', outbound: [] };
  }
}

module.exports = { ConversationPhases };
