'use strict';

/**
 * Coût de communication — coefficients configurables, calibrés
 * expérimentalement (ADR 003x invariant 11 : mesures réelles, pas chars/4).
 *
 * Unités relatives : 1.0 ~= coût d'un wakeup LLM borné simple.
 */

const DEFAULT_COEFFICIENTS = Object.freeze({
  tokenInPer1k: 0.06,
  tokenOutPer1k: 0.18,
  cognitiveWake: 0.4,
  fanoutPerRecipient: 0.02,
  contaminationPerUnit: 0.2,
  disclosurePerUnit: 0.1
});

const ENCODING_TOKENS = Object.freeze({
  'formal-result': { input: 40, output: 0, wake: 0 },
  'ontology-patch': { input: 60, output: 0, wake: 0 },
  'contract-hash': { input: 20, output: 0, wake: 0 },
  'semantic-fingerprint': { input: 10, output: 0, wake: 0 },
  'symbol-dialect': { input: 8, output: 0, wake: 0 },
  'micro-utterance': { input: 30, output: 25, wake: 1 },
  'dialogue-turn': { input: 200, output: 150, wake: 1 }
});

const GROUNDING_COST = Object.freeze({
  none: 0,
  transport_ack: 0.005,
  semantic_ack: 0.015,
  action_ack: 0.03,
  verified_ack: 0.05,
  human_confirmation: 2.0
});

function coefficientsOf(input) {
  return Object.assign({}, DEFAULT_COEFFICIENTS, input.coefficients);
}

function tokensOf(encoding) {
  const known = ENCODING_TOKENS[encoding];
  if (known) return known;
  return { input: 50, output: 0, wake: 0 };
}

function groundingPriceOf(grounding) {
  const known = GROUNDING_COST[grounding];
  if (known === undefined) return 0.15;
  return known;
}

function estimateCost(input) {
  const coef = coefficientsOf(input);
  const tokens = tokensOf(input.encoding);
  const recipients = Math.max(0, Number(input.recipientCount || 0));
  const tokenCost = (tokens.input * coef.tokenInPer1k + tokens.output * coef.tokenOutPer1k) / 1000;
  const wakeCost = tokens.wake * coef.cognitiveWake;
  const fanoutCost = recipients * coef.fanoutPerRecipient;
  const groundingCost = groundingPriceOf(input.grounding);
  const contamination = coef.contaminationPerUnit * Number(input.contaminationRisk || 0);
  const disclosure = coef.disclosurePerUnit * Number(input.disclosureRisk || 0);
  const total = tokenCost + wakeCost + fanoutCost + groundingCost + contamination + disclosure;
  return {
    total,
    breakdown: {
      tokens: tokenCost, cognitiveWake: wakeCost, fanout: fanoutCost,
      grounding: groundingCost, contamination, disclosure
    },
    tokensInput: tokens.input, tokensOutput: tokens.output, wakeups: tokens.wake
  };
}

function estimateNaiveBroadcast(input) {
  const coef = coefficientsOf(input);
  const recipients = Math.max(1, Number(input.recipientCount || 1));
  const perRecipient = (300 * coef.tokenInPer1k + 100 * coef.tokenOutPer1k) / 1000 + coef.cognitiveWake;
  return { total: perRecipient * recipients, perRecipient, recipients };
}

module.exports = { DEFAULT_COEFFICIENTS, estimateCost, estimateNaiveBroadcast };
