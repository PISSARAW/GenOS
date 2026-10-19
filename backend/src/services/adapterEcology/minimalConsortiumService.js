'use strict';

const manifests = require('./adapterManifest');
const { rankCandidates } = require('../holobionte/selection/partnerChoiceService');
const { selectMinimumMorphology, MORPHOLOGY_LEVELS } = require('../morphogenesis/synthesis/minimalMorphologyPolicy');

const MAX_CANDIDATES = 16;

function selectionError(message, code = 'ADAPTER_CONSORTIUM_INVALID') {
  throw Object.assign(new Error(message), { code });
}

function uniqueText(value, field) {
  if (!Array.isArray(value)) selectionError(`${field} must be an array.`);
  const items = [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
  if (!items.length) selectionError(`${field} must not be empty.`);
  return items;
}

function finiteLimit(value, fallback) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) selectionError('Consortium limits must be finite and non-negative.');
  return number;
}

function normalizeDemand(input = {}) {
  const requiredCapabilities = uniqueText(input.requiredCapabilities, 'requiredCapabilities');
  const now = Date.parse(input.now || new Date().toISOString());
  if (!Number.isFinite(now)) selectionError('now must be an ISO date.');
  return {
    requiredCapabilities,
    allowedDataScopes: new Set(uniqueText(input.allowedDataScopes, 'allowedDataScopes')),
    allowedToolLeases: new Set(uniqueText(input.allowedToolLeases, 'allowedToolLeases')),
    maxCostUsd: finiteLimit(input.maxCostUsd, Number.MAX_SAFE_INTEGER),
    maxLatencyMs: finiteLimit(input.maxLatencyMs, Number.MAX_SAFE_INTEGER),
    maxHealthAgeMs: finiteLimit(input.maxHealthAgeMs, 300000), now,
    riskTolerance: input.riskTolerance || 'MEDIUM',
    maxDependencyPerSymbiont: finiteLimit(input.maxDependencyPerSymbiont, 0.6),
    constitution: input.constitution || null
  };
}

function admissibility(manifest, demand) {
  const reasons = [];
  if (manifest.health.status !== 'HEALTHY') reasons.push(`HEALTH_${manifest.health.status}`);
  if (demand.now - Date.parse(manifest.health.checkedAt) > demand.maxHealthAgeMs) reasons.push('HEALTH_STALE');
  if (manifest.dataScopes.some((scope) => !demand.allowedDataScopes.has(scope))) reasons.push('DATA_SCOPE_DENIED');
  if (manifest.toolLeases.some((lease) => !demand.allowedToolLeases.has(lease))) reasons.push('TOOL_LEASE_DENIED');
  return reasons;
}

function holobiontCandidate(manifest, demand) {
  const denominator = demand.maxCostUsd > 0 && Number.isFinite(demand.maxCostUsd) ? demand.maxCostUsd : 1;
  return {
    id: manifest.adapterId, capabilities: manifest.capabilities,
    reliability: manifest.health.reliability, evidenceQuality: manifest.fitness.evidenceQuality,
    historicalCompatibility: manifest.fitness.historicalCompatibility,
    replaceability: manifest.fitness.replaceability,
    cost: Math.min(1, manifest.economics.costUsd / denominator),
    risk: manifest.fitness.risk, dependencyRisk: manifest.fitness.dependencyRisk
  };
}

function qualify(values, demand) {
  if (!Array.isArray(values) || !values.length || values.length > MAX_CANDIDATES) {
    selectionError(`Between 1 and ${MAX_CANDIDATES} adapter manifests are required.`);
  }
  const normalized = values.map(manifests.normalizeManifest);
  const ranked = rankCandidates({
    constitution: { riskTolerance: demand.riskTolerance,
      maxDependencyPerSymbiont: demand.maxDependencyPerSymbiont },
    gap: { requiredCapabilities: demand.requiredCapabilities },
    candidates: normalized.map((item) => holobiontCandidate(item, demand))
  });
  const rankById = new Map(ranked.map((item) => [item.symbiontId, item]));
  return normalized.map((manifest) => {
    const rank = rankById.get(manifest.adapterId);
    const reasons = [...admissibility(manifest, demand), ...(rank.eligible ? [] : rank.reasons)];
    return { manifest, rank, eligible: reasons.length === 0, reasons };
  });
}

function metrics(entries) {
  return {
    adapterCount: entries.length,
    costUsd: Number(entries.reduce((sum, item) => sum + item.manifest.economics.costUsd, 0).toFixed(6)),
    latencyMs: entries.reduce((sum, item) => sum + item.manifest.economics.latencyMs, 0),
    fitness: Number(entries.reduce((sum, item) => sum + item.rank.score, 0).toFixed(4))
  };
}

function covers(entries, demand) {
  const provided = new Set(entries.flatMap((item) => item.manifest.capabilities));
  const totals = metrics(entries);
  return demand.requiredCapabilities.every((capability) => provided.has(capability))
    && totals.costUsd <= demand.maxCostUsd && totals.latencyMs <= demand.maxLatencyMs;
}

function compare(left, right) {
  return left.metrics.adapterCount - right.metrics.adapterCount
    || left.metrics.costUsd - right.metrics.costUsd
    || left.metrics.latencyMs - right.metrics.latencyMs
    || right.metrics.fitness - left.metrics.fitness
    || left.ids.join('|').localeCompare(right.ids.join('|'));
}

function enumerate(entries, demand) {
  const viable = entries.filter((item) => item.eligible);
  const candidates = [];
  for (let mask = 1; mask < 2 ** viable.length; mask += 1) {
    const subset = viable.filter((_, index) => mask & (2 ** index));
    if (!covers(subset, demand)) continue;
    const ids = subset.map((item) => item.manifest.adapterId).sort();
    candidates.push({ entries: subset, ids, metrics: metrics(subset) });
  }
  return candidates.sort(compare);
}

function morphologyCandidates(choice, demand) {
  const unavailable = MORPHOLOGY_LEVELS.filter((level) => level !== 'direct_worker' && level !== 'ecology')
    .map((level) => ({ id: `${level}:not-sufficient`, level, available: false,
      capabilities: [], reason: 'declared adapter demand requires a qualified provider' }));
  const direct = choice.entries.length === 1 ? [{ id: choice.ids[0], level: 'direct_worker',
    available: true, capabilities: choice.entries[0].manifest.capabilities }] : [{
    id: 'direct_worker:not-sufficient', level: 'direct_worker', available: false,
    capabilities: [], reason: 'no single qualified adapter covers the demand'
  }];
  const ecology = { id: `consortium:${choice.ids.join('+')}`, level: 'ecology', available: true,
    capabilities: demand.requiredCapabilities };
  return [...unavailable, ...direct, ecology];
}

function garageRequest(entry, demand) {
  return {
    adapterId: entry.manifest.adapterId, role: 'adapter_symbiont',
    prompt: `Reserve qualified adapter ${entry.manifest.adapterId}@${entry.manifest.version}`,
    requiredCapabilities: entry.manifest.capabilities.filter((item) => demand.requiredCapabilities.includes(item)),
    providerReference: entry.manifest.reference, estimatedCost: entry.manifest.economics.costUsd,
    toolLeases: entry.manifest.toolLeases, attestationRefs: entry.manifest.attestationRefs
  };
}

function selectConsortium(values, input = {}) {
  const demand = normalizeDemand(input);
  const qualified = qualify(values, demand);
  const choices = enumerate(qualified, demand);
  if (!choices.length) return { status: 'no_admissible_consortium', selected: null,
    rejections: qualified.filter((item) => !item.eligible).map((item) => ({ adapterId: item.manifest.adapterId, reasons: item.reasons })) };
  const choice = choices[0];
  const selectedManifests = choice.entries.map((item) => item.manifest);
  return {
    status: 'minimum_sufficient_consortium', adapterIds: choice.ids, metrics: choice.metrics,
    manifests: selectedManifests,
    capabilityNodes: selectedManifests.map(manifests.toCapabilityNode),
    symbiosisContracts: demand.constitution
      ? selectedManifests.map((item) => manifests.toSymbiosisContract(item, demand.constitution)) : [],
    garageRequests: choice.entries.map((item) => garageRequest(item, demand)),
    morphologyDecision: selectMinimumMorphology(morphologyCandidates(choice, demand), {
      requiredCapabilities: demand.requiredCapabilities
    }),
    selectionProof: { evaluatedSubsets: choices.length, candidateBound: MAX_CANDIDATES,
      rejectedAdapters: qualified.filter((item) => !item.eligible).map((item) => item.manifest.adapterId) }
  };
}

module.exports = { MAX_CANDIDATES, selectConsortium };
