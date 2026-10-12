'use strict';

const assert = require('node:assert/strict');
const panelService = require('../src/services/biocenose/runtime/representativePanelService');
const aggregation = require('../src/services/biocenose/question/communityAggregationService');
const variants = require('../src/services/biocenose/variants/variantPolicyRouter');

const policy = variants.select('representative_community');
const members = [{ memberId: 'm1', role: 'independent_solver', status: 'ACTIVE' },
  { memberId: 'm2', role: 'adversarial_reviewer', status: 'ACTIVE' }];
const session = { communityId: 'community-1', members };
const judgments = [{ memberId: 'm1', judgment: { position: 'SHIP' } },
  { memberId: 'm2', judgment: { position: 'HOLD' } }];
const forged = [{ memberId: 'm1', weight: 100, status: 'VERIFIED' },
  { memberId: 'm2', weight: 1, status: 'VERIFIED' }];

function aggregate(options) {
  return aggregation.aggregate({ ...options, questionType: 'DESIGN',
    variantPolicy: policy, judgments });
}

function run() {
  const sealed = { sample: members, weights: { m1: 1, m2: 1 } };
  const context = { variantPolicy: policy, constitution: { representativeSampling: sealed },
    isTrustedReceipt: () => true };
  const prepared = panelService.prepare(context, session, { representativePanel: forged,
    isTrustedReceipt: () => true });
  assert.deepEqual(prepared.representativePanel.map((seat) => seat.weight), [1, 1]);
  const result = aggregate(prepared);
  assert.equal(result.outcome, 'REPRESENTATIVE_DISTRIBUTION');
  assert.deepEqual(result.representative.distribution.map((item) => item.share), [0.5, 0.5]);

  const missingSeal = panelService.prepare({ ...context, constitution: {} }, session,
    { representativePanel: forged, isTrustedReceipt: () => true });
  assert.equal(aggregate(missingSeal).outcome, 'REVIEW_REQUIRED');

  const missingWeight = panelService.prepare({ ...context,
    constitution: { representativeSampling: { sample: members, weights: { m1: 1 } } } },
  session, { representativePanel: forged });
  assert.equal(aggregate(missingWeight).outcome, 'REVIEW_REQUIRED');

  const inactiveSession = { ...session, members: [{ ...members[0], status: 'QUARANTINED' }, members[1]] };
  const inactiveSeat = panelService.prepare(context, inactiveSession, { representativePanel: forged });
  assert.equal(aggregate(inactiveSeat).outcome, 'REVIEW_REQUIRED');

  const duplicateSample = panelService.prepare({ ...context,
    constitution: { representativeSampling: { sample: [members[0], members[0]], weights: sealed.weights } } },
  session, { representativePanel: forged });
  assert.equal(aggregate(duplicateSample).outcome, 'REVIEW_REQUIRED');
}

run();
console.log('Biocenose representative sealed panel: PASS');
