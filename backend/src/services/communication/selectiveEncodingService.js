'use strict';

/**
 * Encodage sélectif — le médium le moins cher suffisant.
 *
 * Échelle : STRUCTURED (formal-result) < SIGNAL < DIALECT <
 * MICRO_UTTERANCE < DIALOGUE < HUMAN. Le verbal n'est choisi que sur
 * triggers explicites (ONTOLOGY_GAP, AMBIGUOUS_INTENT, ...).
 */

const VERBAL_TRIGGERS = new Set([
  'ONTOLOGY_GAP', 'AMBIGUOUS_INTENT', 'HIDDEN_ASSUMPTION', 'PROTOCOL_MISMATCH',
  'NORM_CONFLICT', 'COMMITMENT_NEGOTIATION', 'NOVEL_CONCEPT_FORMATION', 'HUMAN_EXPLANATION_REQUIRED'
]);

function isVerbalTrigger(trigger) {
  if (!trigger) return false;
  return VERBAL_TRIGGERS.has(trigger);
}

function encodingForPurpose(purpose) {
  const table = {
    verify: 'formal-result', commit: 'contract-hash', challenge: 'formal-result',
    teach: 'ontology-patch', handoff: 'formal-result', delegate: 'formal-result'
  };
  const known = table[purpose];
  if (known) return known;
  return 'semantic-fingerprint';
}

function selectEncoding(input) {
  if (input.novelty <= 0) {
    return { action: 'SILENCE', encoding: 'semantic-fingerprint', reasonCodes: ['NOVELTY_LOW'] };
  }
  if (input.humanRequired) {
    return { action: 'HUMAN', encoding: 'formal-result', reasonCodes: ['DISCLOSURE_RISK'] };
  }
  if (isVerbalTrigger(input.trigger) && input.negotiation) {
    return { action: 'DIALOGUE', encoding: 'formal-result', reasonCodes: ['COMMON_GROUND_LOW'] };
  }
  if (isVerbalTrigger(input.trigger)) {
    return { action: 'MICRO_UTTERANCE', encoding: 'formal-result', reasonCodes: ['COMMON_GROUND_MEDIUM'] };
  }
  if (input.dialectAvailable && input.commonGround >= 0.7 && input.riskLevel <= 1) {
    return { action: 'DIALECT', encoding: 'symbol-dialect', reasonCodes: ['COMMON_GROUND_HIGH', 'TOKEN_SAVINGS'] };
  }
  if (input.commonGround >= 0.5) {
    return { action: 'STRUCTURED', encoding: encodingForPurpose(input.purpose), reasonCodes: ['COMMON_GROUND_MEDIUM'] };
  }
  return { action: 'SIGNAL', encoding: 'semantic-fingerprint', reasonCodes: ['COMMON_GROUND_LOW'] };
}

module.exports = { VERBAL_TRIGGERS, selectEncoding };
