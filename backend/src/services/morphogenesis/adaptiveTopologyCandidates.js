'use strict';

const { createTopologyRegistry } = require('./registry/topologyRegistry');
const { topologyExpression, nestExpression, cloneExpression } = require('./expression/morphologyExpression');
const { parseExpression } = require('./expression/morphologyExpressionParser');
const { compileExpression } = require('./graph/morphologyCompiler');
const { checkMorphologyTypes } = require('./typing/morphologyTypeChecker');
const { registry: defaultAdapterRegistry } = require('./adapters/topologyAdapterService');

const DEFAULT_CEILING = 10;
const HARD_CEILING = 32;
const MAX_COMPOSITE_PAIRS = 128;
const MAX_VETOED_CANDIDATES = 4;
const MATURITY_ORDER = Object.freeze({ implemented: 0, stable: 1, partial: 2, experimental: 3 });

function generateAdaptiveTopologyCandidates(input = {}) {
  const registry = input.registry || createTopologyRegistry();
  const limit = candidateLimit(input.maxCandidates);
  const current = currentCandidate(input, registry);
  const contracts = topologyContracts(registry);
  const capabilitySet = normalizeCapabilities(input.availableTopologyCapabilities);
  const topologyIds = registry.list().slice().sort();
  const pools = buildCandidatePools({ input, registry, topologyIds, contracts, capabilitySet, candidateCap: limit });
  const available = pools.topology.length + pools.variant.length + pools.composite.candidates.length + pools.vetoed.length;
  const vetoSlots = Math.min(pools.vetoed.length, MAX_VETOED_CANDIDATES, limit - 1);
  const candidatePools = { ...pools, composite: pools.composite.candidates };
  const alternatives = takeBalanced(candidatePools, limit - 1 - vetoSlots);
  const candidates = [current, ...alternatives, ...pools.vetoed.slice(0, limit - 1 - alternatives.length)];
  return {
    candidates,
    stats: {
      candidateCount: candidates.length,
      candidateCeiling: limit,
      candidatePoolTruncated: available > candidates.length - 1,
      compositeCandidateCount: pools.composite.candidates.length,
      compositeCandidatePoolTruncated: pools.composite.candidatePoolTruncated,
      vetoedCandidateCount: candidates.filter((candidate) => candidate.admissibility === 'rejected').length,
      vetoedCandidateCeiling: vetoLimit(limit),
      vetoedCandidatePoolTruncated: pools.vetoedPoolTruncated,
      compositePairsExamined: pools.composite.stats.examined,
      compositePairCeiling: pools.composite.stats.ceiling,
      compositePairsPotential: pools.composite.stats.potential,
      compositePairsTruncated: pools.composite.stats.truncated
    }
  };
}

function candidateLimit(value) {
  if (value === undefined) return DEFAULT_CEILING;
  if (!Number.isInteger(value) || value < 1) throw new Error('maxCandidates must be a positive integer');
  return Math.min(value, HARD_CEILING);
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
  const { input, registry, topologyIds, capabilitySet, contracts, candidateCap } = context;
  const topology = [];
  const variant = [];
  const components = [];
  const vetoed = [];
  const vetoState = { truncated: false };
  for (const topologyId of topologyIds) {
    const contract = registry.get(topologyId);
    const entries = registry.variants.listEntries(topologyId).slice().sort(compareVariants);
    const defaultVariant = entries.find((entry) => entry.variantId === 'default');
    addSingleTopology({ topology, components, vetoed, vetoState, topologyId, contract, variantEntry: defaultVariant, input, registry, contracts, capabilitySet, candidateCap });
    for (const entry of entries) {
      if (entry.variantId === 'default' || !isSupportedMaturity(entry.maturity)) continue;
      addVariantCandidate({ variant, components, vetoed, vetoState, topologyId, contract, entry, input, registry, contracts, capabilitySet, candidateCap });
    }
  }
  const composite = buildCompositeCandidates({ components, input, registry, contracts, capabilitySet, candidateCap });
  return { topology, variant, composite, vetoed, vetoedPoolTruncated: vetoState.truncated };
}

function compareVariants(left, right) {
  return maturityRank(left.maturity) - maturityRank(right.maturity)
    || left.variantId.localeCompare(right.variantId);
}

function maturityRank(maturity) {
  return MATURITY_ORDER[maturity] ?? 9;
}

function isSupportedMaturity(maturity) {
  return Object.prototype.hasOwnProperty.call(MATURITY_ORDER, maturity);
}

function addSingleTopology(ctx) {
  const { topology, components, vetoed, vetoState, topologyId, contract, variantEntry, input, registry, contracts, capabilitySet, candidateCap } = ctx;
  if (!variantEntry) return;
  const capabilityDecision = candidateCapabilities(contract, variantEntry, capabilitySet);
  if (!capabilityDecision.allowed) return addVetoedCandidate({ vetoed, vetoState, kind: 'TOPOLOGY', topologyId, contract, entry: variantEntry, capabilityDecision, input, registry, contracts, candidateCap });
  if (topology.length >= candidateCap) return;
  const expression = buildExpression(topologyExpression(topologyId, null), `topology:${topologyId}`);
  const validation = validateTypedExpression({ expression, input, registry, contracts });
  if (!validation.valid) return;
  topology.push(createCandidate({ kind: 'TOPOLOGY', topologyId, variantEntry, contract, expression, validation }));
  components.push(componentFor(topologyId, variantEntry, contract));
}

function addVariantCandidate(ctx) {
  const { variant, components, vetoed, vetoState, topologyId, contract, entry, input, registry, contracts, capabilitySet, candidateCap } = ctx;
  if (!isSupportedMaturity(entry.maturity)) return;
  const capabilityDecision = candidateCapabilities(contract, entry, capabilitySet);
  if (!capabilityDecision.allowed) return addVetoedCandidate({ vetoed, vetoState, kind: 'VARIANT', topologyId, contract, entry, capabilityDecision, input, registry, contracts, candidateCap });
  if (variant.length >= candidateCap) return;
  const expression = buildExpression(topologyExpression(topologyId, entry.variantId), `variant:${topologyId}:${entry.variantId}`);
  const validation = validateTypedExpression({ expression, input, registry, contracts });
  if (!validation.valid) return;
  variant.push(createCandidate({ kind: 'VARIANT', topologyId, variantEntry: entry, contract, expression, validation }));
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
    requiredCapabilities: caps.requiredCapabilities, missingCapabilities: [],
    expression: input.expression, validation: input.validation,
    rationale: input.kind === 'VARIANT'
      ? `Variante ${input.variantEntry.variantId} du registre canonique ${input.topologyId}.`
      : `Topologie ${input.topologyId} du registre canonique.`
  };
}

function addVetoedCandidate(ctx) {
  const { vetoed, vetoState, kind, topologyId, contract, entry, capabilityDecision, input, registry, contracts, candidateCap } = ctx;
  if (vetoed.length >= vetoLimit(candidateCap)) {
    vetoState.truncated = true;
    return;
  }
  const expression = buildExpression(topologyExpression(topologyId, kind === 'VARIANT' ? entry.variantId : null), `vetoed:${kind}:${topologyId}:${entry.variantId}`);
  const validation = validateTypedExpression({ expression, input, registry, contracts });
  if (!validation.valid) return;
  vetoed.push({
    ...createCandidate({ kind, topologyId, variantEntry: entry, contract, expression, validation }),
    admissibility: 'rejected', executionEligible: false,
    admissibilityReason: `Capacités requises absentes : ${capabilityDecision.missingCapabilities.join(', ')}.`,
    missingCapabilities: capabilityDecision.missingCapabilities
  });
}

function vetoLimit(candidateCap) {
  return Math.min(MAX_VETOED_CANDIDATES, Math.max(0, candidateCap - 1));
}

function componentFor(topologyId, variant, contract) {
  return { topologyId, variant, contract };
}

function buildCompositeCandidates(ctx) {
  const { components, input, registry, contracts, capabilitySet, candidateCap } = ctx;
  const output = [];
  const potential = countPotentialPairs(components);
  let examined = 0;
  for (const host of components) {
    if (examined >= MAX_COMPOSITE_PAIRS || output.length >= candidateCap) break;
    for (const inner of components) {
      if (examined >= MAX_COMPOSITE_PAIRS || output.length >= candidateCap) break;
      examined += 1;
      if (host.topologyId === inner.topologyId) continue;
      const candidate = nestedCandidate({ ...ctx, host, inner });
      if (candidate) output.push(candidate);
    }
  }
  return {
    candidates: output.sort((left, right) => left.candidateId.localeCompare(right.candidateId)),
    candidatePoolTruncated: output.length >= candidateCap && potential > examined,
    stats: { examined, ceiling: MAX_COMPOSITE_PAIRS, potential, truncated: potential > examined }
  };
}

function nestedCandidate(ctx) {
  const { host, inner, input, registry, contracts, capabilitySet } = ctx;
  const caps = candidateCapabilities(host.contract, host.variant, capabilitySet);
  const innerCaps = candidateCapabilities(inner.contract, inner.variant, capabilitySet);
  if (!caps.allowed || !innerCaps.allowed) return null;
  const expression = buildExpression(nestExpression(
    topologyExpression(host.topologyId, host.variant.variantId),
    topologyExpression(inner.topologyId, inner.variant.variantId)
  ), `nested:${host.topologyId}:${host.variant.variantId}:${inner.topologyId}:${inner.variant.variantId}`);
  const validation = validateTypedExpression({ expression, input, registry, contracts });
  if (!validation.valid) return null;
  return nestedCandidateRecord({ host, inner, caps, innerCaps, expression, validation, input, registry });
}

function nestedCandidateRecord(ctx) {
  const { host, inner, caps, innerCaps, expression, validation, input, registry } = ctx;
  const relation = registry.relations.get(host.topologyId, inner.topologyId, input.relationContext || {});
  const eligibility = compositionEligibility({ relation, host: host.topologyId, inner: inner.topologyId,
    adapterRegistry: input.adapterRegistry || defaultAdapterRegistry });
  return {
    candidateId: `nested:${host.topologyId}:${host.variant.variantId}:${inner.topologyId}:${inner.variant.variantId}`,
    kind: 'NESTED', topology: host.topologyId, variant: host.variant.variantId,
    members: [{ topology: host.topologyId, variant: host.variant.variantId }, { topology: inner.topologyId, variant: inner.variant.variantId }],
    maturity: { topology: 'registered', variant: host.variant.maturity },
    relation, admissibility: eligibility.admissibility, admissibilityReason: eligibility.reason,
    executionEligible: eligibility.executionEligible,
    requiredCapabilities: [...new Set([...caps.requiredCapabilities, ...innerCaps.requiredCapabilities])].sort(),
    missingCapabilities: [], expression, validation,
    rationale: `Composition NEST typée : ${host.topologyId}/${host.variant.variantId} contient ${inner.topologyId}/${inner.variant.variantId}.`
  };
}

function countPotentialPairs(components) {
  return components.length * components.length;
}

function compositionEligibility(ctx) {
  const { relation, host, inner, adapterRegistry } = ctx;
  if (relation.relation === 'FORBIDDEN') return { admissibility: 'rejected', executionEligible: false, reason: 'La relation des topologies interdit cette composition.' };
  if (relation.evidenceStatus !== 'verified') return { admissibility: 'exploratory_only', executionEligible: false, reason: 'La relation des topologies ne possède pas de preuve vérifiée.' };
  if (relation.adapterRequired && !hasVerifiedAdapter(adapterRegistry, inner, host)) {
    return { admissibility: 'exploratory_only', executionEligible: false, reason: 'Un adaptateur vérifié de la topologie interne vers son hôte est requis.' };
  }
  if (relation.relation === 'SYNERGISTIC') return { admissibility: 'execution_eligible', executionEligible: true, reason: 'La relation synergique est vérifiée.' };
  if (relation.relation !== 'COMPATIBLE_WITH_ADAPTER') return { admissibility: 'exploratory_only', executionEligible: false, reason: 'La relation ne déclare pas une compatibilité vérifiée pour NEST.' };
  if (!relation.adapterRequired) return { admissibility: 'execution_eligible', executionEligible: true, reason: 'La relation compatible est vérifiée et ne requiert pas d’adaptateur.' };
  return { admissibility: 'execution_eligible', executionEligible: true, reason: 'La relation et l’adaptateur interne vers hôte sont vérifiés.' };
}

function hasVerifiedAdapter(adapterRegistry, inner, host) {
  if (!adapterRegistry || typeof adapterRegistry.get !== 'function') return false;
  const adapter = adapterRegistry.get(inner, host);
  return Boolean(adapter && adapter.evidenceStatus === 'verified');
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

function takeBalanced(pools, slots) {
  const categories = ['topology', 'composite', 'variant'];
  const selected = [];
  while (selected.length < slots) {
    let added = false;
    for (const category of categories) {
      const candidate = pools[category].shift();
      if (candidate) {
        selected.push(candidate);
        added = true;
        if (selected.length >= slots) break;
      }
    }
    if (!added) break;
  }
  return selected;
}

module.exports = { DEFAULT_CEILING, HARD_CEILING, MAX_COMPOSITE_PAIRS, MAX_VETOED_CANDIDATES, generateAdaptiveTopologyCandidates };
