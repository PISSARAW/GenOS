'use strict';

const { createTopologyRegistry } = require('./registry/topologyRegistry');
const { topologyExpression, cloneExpression } = require('./expression/morphologyExpression');
const { buildCompositeCandidates } = require('./adaptiveTopologyComposites');
const { parseExpression } = require('./expression/morphologyExpressionParser');
const { compileExpression } = require('./graph/morphologyCompiler');
const { checkMorphologyTypes } = require('./typing/morphologyTypeChecker');
const { knownMaturity, proposalEligible } = require('./registry/variantIdentity');

const MAX_COMPOSITE_PAIRS = 128;
const MATURITY_ORDER = Object.freeze({ implemented: 0, stable: 1, partial: 2,
  experimental: 3, conceptual: 4 });

function generateAdaptiveTopologyCandidates(input = {}) {
  const registry = input.registry || createTopologyRegistry();
  const current = currentCandidate(input, registry);
  const contracts = topologyContracts(registry);
  const capabilitySet = normalizeCapabilities(input.availableTopologyCapabilities);
  const topologyIds = registry.list().slice().sort();
  const pools = buildCandidatePools({ input, registry, topologyIds, contracts, capabilitySet });
  const candidates = [current, ...pools.topology, ...pools.variant,
    ...pools.composite.candidates, ...pools.vetoed];
  return {
    candidates,
    stats: {
      candidateCount: candidates.length,
      candidatePoolTruncated: pools.composite.stats.truncated,
      registeredTopologyCount: topologyIds.length,
      registeredVariantCount: topologyIds.reduce((count, topologyId) =>
        count + registry.variants.listEntries(topologyId).length, 0),
      topologyCandidateCount: candidates.filter((candidate) => candidate.kind === 'TOPOLOGY').length,
      variantCandidateCount: candidates.filter((candidate) => candidate.kind === 'VARIANT').length,
      compositeCandidateCount: pools.composite.candidates.length,
      compositeCandidatePoolTruncated: pools.composite.stats.truncated,
      vetoedCandidateCount: candidates.filter((candidate) => candidate.admissibility === 'rejected').length,
      compositePairsExamined: pools.composite.stats.examined,
      compositePairCeiling: pools.composite.stats.ceiling,
      compositePairsPotential: pools.composite.stats.potential,
      compositePairsTruncated: pools.composite.stats.truncated,
      compositeOperators: pools.composite.stats.operators,
      compositeCandidatesByOperator: pools.composite.stats.candidatesByOperator,
      compositePairsExaminedByOperator: pools.composite.stats.examinedByOperator,
      compositeUnexploredOperators: pools.composite.stats.unexploredOperators
    }
  };
}

function currentCandidate(input, registry) {
  const topology = input.selectedTopology || input.currentTopology || 'single_agent';
  const variant = input.selectedVariant || input.currentVariant || null;
  const source = input.currentRecipe || topologyExpression(topology, variant);
  const expression = parseExpression(cloneExpression(source));
  setExpressionIds(expression, 'no-change', 'root');
  const result = validateTypedExpression({ expression, input, registry });
  return {
    candidateId: 'no-change', kind: 'NO_CHANGE', topology, variant,
    maturity: { topology: 'current', variant: variant ? 'current' : null },
    requiredCapabilities: [], missingCapabilities: [], expression,
    validation: result, rationale: 'Preserve la recette morphologique actuellement sélectionnée.'
  };
}

function topologyContracts(registry) {
  return Object.fromEntries(registry.list().map((id) => [id, registry.get(id)]));
}

function normalizeCapabilities(capabilities) {
  if (!Array.isArray(capabilities)) return null;
  return new Set(capabilities.map((value) => String(value).toUpperCase()));
}

function buildCandidatePools(context) {
  const { input, registry, topologyIds, capabilitySet, contracts } = context;
  const topology = [];
  const variant = [];
  const components = [];
  const vetoed = [];
  for (const topologyId of topologyIds) {
    const contract = registry.get(topologyId);
    const entries = registry.variants.listEntries(topologyId).slice().sort(compareVariants);
    const defaultVariant = entries.find((entry) => entry.variantId === 'default');
    addSingleTopology({ topology, components, vetoed, topologyId, contract, variantEntry: defaultVariant, input, registry, contracts, capabilitySet });
    for (const entry of entries) {
      if (entry.variantId === 'default') continue;
      addVariantCandidate({ variant, components, vetoed, topologyId, contract, entry, input, registry, contracts, capabilitySet });
    }
  }
  const composite = buildCompositeCandidates({ components, input, registry, contracts, capabilitySet,
    ceiling: normalizeCeiling(input.compositePairCeiling),
    helpers: { candidateCapabilities, validateTypedExpression, buildExpression } });
  return { topology, variant, composite, vetoed };
}

function compareVariants(left, right) {
  return maturityRank(left.maturity) - maturityRank(right.maturity)
    || left.variantId.localeCompare(right.variantId);
}

function maturityRank(maturity) {
  return MATURITY_ORDER[maturity] ?? 9;
}

function isSupportedMaturity(maturity) {
  return knownMaturity(maturity);
}

function addSingleTopology(ctx) {
  const { topology, components, vetoed, topologyId, contract, variantEntry, input, registry, contracts, capabilitySet } = ctx;
  if (!variantEntry) return;
  const capabilityDecision = candidateCapabilities(contract, variantEntry, capabilitySet);
  if (!capabilityDecision.allowed) return addVetoedCandidate({ vetoed, kind: 'TOPOLOGY', topologyId, contract, entry: variantEntry, capabilityDecision, input, registry, contracts });
  const expression = buildExpression(topologyExpression(topologyId, null), `topology:${topologyId}`);
  const validation = validateTypedExpression({ expression, input, registry, contracts });
  const candidate = createCandidate({ kind: 'TOPOLOGY', topologyId, variantEntry, contract, expression, validation });
  if (!validation.valid || !isSupportedMaturity(variantEntry.maturity)) {
    return vetoed.push({ ...candidate, admissibility: 'rejected', executionEligible: false,
      admissibilityReason: !validation.valid ? validation.errors.join('; ') : `Maturité inconnue : ${variantEntry.maturity}.` });
  }
  topology.push(candidate);
  components.push(componentFor(topologyId, variantEntry, contract));
}

function addVariantCandidate(ctx) {
  const { variant, components, vetoed, topologyId, contract, entry, input, registry, contracts, capabilitySet } = ctx;
  const capabilityDecision = candidateCapabilities(contract, entry, capabilitySet);
  if (!capabilityDecision.allowed) return addVetoedCandidate({ vetoed, kind: 'VARIANT', topologyId, contract, entry, capabilityDecision, input, registry, contracts });
  const expression = buildExpression(topologyExpression(topologyId, entry.variantId), `variant:${topologyId}:${entry.variantId}`);
  const validation = validateTypedExpression({ expression, input, registry, contracts });
  const candidate = createCandidate({ kind: 'VARIANT', topologyId, variantEntry: entry, contract, expression, validation });
  if (!validation.valid || !isSupportedMaturity(entry.maturity)) {
    return vetoed.push({ ...candidate, admissibility: 'rejected', executionEligible: false,
      admissibilityReason: !validation.valid ? validation.errors.join('; ') : `Maturité inconnue : ${entry.maturity}.` });
  }
  variant.push(candidate);
  components.push(componentFor(topologyId, entry, contract));
}

function candidateCapabilities(contract, variant, capabilitySet) {
  const requiredCapabilities = [...new Set([
    ...(contract.requiredCapabilities || []), ...(variant.requiredCapabilities || [])
  ])].sort();
  const missingCapabilities = capabilitySet
    ? requiredCapabilities.filter((item) => !capabilitySet.has(item.toUpperCase())) : [];
  return { requiredCapabilities, missingCapabilities, allowed: missingCapabilities.length === 0 };
}

function createCandidate(input) {
  const caps = candidateCapabilities(input.contract, input.variantEntry, null);
  return {
    candidateId: `${input.kind.toLowerCase()}:${input.topologyId}:${input.variantEntry.variantId}`,
    kind: input.kind,
    topology: input.topologyId,
    variant: input.kind === 'VARIANT' ? input.variantEntry.variantId : null,
    maturity: { topology: 'registered', variant: input.variantEntry.maturity },
    admissibility: proposalEligible(input.variantEntry.maturity)
      ? 'execution_eligible' : 'exploratory_only',
    executionEligible: proposalEligible(input.variantEntry.maturity),
    requiredCapabilities: caps.requiredCapabilities, missingCapabilities: [],
    expression: input.expression, validation: input.validation,
    rationale: input.kind === 'VARIANT'
      ? `Variante ${input.variantEntry.variantId} du registre canonique ${input.topologyId}.`
      : `Topologie ${input.topologyId} du registre canonique.`
  };
}

function addVetoedCandidate(ctx) {
  const { vetoed, kind, topologyId, contract, entry, capabilityDecision, input, registry, contracts } = ctx;
  const expression = buildExpression(topologyExpression(topologyId, kind === 'VARIANT' ? entry.variantId : null), `vetoed:${kind}:${topologyId}:${entry.variantId}`);
  const validation = validateTypedExpression({ expression, input, registry, contracts });
  if (!validation.valid) {
    vetoed.push({ ...createCandidate({ kind, topologyId, variantEntry: entry, contract, expression, validation }),
      admissibility: 'rejected', executionEligible: false,
      admissibilityReason: [...capabilityDecision.missingCapabilities.map((item) => `capacité absente : ${item}`), ...validation.errors].join('; '),
      missingCapabilities: capabilityDecision.missingCapabilities });
    return;
  }
  vetoed.push({
    ...createCandidate({ kind, topologyId, variantEntry: entry, contract, expression, validation }),
    admissibility: 'rejected', executionEligible: false,
    admissibilityReason: `Capacités requises absentes : ${capabilityDecision.missingCapabilities.join(', ')}.`,
    missingCapabilities: capabilityDecision.missingCapabilities
  });
}

function componentFor(topologyId, variant, contract) {
  return { topologyId, variant, contract };
}

function normalizeCeiling(value) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return MAX_COMPOSITE_PAIRS;
}

function buildExpression(expression, identity) {
  const parsed = parseExpression(expression);
  setExpressionIds(parsed, identity, 'root');
  return parsed;
}

function setExpressionIds(expression, identity, path) {
  expression.expressionId = `${identity}:${path}`;
  const children = expressionChildren(expression);
  children.forEach((child, index) => setExpressionIds(child, identity, `${path}.${index}`));
}

function expressionChildren(expression) {
  if (expression.kind === 'NEST') return [expression.host, expression.inner];
  if (expression.kind === 'GATE') return [expression.condition, expression.thenBranch, expression.elseBranch];
  if (expression.kind === 'WRAP') return [expression.inner];
  if (expression.kind === 'BRIDGE') return [expression.source, expression.target];
  if (expression.kind === 'FEDERATE') return expression.members;
  return Array.isArray(expression.children) ? expression.children : [];
}

function validateTypedExpression(ctx) {
  const { expression, input, registry, contracts = topologyContracts(registry) } = ctx;
  try {
    const parsed = parseExpression(expression);
    const graph = compileExpression(parsed, {
      mission: input.mission || null,
      missionId: input.missionId || 'adaptive-topology-candidates',
      globalBudget: input.budget || {}
    });
    const checked = checkMorphologyTypes(graph, contracts);
    return { valid: checked.valid, errors: checked.errors, graphId: graph.graphId };
  } catch (error) {
    return { valid: false, errors: [error.message], graphId: null };
  }
}

module.exports = { MAX_COMPOSITE_PAIRS, generateAdaptiveTopologyCandidates };
