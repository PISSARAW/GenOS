'use strict';

const crypto = require('crypto');
const { recordScar, recordCheckpoint, isFunctionCovered } = require('./missionOrganismService');
const { emitCellDeath, emitTissueRegeneration } = require('./vitalSignalsService');

const DAMAGE_ASSESSMENT_SCHEMA = 'genos.damage-assessment/v1alpha1';

const LOSS_VERDICTS = Object.freeze({
  COVERED: 'covered',
  REGENERATE: 'regenerate',
  OBSOLETE: 'obsolete'
});

function damageAssessmentId() {
  return `dmg_${crypto.randomUUID()}`;
}

function lostCell(input = {}) {
  return {
    identifier: input.identifier || null,
    kind: input.kind || 'workers',
    role: input.role || null,
    reason: input.reason || 'unknown',
    lastEvidence: input.lastEvidence || null,
    at: input.at || new Date().toISOString()
  };
}

function survivingStructure(organism) {
  const survivors = {};
  for (const kind of Object.keys(organism.tissues || {})) {
    const tissue = organism.tissues[kind];
    if (Array.isArray(tissue)) {
      survivors[kind] = tissue.filter((cell) => cell.status === 'alive');
    }
  }
  return survivors;
}

function rolesCoveredBy(survivors) {
  const roles = new Set();
  for (const tissue of Object.values(survivors)) {
    for (const cell of tissue) {
      if (cell.role) roles.add(cell.role);
    }
  }
  return roles;
}

function verdictForLostRole(lostRole, coveredRoles) {
  if (!lostRole) return LOSS_VERDICTS.OBSOLETE;
  if (coveredRoles.has(lostRole)) return LOSS_VERDICTS.COVERED;
  return LOSS_VERDICTS.REGENERATE;
}

function assessDamage(input = {}) {
  const organism = input.organism;
  if (!organism) throw new Error('organism is required for damage assessment');
  const lostCells = (input.lostCells || []).map(lostCell);
  const survivors = survivingStructure(organism);
  const coveredRoles = rolesCoveredBy(survivors);
  const evaluations = lostCells.map((cell) => ({
    cell,
    verdict: verdictForLostRole(cell.role, coveredRoles)
  }));
  const regenerate = evaluations.filter((e) => e.verdict === LOSS_VERDICTS.REGENERATE);
  return {
    schema: DAMAGE_ASSESSMENT_SCHEMA,
    id: damageAssessmentId(),
    organismId: organism.id,
    lostCells: evaluations,
    survivors,
    coveredRoles: Array.from(coveredRoles),
    mustRegenerate: regenerate.map((e) => e.cell),
    organismViable: evaluations.every((e) => e.verdict !== LOSS_VERDICTS.REGENERATE) || regenerate.length < lostCells.length,
    assessedAt: new Date().toISOString()
  };
}

function regenerationPlanFromAssessment(assessment) {
  return assessment.mustRegenerate.map((cell) => ({
    lostIdentifier: cell.identifier,
    kind: cell.kind,
    role: cell.role,
    method: 'regenerate_minimum_necessary',
    status: 'requested',
    requiresFunctionalEquivalence: true
  }));
}

function markCellStatus(organism, identifier, status) {
  const updated = { ...organism, tissues: {} };
  for (const kind of Object.keys(organism.tissues)) {
    updated.tissues[kind] = organism.tissues[kind].map((cell) => (
      cell.identifier === identifier ? { ...cell, status } : cell
    ));
  }
  return updated;
}

function applyCellDeath(input = {}) {
  const { organism, cell, reason } = input;
  if (!organism || !cell) throw new Error('organism and cell are required');
  const updated = markCellStatus(organism, cell.identifier, 'dead');
  const assessment = assessDamage({ organism: updated, lostCells: [cell] });
  const scarred = recordScar(updated, {
    injury: `cell_death:${cell.identifier}`,
    repair: null,
    stateBefore: cell.role,
    stateAfter: null,
    successful: null
  });
  const event = emitCellDeath({
    cell: cell.identifier,
    mission: input.mission || null,
    role: cell.role,
    reason: reason || 'unknown',
    organismId: organism.id
  });
  return { organism: scarred, assessment, event };
}

function regenerateCell(input = {}) {
  const { organism, plan } = input;
  if (!organism || !plan) throw new Error('organism and plan are required');
  const replacementId = plan.replacementId || `cell_${crypto.randomUUID()}`;
  const updated = { ...organism, tissues: { ...organism.tissues } };
  updated.tissues[plan.kind] = [
    ...(updated.tissues[plan.kind] || []),
    { kind: plan.kind, identifier: replacementId, role: plan.role, status: 'alive', since: new Date().toISOString() }
  ];
  const scarred = recordScar(updated, {
    injury: `cell_loss:${plan.lostIdentifier}`,
    repair: `regenerate:${replacementId}`,
    stateBefore: plan.role,
    stateAfter: plan.role,
    successful: true
  });
  const event = emitTissueRegeneration({
    tissue: plan.kind,
    mission: input.mission || null,
    lostRole: plan.role,
    replacementId,
    method: plan.method || 'regeneration'
  });
  return { organism: scarred, replacementId, event };
}

function verifyFunctionalEquivalence(organism, requiredRoles) {
  const covered = isFunctionCovered(organism, requiredRoles || []);
  return {
    equivalent: covered,
    requiredRoles: requiredRoles || [],
    checkedAt: new Date().toISOString()
  };
}

function checkpointBeforeRiskyAction(input = {}) {
  const { organism, reason } = input;
  if (!organism) throw new Error('organism is required');
  const updated = recordCheckpoint(organism, {
    state: organism.phenotype ? organism.phenotype.currentState : null,
    injury: null,
    repair: null,
    outcome: reason || 'pre_action_checkpoint',
    successful: null
  });
  return { organism: updated, reason: reason || 'pre_action_checkpoint' };
}

module.exports = {
  DAMAGE_ASSESSMENT_SCHEMA,
  LOSS_VERDICTS,
  assessDamage,
  regenerationPlanFromAssessment,
  applyCellDeath,
  regenerateCell,
  verifyFunctionalEquivalence,
  checkpointBeforeRiskyAction,
  survivingStructure,
  rolesCoveredBy
};