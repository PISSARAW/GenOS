'use strict';

const crypto = require('crypto');
const { recordCheckpoint } = require('./missionOrganismService');
const { isFunctionCovered } = require('./missionOrganismService');

const SURVIVAL_MODES = Object.freeze({
  ACTIVE: 'active',
  QUIESCENT: 'quiescent',
  CRYPTOBIOSIS: 'cryptobiosis',
  APOPTOSIS: 'apoptosis'
});

const WAKE_CONDITION_KINDS = Object.freeze({
  BUDGET_ADDED: 'budget_added',
  PROVIDER_AVAILABLE: 'provider_available',
  HUMAN_RESOLVES_GATE: 'human_resolves_gate',
  EXTERNAL_EVENT: 'external_event',
  TIME_ELAPSED: 'time_elapsed'
});

function survivalDecisionId() {
  return `surv_${crypto.randomUUID()}`;
}

function quiescenceEligibility(input = {}) {
  const missionViable = input.missionViable !== false;
  const noSafeAction = input.noSafeAction === true;
  const waitingExternal = Boolean(input.waitingFor && input.waitingFor.length > 0);
  return {
    eligible: missionViable && noSafeAction && waitingExternal,
    missionViable,
    noSafeAction,
    waitingExternal,
    waitingFor: input.waitingFor || []
  };
}

function cryptobiosisEligibility(input = {}) {
  const missionIncomplete = input.missionIncomplete !== false;
  const budgetInsufficient = input.budgetInsufficient === true;
  return {
    eligible: missionIncomplete && budgetInsufficient,
    missionIncomplete,
    budgetInsufficient
  };
}

function apoptosisEligibility(input = {}) {
  const survivalImpossible = input.survivalImpossible === true;
  const homeostasisUnreachable = input.homeostasisUnreachable === true;
  const humanAuthorized = input.humanAuthorized === true;
  return {
    eligible: survivalImpossible && homeostasisUnreachable && humanAuthorized,
    survivalImpossible,
    homeostasisUnreachable,
    humanAuthorized,
    note: 'Apoptose systémique : uniquement lorsque la survie est impossible et autorisée par un humain.'
  };
}

function wakeCondition(kind, payload = {}) {
  if (!Object.values(WAKE_CONDITION_KINDS).includes(kind)) {
    throw new Error(`Unknown wake condition kind '${kind}'. Allowed: ${Object.values(WAKE_CONDITION_KINDS).join(', ')}`);
  }
  return {
    id: `wake_${crypto.randomUUID()}`,
    kind,
    payload,
    armed: true,
    triggeredAt: null,
    armedAt: new Date().toISOString()
  };
}

function enterQuiescence(input = {}) {
  const eligibility = quiescenceEligibility(input);
  if (!eligibility.eligible) {
    return { entered: false, reason: 'Mission not eligible for quiescence', eligibility };
  }
  const conditions = (input.wakeConditions || []).map((c) => wakeCondition(c.kind, c.payload));
  return {
    entered: true,
    mode: SURVIVAL_MODES.QUIESCENT,
    eligibility,
    wakeConditions: conditions,
    persisted: {
      homeostaticState: input.homeostaticState || null,
      remainingWork: input.remainingWork || null,
      evidence: input.evidence || []
    },
    enteredAt: new Date().toISOString()
  };
}

function enterCryptobiosis(input = {}) {
  const eligibility = cryptobiosisEligibility(input);
  if (!eligibility.eligible) {
    return { entered: false, reason: 'Mission not eligible for cryptobiosis', eligibility };
  }
  const conditions = (input.wakeConditions || []).map((c) => wakeCondition(c.kind, c.payload));
  return {
    entered: true,
    mode: SURVIVAL_MODES.CRYPTOBIOSIS,
    eligibility,
    wakeConditions: conditions,
    persisted: {
      homeostaticState: input.homeostaticState || null,
      plan: input.plan || null,
      checkpoints: input.checkpoints || [],
      evidence: input.evidence || [],
      remainingWork: input.remainingWork || null
    },
    enteredAt: new Date().toISOString()
  };
}

function evaluateWakeConditions(conditions, event = {}) {
  return (conditions || []).map((condition) => {
    const triggered = condition.armed && condition.kind === event.kind;
    if (triggered) {
      return { ...condition, armed: false, triggeredAt: new Date().toISOString() };
    }
    return condition;
  });
}

function wakeFromDormancy(input = {}) {
  const conditions = evaluateWakeConditions(input.wakeConditions, input.event);
  const anyTriggered = conditions.some((c) => c.triggeredAt);
  return {
    woken: anyTriggered,
    mode: anyTriggered ? SURVIVAL_MODES.ACTIVE : (input.currentMode || SURVIVAL_MODES.QUIESCENT),
    wakeConditions: conditions,
    restored: anyTriggered ? (input.persisted || {}) : null,
    wokenAt: anyTriggered ? new Date().toISOString() : null
  };
}

function apoptosisDecision(input = {}) {
  const eligibility = apoptosisEligibility(input);
  if (!eligibility.eligible) {
    return { proceed: false, reason: 'Systemic apoptosis not authorized', eligibility };
  }
  return {
    proceed: true,
    mode: SURVIVAL_MODES.APOPTOSIS,
    eligibility,
    finalState: input.finalState || null,
    evidence: input.evidence || [],
    decidedAt: new Date().toISOString()
  };
}

function checkpointBeforeDormancy(organism, reason) {
  if (!organism) throw new Error('organism is required');
  const updated = recordCheckpoint(organism, {
    state: organism.phenotype ? organism.phenotype.currentState : null,
    injury: reason || 'dormancy',
    repair: null,
    outcome: 'pre_dormancy_checkpoint',
    successful: null
  });
  return updated;
}

function survivalMode(input = {}) {
  const apoptosis = apoptosisEligibility(input);
  if (apoptosis.eligible) return SURVIVAL_MODES.APOPTOSIS;
  const cryptobiosis = cryptobiosisEligibility(input);
  if (cryptobiosis.eligible) return SURVIVAL_MODES.CRYPTOBIOSIS;
  const quiescence = quiescenceEligibility(input);
  if (quiescence.eligible) return SURVIVAL_MODES.QUIESCENT;
  return SURVIVAL_MODES.ACTIVE;
}

module.exports = {
  SURVIVAL_MODES,
  WAKE_CONDITION_KINDS,
  quiescenceEligibility,
  cryptobiosisEligibility,
  apoptosisEligibility,
  wakeCondition,
  enterQuiescence,
  enterCryptobiosis,
  evaluateWakeConditions,
  wakeFromDormancy,
  apoptosisDecision,
  checkpointBeforeDormancy,
  survivalMode
};