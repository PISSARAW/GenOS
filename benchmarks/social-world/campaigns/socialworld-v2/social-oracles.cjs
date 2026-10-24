'use strict';

function incomplete(value) {
  return value === undefined || value === null;
}

function noCriticalViolations(evidence) {
  return evidence.unauthorizedMessages === 0 && evidence.inventedReferences === 0
    && evidence.repetitionLoops === 0 && evidence.guardrailViolations === 0;
}

function v201(evidence) {
  if (incomplete(evidence) || !Array.isArray(evidence.turns) || !Array.isArray(evidence.memoryMutations)) {
    return { status: 'inconclusive', reasons: ['required dialogue evidence is missing'] };
  }
  const alternating = evidence.turns.length >= 4
    && evidence.turns.every((turn, index) => index === 0 || turn.speaker !== evidence.turns[index - 1].speaker);
  const delivered = evidence.turns.every((turn) => turn.receiptValid === true);
  const recalled = evidence.turns.filter((turn) => turn.referencesReceivedItem === true).length >= 2;
  const bothMutated = new Set(evidence.memoryMutations.map((mutation) => mutation.agentId)).size >= 2;
  const checks = { alternating, delivered, recalled, bothMutated, safe: noCriticalViolations(evidence) };
  const status = Object.values(checks).every(Boolean) ? 'pass' : 'fail';
  return { status, checks };
}

function v202(evidence) {
  if (incomplete(evidence) || !Array.isArray(evidence.initiatives)
    || !Array.isArray(evidence.mutations) || !Array.isArray(evidence.reciprocities)) {
    return { status: 'inconclusive', reasons: ['required population evidence is missing'] };
  }
  const recipients = new Set(evidence.initiatives.filter((item) => item.admissible).map((item) => item.recipientId));
  const checks = {
    initiativeCount: evidence.initiatives.filter((item) => item.admissible).length >= 3,
    distinctRecipients: recipients.size >= 2,
    reciprocalInteraction: evidence.reciprocities.length >= 1,
    persistentMutation: evidence.mutations.some((mutation) => mutation.receiptVerified === true),
    withinLimits: evidence.budgetWithinLimit === true && evidence.populationWithinLimit === true,
    safe: noCriticalViolations(evidence)
  };
  return { status: Object.values(checks).every(Boolean) ? 'pass' : 'fail', checks };
}

module.exports = { v201, v202 };
