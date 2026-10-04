'use strict';

const { createHash } = require('node:crypto');
const { WebAuditService, fingerprintWebConfig } = require('../../webAuditService');
const { recordObservation } = require('../observationService');
const { recordProjectEffect } = require('../effectService');

function configuredService() {
  const allowedHosts = (process.env.GENOS_BROWSER_VERIFICATION_HOSTS || '')
    .split(',').map(host => host.trim().toLowerCase()).filter(Boolean);
  return new WebAuditService({ allowedHosts });
}

function observationInput(input, receipt) {
  const identity = `${input.projectId}\0${input.dimension}\0${receipt.evidenceRefs[0]}`;
  const id = `web_${createHash('sha256').update(identity).digest('hex')}`;
  const observed = receipt.result !== 'inconclusive';
  return { id, projectId: input.projectId, domain: 'application-web',
    dimension: input.dimension, source: `web-audit:${receipt.configHash}`,
    observedAt: receipt.checkedAt,
    validUntil: new Date(Date.parse(receipt.checkedAt) + 3600000).toISOString(),
    kind: !observed ? 'blind_spot' : receipt.result === 'confirmed' ? 'state' : 'degradation',
    epistemicStatus: observed ? 'observed' : 'inconclusive',
    summary: `Audit web ${receipt.result} ; ${receipt.checks.map(check =>
      `${check.sensor}:${check.result}`).join(', ')}`,
    evidenceRefs: receipt.evidenceRefs };
}

async function recordWebObservation(db, input, service = configuredService()) {
  if (!input?.projectId || !input.dimension) throw new TypeError('Web observation needs a project dimension.');
  const receipt = await service.run(input.config);
  const observation = await recordObservation(db, observationInput(input, receipt));
  return { observation, receipt };
}

async function completedInitiative(db, input) {
  const initiative = await db.get(`SELECT i.observation_id, i.task_id, i.status,
    o.source FROM shev_initiatives i JOIN shev_observations o ON o.id = i.observation_id
    AND o.project_id = i.project_id WHERE i.project_id = ? AND i.id = ?`,
  [input.projectId, input.initiativeId]);
  const task = initiative?.task_id && await db.get('SELECT status FROM ontogenesis_backlog WHERE id = ?',
    [initiative.task_id]);
  if (initiative?.status !== 'queued' || task?.status !== 'done') {
    throw new Error('SHEV web verification requires a completed queued task.');
  }
  return initiative;
}

async function verifyWebEffect(db, input, service = configuredService()) {
  if (!input?.projectId || !input.initiativeId || !input.dimension) {
    throw new TypeError('SHEV web effect needs project, initiative and dimension.');
  }
  const initiative = await completedInitiative(db, input);
  if (initiative.source !== `web-audit:${fingerprintWebConfig(input.config)}`) {
    throw new Error('SHEV web audit criteria changed after intervention.');
  }
  const existing = await db.get('SELECT * FROM shev_effects WHERE initiative_id = ?', [input.initiativeId]);
  if (existing) return { result: existing.project_result, observation: null,
    receipt: null, effect: { ...existing, replayed: true } };
  const { observation, receipt } = await recordWebObservation(db, input, service);
  if (receipt.result === 'inconclusive') return { result: 'inconclusive', observation, receipt, effect: null };
  const effect = await recordProjectEffect(db, { projectId: input.projectId,
    initiativeId: input.initiativeId, postObservationId: observation.id,
    verify: async () => ({ result: receipt.result, verifierRef: receipt.verifierRef,
      evidenceRefs: receipt.evidenceRefs }) });
  return { result: effect.project_result, observation, receipt, effect };
}

module.exports = { recordWebObservation, verifyWebEffect };
