'use strict';

const { getResponsibility } = require('./responsibilityService');

async function requireActive(db, input) {
  const responsibility = await getResponsibility(db, input.projectId);
  const control = await db.get('SELECT mode FROM ontogenesis_control WHERE project_id = ?', [input.projectId]);
  if (responsibility?.status !== 'active' || control?.mode !== 'running') {
    throw Object.assign(new Error('SHEV responsibility or project control is inactive.'), { code: 'SHEV_INACTIVE' });
  }
  if (input.expectedVersion !== undefined && input.expectedVersion !== responsibility.mandateVersion) {
    throw new Error('SHEV mandate changed; authorization is stale.');
  }
  if (input.action && responsibility.stage === 'observing') {
    throw new Error('SHEV observing stage cannot authorize this action.');
  }
  return responsibility;
}

function evidenceRefs(value) {
  return Array.isArray(value) && value.length > 0 && value.length <= 20
    && value.every(ref => typeof ref === 'string' && ref.trim() && ref.length <= 512);
}

function comparable(after, before) {
  return after && before && sameSource(after, before) && currentState(after)
    && Date.parse(after.observed_at) > Date.parse(before.observed_at);
}

function sameSource(after, before) {
  return after.dimension === before.dimension && after.domain === before.domain && after.source === before.source;
}

function currentState(after) {
  return ['state', 'degradation'].includes(after.kind) && after.epistemic_status === 'observed'
    && Date.parse(after.observed_at) <= Date.now() + 1000
    && (!after.valid_until || Date.parse(after.valid_until) > Date.now());
}

function assessment(value) {
  return value && ['confirmed', 'regressed', 'inconclusive'].includes(value.result)
    && typeof value.verifierRef === 'string' && value.verifierRef.trim()
    && evidenceRefs(value.evidenceRefs);
}

module.exports = { requireActive, comparable, assessment, evidenceRefs };
