'use strict';

const crypto = require('node:crypto');
const receipts = require('../epistemicVerifierReceiptService');
const trusted = require('../verifierTrustRegistry');
const intervention = require('./communicationReductionIntervention');

function metricIdentity(input) {
  const observations = input.state?.intraEpochObservations;
  if (!observations || !Number.isSafeInteger(observations.attempts)
    || !Number.isSafeInteger(observations.redundant)) return null;
  const material = [input.missionId, input.orchestratorId,
    Number(input.state?.epoch || 0), observations.attempts, observations.redundant].join('\u0000');
  return `comm_${crypto.createHash('sha256').update(material).digest('hex')}`;
}

function produce(input = {}) {
  const id = metricIdentity(input);
  if (!id) return null;
  const observations = input.state.intraEpochObservations;
  const metric = { id, missionId: input.missionId,
    source: 'communication_outcomes', attempts: observations.attempts,
    redundant: observations.redundant };
  metric.receipt = receipts.issueReceipt({ resultId: id, status: 'verified',
    independent: true, evidenceDigest: intervention.metricDigest(metric),
    verifierDigest: trusted.ensureVerifier('observation_semantic').digest,
    independenceDescriptor: { actorId: 'morphogenesis-communication-metric-verifier',
      workspaceId: `communication-ledger:${input.orchestratorId}` },
    evidenceTypes: ['persisted_runtime_observation'] });
  return intervention.describeAvailability(input.communicationMission || {}, metric).reason
    === 'verified_mission_scoped_redundancy_metric_required' ? null : metric;
}

module.exports = { metricIdentity, produce };
