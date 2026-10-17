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
  const scale = pair?.scale || 'COHORT_REPLACEMENT';
  if (!evidence.PAIRED_SCALES.includes(scale)) throw invalid('scale_not_paired');
  const source = { candidate: pair?.candidate, control: pair?.control,
    prediction: pair?.prediction, transitionReceipt: pair?.transitionReceipt };
  if (!source.candidate || !source.control || !source.prediction
    || !source.transitionReceipt?.identity) throw invalid('evidence_missing');
  const metrics = evidence.derivedMetrics(source.candidate, source.control);
  const row = { id: evidence.pairId(source), scale,
    candidateId: evidence.pairCandidateId(source),
    taskId: source.candidate.taskId, taskFamily: source.candidate.taskFamily,
    modelId: source.candidate.modelId, evaluationDomain: source.candidate.evaluationDomain,
    replicationId: source.candidate.replicationId || source.prediction.replicationId,
    split: source.prediction.split,
    predictedGain: source.prediction.predictedGain,
    predictedCost: source.prediction.predictedCost,
    ...metrics, pairEvidence: { ...source, scale } };
  if (!row.candidateId || !evidence.validPairedEvidence(row)) throw invalid('evidence_or_transition_mismatch');
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
