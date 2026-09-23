'use strict';

/**
 * FossilMorphologyService — enrichit ce que l'on fossilise (X13).
 *
 * Au moment de l'extinction d'une lignée significative, le runtime
 * conserve trajectoires morphologiques + preuves + coûts dans le
 * mineral_payload (zone libre, sans toucher au noyau immuable).
 * Tri hard/soft parts respecté : jamais de snapshot complet.
 */

const HARD_FIELDS = Object.freeze([
  'dnaRef', 'phenotype', 'capabilityManifest', 'strategyTrajectory',
  'topologyTrajectory', 'evidenceRefs', 'failureReason', 'regretTrajectory'
]);

function pickHardParts(input) {
  const parts = [];
  for (const field of HARD_FIELDS) {
    if (input[field] !== undefined) parts.push(`${field}:${shortOf(input[field])}`);
  }
  return parts;
}

function shortOf(value) {
  const text = Array.isArray(value) ? value.join(',') : String(value);
  return text.slice(0, 120);
}

function basePayloadOf(input) {
  return {
    dnaRef: input.dnaRef || null,
    phenotype: input.phenotype || null,
    capabilityManifest: input.capabilityManifest || [],
    plasmids: input.plasmids || [],
    strategyTrajectory: input.strategyTrajectory || []
  };
}

function socialPayloadOf(input) {
  return {
    topologyTrajectory: input.topologyTrajectory || [],
    relations: input.relations || [],
    creativeMechanisms: input.creativeMechanisms || [],
    communicationBehavior: input.communicationBehavior || null,
    evidenceRefs: input.evidenceRefs || []
  };
}

function outcomePayloadOf(input) {
  return {
    contradictions: input.contradictions || [],
    regretTrajectory: input.regretTrajectory || [],
    failureReason: input.failureReason || null,
    tokenCost: input.tokenCost || 0,
    computeCost: input.computeCost || 0
  };
}

function morphologyPayloadOf(input) {
  return { ...basePayloadOf(input), ...socialPayloadOf(input), ...outcomePayloadOf(input) };
}

function enrichFossilInput(input) {
  const payload = morphologyPayloadOf(input);
  const hardParts = [...(input.hardParts || []), ...pickHardParts(payload)];
  return { ...input, hardParts, mineralPayload: { ...(input.mineralPayload || {}), ...payload } };
}

module.exports = { enrichFossilInput, morphologyPayloadOf };
