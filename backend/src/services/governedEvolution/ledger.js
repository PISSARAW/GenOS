'use strict';

function ledgerError(message, code) {
  throw Object.assign(new Error(message), { code });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function requiredText(value, field) {
  const text = String(value || '').trim();
  if (text) return text;
  return ledgerError(`${field} is required`, 'GOVERNED_EVOLUTION_LEDGER_INVALID');
}

class GovernedEvolutionLedger {
  constructor() {
    this.records = new Map();
    this.failureRecords = [];
    this.eventRecords = [];
    this.lastDecision = 'NO_CHANGE';
  }

  recordHypothesis(hypothesis) {
    if (!hypothesis?.hypothesisId || hypothesis.status !== 'HYPOTHESIS') {
      ledgerError('Only sealed hypotheses can enter the ledger', 'GOVERNED_EVOLUTION_HYPOTHESIS_REQUIRED');
    }
    if (this.records.has(hypothesis.hypothesisId)) return this.get(hypothesis.hypothesisId);
    const record = { ...clone(hypothesis), status: 'HYPOTHESIS', promotionEligible: false };
    this.records.set(hypothesis.hypothesisId, record);
    this.appendEvent('HYPOTHESIS_RECORDED', record);
    return clone(record);
  }

  recordEvaluation(input) {
    const evaluatorId = requiredText(input.evaluatorId, 'evaluatorId');
    const report = input.report || {};
    for (const outcome of report.outcomes || []) this.recordOutcome({ outcome, evaluatorId });
    this.lastDecision = report.decision === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : 'NO_CHANGE';
    this.appendEvent('EVALUATION_RECORDED', {
      evaluatorId,
      decision: this.lastDecision,
      selectedHypothesisId: report.selectedHypothesisId || null
    });
    return this.decision();
  }

  recordOutcome(input) {
    const record = this.records.get(input.outcome.hypothesisId);
    if (!record) ledgerError('Evaluated hypothesis is absent from ledger', 'GOVERNED_EVOLUTION_UNKNOWN_HYPOTHESIS');
    if (record.proposerId === input.evaluatorId) {
      ledgerError('Proposer cannot record its own evaluation', 'GOVERNED_EVOLUTION_INDEPENDENCE_REQUIRED');
    }
    const updated = {
      ...record,
      status: input.outcome.status,
      evaluation: clone(input.outcome),
      evaluatedBy: input.evaluatorId,
      promotionEligible: false
    };
    this.records.set(record.hypothesisId, updated);
    if (updated.status === 'REJECTED') this.archiveFailure(updated);
  }

  authorize(input) {
    const record = this.records.get(input.hypothesisId);
    if (!record || record.status !== 'QUALIFIED') {
      ledgerError('Only a qualified hypothesis can be authorized', 'GOVERNED_EVOLUTION_NOT_QUALIFIED');
    }
    const authorizerId = requiredText(input.authorizerId, 'authorizerId');
    if ([record.proposerId, record.evaluatedBy].includes(authorizerId)) {
      ledgerError('Authorizer must be independent from proposer and evaluator', 'GOVERNED_EVOLUTION_INDEPENDENCE_REQUIRED');
    }
    if (input.evaluationHash !== record.evaluation.evaluationHash) {
      ledgerError('Authorization is not bound to the recorded evaluation', 'GOVERNED_EVOLUTION_EVALUATION_MISMATCH');
    }
    const updated = {
      ...record,
      status: 'AUTHORIZED_PENDING_APPLY',
      authorizedBy: authorizerId,
      promotionEligible: false
    };
    this.records.set(record.hypothesisId, updated);
    this.lastDecision = 'AUTHORIZED_PENDING_APPLY';
    this.appendEvent('APPLICATION_AUTHORIZED', updated);
    return clone(updated);
  }

  recordRollback(input) {
    const record = this.records.get(input.hypothesisId);
    if (!record) ledgerError('Rollback hypothesis is absent from ledger', 'GOVERNED_EVOLUTION_UNKNOWN_HYPOTHESIS');
    if (input.restoredRevision !== record.parentRevision) {
      ledgerError('Rollback must restore the recorded parent revision', 'GOVERNED_EVOLUTION_ROLLBACK_MISMATCH');
    }
    const rollback = {
      actorId: requiredText(input.actorId, 'actorId'),
      receiptId: requiredText(input.receiptId, 'receiptId'),
      restoredRevision: input.restoredRevision,
      reason: requiredText(input.reason, 'reason')
    };
    const updated = { ...record, status: 'ROLLED_BACK', rollback, promotionEligible: false };
    this.records.set(record.hypothesisId, updated);
    this.lastDecision = 'NO_CHANGE';
    this.appendEvent('ROLLBACK_RECORDED', updated);
    return clone(updated);
  }

  archiveFailure(record) {
    this.failureRecords.push({
      hypothesisId: record.hypothesisId,
      parentRevision: record.parentRevision,
      candidateRevision: record.candidateRevision,
      failures: clone(record.evaluation.failures),
      evidence: clone(record.evaluation.evidence),
      evaluationHash: record.evaluation.evaluationHash
    });
  }

  appendEvent(type, payload) {
    this.eventRecords.push({ type, payload: clone(payload) });
  }

  get(hypothesisId) {
    const record = this.records.get(hypothesisId);
    return record ? clone(record) : null;
  }

  failures() {
    return clone(this.failureRecords);
  }

  events() {
    return clone(this.eventRecords);
  }

  decision() {
    return { decision: this.lastDecision, promotionEligible: false };
  }
}

module.exports = { GovernedEvolutionLedger };
