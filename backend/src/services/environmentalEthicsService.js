'use strict';

/** Pure evaluators for environmental, animal and commons ethics. */

function clamp(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function analyticalResult(framework, observations, limitations = []) {
  return { framework, observations, limitations, executable: false, evidenceRequired: true };
}

function assessEcologicalPerspective({ anthropocentrism = 0, biocentrism = 0, ecocentrism = 0, deepEcology = 0 } = {}) {
  const dimensions = { anthropocentrism: clamp(anthropocentrism), biocentrism: clamp(biocentrism), ecocentrism: clamp(ecocentrism), deepEcology: clamp(deepEcology) };
  return analyticalResult('environmental-ethics', { dimensions, dominantPerspective: Object.entries(dimensions).sort((a, b) => b[1] - a[1])[0][0] });
}

function assessAnimalInterests({ action, sentience = 0, interests = [], rights = [], marginalCase = false } = {}) {
  if (!action) throw new Error('environmentalEthicsService.assessAnimalInterests requires an action');
  const moralStanding = clamp(sentience);
  const protectedInterests = interests.length > 0 || rights.length > 0;
  return analyticalResult('animal-rights-and-liberation', {
    action, sentience: moralStanding, interests, rights, marginalCase, moralStanding, protectedInterests,
    verdict: moralStanding >= 0.5 && protectedInterests ? 'requires-animal-interest-review' : 'insufficient-animal-evidence',
  });
}

function assessSustainability({ currentUse = 0, regeneration = 0, intergenerationalImpact = 0, stewardship = 0 } = {}) {
  const use = clamp(currentUse);
  const renewable = clamp(regeneration);
  const balance = renewable - use;
  return analyticalResult('sustainability-and-stewardship', {
    currentUse: use, regeneration: renewable, intergenerationalImpact: clamp(intergenerationalImpact), stewardship: clamp(stewardship), balance,
    verdict: balance >= 0 && intergenerationalImpact < 0.5 ? 'sustainable-candidate' : 'unsustainable-risk',
  });
}

function assessPrecaution({ uncertainty = 0, severity = 0, irreversibility = 0, alternatives = 0 } = {}) {
  const trigger = clamp(uncertainty) * clamp(severity) * clamp(irreversibility);
  return analyticalResult('precautionary-principle', {
    uncertainty: clamp(uncertainty), severity: clamp(severity), irreversibility: clamp(irreversibility), alternatives: clamp(alternatives), trigger,
    verdict: trigger >= 0.3 ? 'precaution-triggered' : 'precaution-not-triggered',
  });
}

function assessExternality({ privateCost = 0, socialCost = 0, internalizedCost = 0 } = {}) {
  const external = clamp(socialCost) - clamp(privateCost) - clamp(internalizedCost);
  return analyticalResult('externality', { privateCost: clamp(privateCost), socialCost: clamp(socialCost), internalizedCost: clamp(internalizedCost), externalCost: external, verdict: external > 0 ? 'negative-externality' : 'no-unpriced-negative-externality' });
}

function assessCommons({ users = [], resourceCapacity = 0, aggregateDemand = 0, governance = 0, monitoring = 0 } = {}) {
  const pressure = resourceCapacity > 0 ? aggregateDemand / resourceCapacity : 1;
  return analyticalResult('tragedy-of-the-commons', { users, resourceCapacity, aggregateDemand, governance: clamp(governance), monitoring: clamp(monitoring), pressure, verdict: pressure > 1 && governance < 0.5 ? 'commons-degradation-risk' : 'commons-governance-candidate' });
}

module.exports = { assessEcologicalPerspective, assessAnimalInterests, assessSustainability, assessPrecaution, assessExternality, assessCommons };
