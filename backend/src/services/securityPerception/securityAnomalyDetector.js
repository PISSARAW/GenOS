'use strict';

const { uniqueText, digest } = require('./securityPerceptionPrimitives');
const baseline = require('./securityBaselineEngine');

function detect(state, observation, sensor) {
  const facts = uniqueText([...(observation.facts || []), ...(observation.evidenceRefs || [])]);
  const signals = uniqueText(observation.signals);
  const ruleMatches = uniqueText(observation.ruleMatches);
  const deviation = baseline.deviation(state, observation);
  const confidence = Math.min(1, (ruleMatches.length ? 0.65 : 0) + (signals.length > 1 ? 0.2 : 0)
    + (deviation?.significant ? 0.15 : 0)) * sensor.quality;
  const supported = facts.length > 0 || ruleMatches.length > 0 || signals.length > 0;
  const classification = !supported ? 'indeterminate' : confidence >= 0.6 ? 'anomaly' : 'observe';
  const evidence = uniqueText([...facts, ...ruleMatches, ...signals]);
  return { classification, confidence, evidence, deviation, observationHash: digest({ observation, evidence }) };
}

module.exports = { detect };
