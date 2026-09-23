'use strict';

function clamp01(input) {
  const value = Number(input);
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function vitalSigns(input) {
  const source = input || {};
  return {
    spi: clamp01(source.spi),
    epistemicHealth: clamp01(source.epistemicHealth),
    diversity: clamp01(source.diversity),
    coordinationEfficiency: clamp01(source.coordinationEfficiency),
    communicationLoad: clamp01(source.communicationLoad),
    resourceEfficiency: clamp01(source.resourceEfficiency),
    recoveryReadiness: clamp01(source.recoveryReadiness),
    environmentalFit: clamp01(source.environmentalFit)
  };
}

function healthState(input) {
  const source = input || {};
  const degraded = source.observabilityDegraded === true;
  return {
    missionProgress: clamp01(source.missionProgress),
    epistemicHealth: degraded ? 0.2 : clamp01(source.epistemicHealth),
    cognitiveDiversity: clamp01(source.cognitiveDiversity),
    communicationHealth: clamp01(source.communicationHealth),
    topologyHealth: clamp01(source.topologyHealth),
    resourceHealth: clamp01(source.resourceHealth),
    modelHealth: clamp01(source.modelHealth),
    proceduralHealth: clamp01(source.proceduralHealth),
    memoryHealth: clamp01(source.memoryHealth),
    resilienceHealth: clamp01(source.resilienceHealth),
    governanceHealth: clamp01(source.governanceHealth),
    environmentalFit: clamp01(source.environmentalFit),
    plasticity: clamp01(source.plasticity),
    coordinationOverhead: clamp01(source.coordinationOverhead),
    systemicRisk: degraded ? 0.8 : clamp01(source.systemicRisk),
    observabilityDegraded: degraded,
    epistemicNote: degraded ? 'unknown / partially observed' : 'observed'
  };
}

function diagnoseFlailing(input) {
  const switches = Number((input || {}).topologySwitches || 0);
  const progress = Number((input || {}).progressDelta || 0);
  const burn = Number((input || {}).tokenBurn || 0);
  const flailing = switches >= 8 && progress <= 0 && burn > 0.6;
  return { flailing, action: flailing ? 'stabilize-topology+cooldown' : 'none' };
}

function diagnoseMonoculture(input) {
  const diversity = clamp01((input || {}).diversity);
  const correlation = clamp01((input || {}).errorCorrelation);
  const monoculture = diversity < 0.2 && correlation > 0.85;
  return { monoculture, action: monoculture ? 'spawn-independent-phenotype' : 'none' };
}

module.exports = {
  vitalSigns,
  healthState,
  diagnoseFlailing,
  diagnoseMonoculture
};
