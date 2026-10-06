'use strict';

const { createHash } = require('crypto');
const communityStore = require('../communityStore');
const { ROUND_STEPS } = require('./deliberationPlanner');

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function save(input, step) {
  return communityStore.appendEvent(input.db, {
    communityId: input.communityId, actorId: input.actorId, type: 'DELIBERATION_STEP_COMPLETED',
    payload: { ...step, resultHash: digest(step.result), round: input.round,
      constitutionHash: input.constitutionHash }, patch: {}
  });
}

async function load(input) {
  const events = await communityStore.listEvents(input.db, input.communityId);
  const receipts = [];
  const completed = events.filter((event) => event.type === 'DELIBERATION_STEP_COMPLETED'
    && event.payload.round === input.round);
  for (const event of completed) {
    const item = event.payload;
    if (item.constitutionHash !== input.constitutionHash || item.resultHash !== digest(item.result)
      || ROUND_STEPS[receipts.length] !== item.step) throw integrityError();
    receipts.push({ step: item.step, result: item.result, completedAt: event.createdAt });
  }
  return receipts;
}

function integrityError() {
  return Object.assign(new Error('Biocenose round receipts do not match the committed protocol or step order.'), {
    code: 'BIOCENOSE_ROUND_INTEGRITY_FAILED'
  });
}

module.exports = { save, load, digest };
