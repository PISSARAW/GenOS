'use strict';

function scoreCognitiveFit(morphology, cognitivePhenotype) {
  if (!cognitivePhenotype) return 0;
  const requiredCaps = morphology.requiredCapabilities || [];
  const phenotypeCaps = cognitivePhenotype.capabilities || [];
  if (requiredCaps.length === 0) return 0.5;
  const owned = new Set(phenotypeCaps);
  const covered = requiredCaps.filter((c) => owned.has(c)).length;
  return covered / requiredCaps.length;
}

function scoreStrategyFit(morphology, strategyTrajectory) {
  if (!strategyTrajectory) return 0;
  const currentPhase = strategyTrajectory.currentPhase || 'explore';
  const morphologyPhase = morphology.preferredPhase || 'any';
  if (morphologyPhase === 'any') return 0.5;
  return morphologyPhase === currentPhase ? 1.0 : 0.2;
}

function scoreRegulatoryFit(morphology, regulatoryState) {
  if (!regulatoryState) return 0;
  const constraints = regulatoryState.constraints || [];
  const violations = constraints.filter((c) => c.blocks === morphology.topology);
  return violations.length === 0 ? 1.0 : Math.max(0, 1.0 - violations.length * 0.3);
}

function computeMorphologyUtility(ctx) {
  const { morphology, epistemicState, memoryContext, regulatoryState, cognitivePhenotype, strategyTrajectory } = ctx;
  const { progress, infoGain, evidenceGain, uncertaintyReduction } = epistemicUtilityFeatures(epistemicState);
  const memoryReuse = memoryContext ? memoryContext.reuseScore || 0 : 0;
  const cognitiveFit = scoreCognitiveFit(morphology, cognitivePhenotype);
  const strategyFit = scoreStrategyFit(morphology, strategyTrajectory);
  const regulatoryFit = scoreRegulatoryFit(morphology, regulatoryState);
  const resilienceGain = regulatoryState ? regulatoryState.resilienceScore || 0 : 0;
  const { tokenCost, latency, transitionCost, coordinationCost, risk } = morphologyCostFeatures(morphology);
  return progress + infoGain + evidenceGain + uncertaintyReduction + memoryReuse + cognitiveFit + strategyFit + regulatoryFit + resilienceGain - tokenCost - latency - transitionCost - coordinationCost - risk;
}


function epistemicUtilityFeatures(epistemicState) {
  const progress = (epistemicState && epistemicState.expectedProgress) || 0;
  const infoGain = (epistemicState && epistemicState.informationGain) || 0;
  const evidenceGain = (epistemicState && epistemicState.evidenceGain) || 0;
  const uncertaintyReduction = (epistemicState && epistemicState.uncertaintyReduction) || 0;
  return { progress, infoGain, evidenceGain, uncertaintyReduction };
}

function morphologyCostFeatures(morphology) {
  const tokenCost = morphology.tokenCost || 0;
  const latency = morphology.latency || 0;
  const transitionCost = morphology.transitionCost || 0;
  const coordinationCost = morphology.coordinationCost || 0;
  const risk = morphology.risk || 0;
  return { tokenCost, latency, transitionCost, coordinationCost, risk };
}
module.exports = { computeMorphologyUtility };
