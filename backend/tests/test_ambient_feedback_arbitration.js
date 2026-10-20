'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('./helpers/biologyDatabase');
const ledger = require('../src/services/ambientAgency/responsibilityLedgerService');
const feedback = require('../src/services/ambientAgency/feedbackLearningService');
const arbitration = require('../src/services/ambientAgency/arbitrationService');

const scope = { organizationId: 'org-dots', projectId: 'project-1' };
const responsibilityPayload = {
  responsibilityId: 'ambient-1', ownerAgentId: 'owner', mandateRef: 'mandate:1',
  consentRef: 'consent:1', objectiveRef: 'objective:retention',
  externalTrajectoryRef: 'trajectory:crm:retention', purpose: 'Detecter une derive client',
  policy: { allowedApps: ['crm'], allowedFields: ['risk'] },
  recordedAt: '2026-10-20T08:00:00.000Z'
};

function authority(overrides = {}) {
  return { authorityId: 'authority', authorityRef: 'authority:1', disposition: 'AUTHORIZED',
    responsibilityVersion: 1, ...overrides };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error.code === code);
}

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-ambient-feedback-'));
  const db = openDatabase(path.join(directory, 'ambient.db'));
  try {
    const created = await ledger.create(db, { ...scope, payload: responsibilityPayload });
    const responsibility = created.content;
    const recorded = await feedback.recordCandidate(db, { ...scope, payload: {
      responsibilityId: 'ambient-1', feedbackId: 'feedback-1', proposerId: 'proposer',
      claim: 'Le risque signale une attrition imminente.', sourceRefs: ['support:ticket:9'],
      proposedAt: '2026-10-20T08:30:00.000Z' } });
    const base = { responsibility, responsibilityVersion: 1,
      trajectory: { ref: 'trajectory:crm:retention', current: 70, target: 80,
        direction: 'MAXIMIZE', tolerance: 2, effectEvidenceRefs: ['metric:retention:7'] },
      feedback: recorded.candidate,
      authority: authority() };
    assert.equal(arbitration.arbitrate(base).decision, 'OBSERVE');
    await expectCode(feedback.decide(db, { ...scope, payload: { feedbackId: 'feedback-1',
      decisionId: 'learning-bad', verification: { verifierId: 'owner', verdict: 'SUPPORTED',
        evidenceRefs: ['test:1'] }, authority: authority(),
      decidedAt: '2026-10-20T08:45:00.000Z' } }), 'AMBIENT_INDEPENDENCE_REQUIRED');
    const learned = await feedback.decide(db, { ...scope, payload: { feedbackId: 'feedback-1',
      decisionId: 'learning-1', verification: { verifierId: 'verifier', verdict: 'SUPPORTED',
        evidenceRefs: ['test:1'] }, authority: authority(),
      decidedAt: '2026-10-20T08:45:00.000Z' } });
    assert.equal(arbitration.arbitrate({ ...base, learningDecision: learned.decision }).decision,
      'LEARN');
    const action = arbitration.arbitrate({ responsibility, responsibilityVersion: 1,
      trajectory: base.trajectory, observation: { observationId: 'obs-1' },
      proposerId: 'planner', verification: { verifierId: 'verifier', verdict: 'SUPPORTED',
        subjectRef: 'obs-1', evidenceRefs: ['observation:obs-1'] }, authority: authority() });
    assert.equal(action.decision, 'PROPOSE_ACTION');
    assert.equal(action.executionAuthorized, false);
    const stable = arbitration.arbitrate({ responsibility, responsibilityVersion: 1,
      trajectory: { ...base.trajectory, current: 79 } });
    assert.equal(stable.decision, 'NO_CHANGE');
    const colluding = arbitration.arbitrate({ responsibility, responsibilityVersion: 1,
      trajectory: base.trajectory, observation: { observationId: 'obs-1' },
      proposerId: 'planner', verification: { verifierId: 'planner', verdict: 'SUPPORTED',
        subjectRef: 'obs-1', evidenceRefs: ['observation:obs-1'] }, authority: authority() });
    assert.equal(colluding.decision, 'OBSERVE');
    const transportOnly = arbitration.arbitrate({ responsibility, responsibilityVersion: 1,
      trajectory: { ...base.trajectory, effectEvidenceRefs: [] },
      observation: { observationId: 'obs-1' }, proposerId: 'planner',
      verification: { verifierId: 'verifier', verdict: 'SUPPORTED', subjectRef: 'obs-1',
        evidenceRefs: ['transport:http:200'] }, authority: authority() });
    assert.equal(transportOnly.reason, 'TRANSPORT_IS_NOT_EFFECT_EVIDENCE');
  } finally {
    await db.close().catch(() => {});
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().then(() => console.log('Ambient feedback arbitration tests passed.')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
