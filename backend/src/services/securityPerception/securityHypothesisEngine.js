'use strict';

const { digest } = require('./securityPerceptionPrimitives');

function build(detection, observation) {
  if (!detection.evidence.length) return [];
  const candidates = detection.evidence.map((evidence, index) => ({
    statement: `Le signal observé « ${evidence.slice(0, 160)} » explique une partie de l'écart.`,
    falsifier: `Une mesure indépendante ne confirme pas « ${evidence.slice(0, 120)} ».`,
    evidenceRefs: [evidence], confidence: detection.confidence / (index + 1), source: 'deterministic-evidence'
  }));
  if (observation.correlation) candidates.push({ statement: String(observation.correlation).slice(0, 256),
    falsifier: 'La corrélation ne se reproduit pas dans une fenêtre temporelle indépendante.',
    evidenceRefs: detection.evidence, confidence: detection.confidence * 0.5, source: 'correlation-hypothesis' });
  return candidates.slice(0, 5).map((item) => ({ ...item, id: `hyp_${digest(item).slice(0, 20)}` }));
}

module.exports = { build };
