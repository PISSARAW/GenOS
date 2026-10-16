'use strict';

const calibration = require('./morphogenesisSelectorCalibration');
const evidence = require('./morphogenesisPairedOutcomeEvidence');
const store = require('./morphogenesisVerifiedOutcomeStore');

function invalid(reason) {
  return Object.assign(new Error(`Unqualified morphogenesis pair: ${reason}.`), {
    code: 'MORPHOGENESIS_PAIR_UNQUALIFIED'
  });
}

function buildRow(pair) {
  const source = { candidate: pair?.candidate, control: pair?.control,
    prediction: pair?.prediction, transitionReceipt: pair?.transitionReceipt };
  if (!source.candidate || !source.control || !source.prediction
    || !source.transitionReceipt?.identity) throw invalid('evidence_missing');
  const metrics = evidence.derivedMetrics(source.candidate, source.control);
  const row = { id: evidence.pairId(source), scale: 'COHORT_REPLACEMENT',
    candidateId: source.transitionReceipt.identity.candidateId,
    taskId: source.candidate.taskId, taskFamily: source.candidate.taskFamily,
    modelId: source.candidate.modelId, split: source.prediction.split,
    predictedGain: source.prediction.predictedGain,
    predictedCost: source.prediction.predictedCost,
    ...metrics, pairEvidence: source };
  if (!evidence.validPairedEvidence(row)) throw invalid('evidence_or_transition_mismatch');
  return row;
}

async function recordPairedOutcome(db, input) {
  const row = { ...buildRow(input.pair), receipt: input.receipt };
  if (!calibration.verifiedRow(row)) throw invalid('external_pair_receipt_invalid');
  const result = await store.recordVerifiedOutcome(db, input.scope, row);
  return { ...result, candidateId: row.candidateId,
    transitionId: row.pairEvidence.transitionReceipt.transitionId };
}

module.exports = { buildRow, recordPairedOutcome };
