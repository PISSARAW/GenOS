'use strict';

const { scopeKey, digest } = require('./contract');
const { FRESH_MS } = require('./physiology');

async function nativeMeasurement(store, proposal) {
  const row = await store.serial(() => store.db.get(`SELECT s.body_json,n.body AS signal_body
    FROM nervous_garage_samples s JOIN nervous_signals n ON n.id=s.signal_id
    WHERE s.id=? AND n.id=? AND s.manager_id=? AND s.organization_id=? AND s.project_id=?`,
  proposal.sourceEventId, proposal.signalId, proposal.target, proposal.scope.organizationId, proposal.scope.projectId));
  if (!row) return null;
  const sample = JSON.parse(row.body_json);
  const signal = JSON.parse(row.signal_body);
  if (!matchingMeasurement(sample, signal, proposal)) return null;
  if (sample.observedAt > Date.now() || Date.now() - sample.observedAt > FRESH_MS) return null;
  return sample;
}

function matchingMeasurement(sample, signal, proposal) {
  if (scopeKey(sample.scope) !== scopeKey(proposal.scope)) return false;
  if (!sameSource(sample, signal)) return false;
  if (digest(signal.regulationPolicy || null) !== digest(sample.regulationPolicy || null)) return false;
  return digest(signal.regulationForecast || null) === digest(sample.forecast || null);
}

function sameSource(sample, signal) {
  return signal.sensorSource?.kind === 'garage-sqlite-v1' && signal.sensorSource.sampleId === sample.id
    && signal.observedAt === sample.observedAt && signal.pressure === sample.pressure
    && signal.agentId === sample.managerId && sample.sensor === 'garage-sqlite-v1';
}

function supportsInhibition(sample, policy) {
  if (!sample) return false;
  if (sample.regulationPolicy?.version !== policy.version) return false;
  if (sample.pressure >= policy.highThreshold) return true;
  if (!policy.predictiveHold || sample.queued < 1) return false;
  const prediction = sample.forecast;
  return prediction?.policyVersion === policy.version && prediction.pressure >= policy.highThreshold
    && Date.now() <= prediction.observedAt + prediction.horizonMs;
}

module.exports = { nativeMeasurement, supportsInhibition };
