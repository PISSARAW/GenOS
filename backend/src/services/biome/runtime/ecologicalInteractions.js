'use strict';

const { createEcologicalLink } = require('../contracts/ecologicalLink');

function update(ecology, observations = []) {
  const effects = [];
  for (const observation of observations) {
    validate(ecology, observation);
    const link = createEcologicalLink(observation);
    link.evidenceRefs = observation.evidenceRefs;
    ecology.interactionGraph = ecology.interactionGraph.filter(item =>
      item.sourceId !== link.sourceId || item.targetId !== link.targetId || item.type !== link.type);
    if (link.historicalEffect > 0 || link.type === 'dependency') ecology.interactionGraph.push(link);
    effects.push({ type: 'ECOLOGICAL_LINK_REWIRED', status: 'applied', sourceId: link.sourceId,
      targetId: link.targetId, retained: link.historicalEffect > 0 || link.type === 'dependency' });
  }
  ecology.ecologicalState.keystoneValue = keystones(ecology.interactionGraph);
  return effects;
}

function validate(ecology, observation) {
  const ids = new Set(ecology.populations.map(p => p.populationId));
  const endpoints = ids.has(observation.sourceId) && ids.has(observation.targetId);
  const evidence = Array.isArray(observation.evidenceRefs) && observation.evidenceRefs.length > 0;
  if (!endpoints || !evidence || !Number.isFinite(observation.historicalEffect)) {
    throw Object.assign(new Error('Interaction rewiring requires known populations and measured evidence.'), {
      code: 'BIOME_INTERACTION_EVIDENCE_REQUIRED'
    });
  }
}

function keystones(links) {
  return links.reduce((scores, link) => {
    scores[link.sourceId] = (scores[link.sourceId] || 0) + Math.max(0, link.historicalEffect) * link.confidence;
    return scores;
  }, {});
}

module.exports = { update };
