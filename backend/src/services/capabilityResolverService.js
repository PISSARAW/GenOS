'use strict';

/**
 * @file capabilityResolverService.js
 * @description Dynamically selects the best capabilities for a mission context
 * using multi-factor utility scoring over the Capability Graph.
 */

const { CAPABILITY_GRAPH, getAllConcepts } = require('./capabilityGraphService');
const { derivePolicyLease, restrictProvidedLease } = require('./toolLeasePolicy');
const { findMostPromising } = require('./affordanceMemoryService');
const { calculateMembranePotential } = require('./biomimeticToolGatingService');
const { contractFor } = require('./topologyCapabilityService');

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function normalizeText(value) {
  return String(value || '').toLowerCase().trim();
}

function selectFields(concept) {
  return {
    token_cost: concept.token_cost || 0,
    latency: concept.latency || 0,
    risk: concept.risk || 0,
    reversibility: concept.reversibility,
    uncertainty_reduction: concept.uncertainty_reduction || 0,
    information_gain: concept.information_gain || 'medium',
    cost: concept.cost || 0,
    category: concept.category,
    tools: concept.tools || [],
    capabilities: concept.capabilities || [],
    maturity: concept.maturity,
  };
}

function infoGainValue(value) {
  if (typeof value === 'number') return clamp01(value);
  const map = { high: 0.8, medium: 0.5, low: 0.2 };
  return map[normalizeText(value)] ?? 0.5;
}

function riskFromReversibility(value) {
  const map = { high: 0.2, medium: 0.5, low: 0.9 };
  return map[normalizeText(value)] ?? 0.5;
}

// ---------------------------------------------------------------------------
// Context extraction
// ---------------------------------------------------------------------------

function extractKeywords(text) {
  const words = normalizeText(text).split(/[^\w]+/).filter((w) => w.length > 2);
  return new Set(words);
}

function buildContextProfile(ctx) {
  const prompt = normalizeText(ctx.prompt || ctx.goal || ctx.current_state || '');
  const keywords = extractKeywords(prompt);
  const membrane = calculateMembranePotential(prompt);
  const topology = contractFor({ mode: ctx.mode, organization: ctx.topology });
  const budget = ctx.budget || {};
  const role = normalizeText(ctx.role || 'worker');
  const domain = normalizeText(ctx.domain || '');
  return { prompt, keywords, membrane, topology, budget, role, domain };
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

function buildHaystack(concept) {
  return [
    concept.id || '',
    ...(concept.aliases || []),
    ...(concept.tools || []),
    ...(concept.capabilities || []),
    ...(concept.primitives || []),
    ...(concept.strategies || []),
  ]
    .join(' ')
    .toLowerCase();
}

function keywordMatchesHaystack(keywords, haystack) {
  for (const kw of keywords) {
    if (kw.length > 3 && haystack.includes(kw)) return true;
  }
  return false;
}

function topologyMatchesConcept(topology, concept) {
  if (!topology || !topology.required || !topology.required.length) return false;
  return topology.required.some((c) => (concept.capabilities || []).includes(c));
}

function isConceptRelevant(concept, profile) {
  const haystack = buildHaystack(concept);
  if (keywordMatchesHaystack(profile.keywords, haystack)) return true;
  return topologyMatchesConcept(profile.topology, concept);
}

function filterRelevantConcepts(profile) {
  const all = Object.values(getAllConcepts());
  if (!profile.keywords.size && !profile.topology.required.length) {
    return all.filter((c) => c.maturity === 'ready');
  }
  return all.filter((c) => c.maturity === 'ready' && isConceptRelevant(c, profile));
}

// ---------------------------------------------------------------------------
// Utility scoring
// ---------------------------------------------------------------------------

function scoreProgress(concept, profile) {
  if (!profile.topology || !profile.topology.required) return 0;
  if (concept.capabilities.some((c) => profile.topology.required.includes(c))) {
    return 0.9;
  }
  return 0.1;
}

function scoreEvidenceGain(concept) {
  const evidence = concept.expected_evidence || [];
  if (!evidence.length) return 0.1;
  return clamp01(evidence.length * 0.2);
}

function scoreReuse(concept, affordanceReuse) {
  const key = concept.tools[0] || concept.id;
  const reuse = affordanceReuse[key];
  if (reuse && reuse.use_count > 0) {
    return clamp01(reuse.success_count / reuse.use_count);
  }
  if (concept.learning_statistics && concept.learning_statistics.success > 0) {
    return clamp01(concept.learning_statistics.success / 10);
  }
  return 0.3;
}

function scoreContextCost(concept, profile) {
  const cost = concept.cost || selectFields(concept).cost;
  const tokenBudget = profile.budget.tokens || 10000;
  const tokenRatio = Math.min(1, (concept.token_cost || 0) / Math.max(1, tokenBudget));
  return clamp01(cost / 5) * 0.5 + tokenRatio * 0.5;
}

function scoreIrreversibility(concept) {
  return riskFromReversibility(concept.reversibility);
}

function computeUtility(concept, profile, affordanceReuse) {
  const s = selectFields(concept);
  const expected_progress = scoreProgress(concept, profile);
  const expected_information_gain = infoGainValue(s.information_gain);
  const evidence_gain = scoreEvidenceGain(concept);
  const uncertainty_reduction = clamp01(s.uncertainty_reduction);
  const reuse_of_previous_success = scoreReuse(concept, affordanceReuse);

  const token_cost = clamp01(s.token_cost / 500);
  const latency = clamp01(s.latency / 5);
  const execution_risk = clamp01(s.risk / 5);
  const irreversibility = scoreIrreversibility(concept);
  const context_cost = scoreContextCost(concept, profile);

  const benefit =
    expected_progress * 1.0 +
    expected_information_gain * 0.9 +
    evidence_gain * 0.7 +
    uncertainty_reduction * 0.8 +
    reuse_of_previous_success * 0.6;

  const penalty =
    token_cost * 0.8 +
    latency * 0.5 +
    execution_risk * 0.9 +
    irreversibility * 0.7 +
    context_cost * 0.6;

  const raw = benefit - penalty;
  return clamp01((raw + 4) / 8);
}

// ---------------------------------------------------------------------------
// Authority boundaries
// ---------------------------------------------------------------------------

function getAuthorizedTools(profile) {
  const lease = derivePolicyLease({
    executionMode: profile.role === 'orchestrator' ? 'orchestrator' : 'worker',
    role: profile.role,
    capabilities: profile.topology.required || [],
    plan: { capabilityContract: { required: profile.topology.required || [] } },
  });
  return new Set(lease);
}

function applyAuthorityBoundary(scored, authorizedTools) {
  return scored.map((entry) => {
    const concept = entry.concept;
    const tools = concept.tools || [];
    const allowed = tools.every((t) => authorizedTools.has(t));
    return {
      ...entry,
      authorized: allowed,
      suppressed_reason: allowed ? null : 'authority_boundary',
    };
  });
}

// ---------------------------------------------------------------------------
// Justification builder
// ---------------------------------------------------------------------------

function buildJustification(entry) {
  const c = entry.concept;
  const parts = [];
  if (entry.utility > 0.7) parts.push('High expected utility for mission');
  else if (entry.utility > 0.4) parts.push('Moderate utility for mission');
  else parts.push('Low utility — consider fallback');

  if (c.uncertainty_reduction > 0.7) parts.push('strong uncertainty reduction');
  if (infoGainValue(c.information_gain) > 0.6) parts.push('high information gain');
  if (c.risk <= 1) parts.push('low execution risk');
  if (c.reversibility === 'high') parts.push('fully reversible');
  if (!entry.authorized) parts.push('NOT authorized for current role');

  return parts.join('; ') + '.';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function resolveCapabilities(ctx) {
  if (!ctx || typeof ctx !== 'object') {
    return { ranked: [], manifest: null, profile: null };
  }

  const profile = buildContextProfile(ctx);
  const candidates = filterRelevantConcepts(profile);
  const affordances = findMostPromising(0.3) || [];
  const affordanceReuse = {};
  for (const aff of affordances) {
    affordanceReuse[aff.capability] = aff;
  }

  const authorizedTools = getAuthorizedTools(profile);

  const scored = candidates.map((concept) => {
    const utility = computeUtility(concept, profile, affordanceReuse);
    return {
      concept,
      utility: Number(utility.toFixed(3)),
      category: concept.category,
      id: concept.id,
      tools: concept.tools || [],
      capabilities: concept.capabilities || [],
    };
  });

  const filtered = applyAuthorityBoundary(scored, authorizedTools);
  filtered.sort((a, b) => b.utility - a.utility);

  const ranked = filtered.map((entry) => ({
    id: entry.id,
    category: entry.category,
    utility: entry.utility,
    tools: entry.tools,
    capabilities: entry.capabilities,
    authorized: entry.authorized,
    suppressed_reason: entry.suppressed_reason,
    justification: buildJustification(entry),
    membrane_potential_mv: profile.membrane.membranePotentialMv,
  }));

  return {
    ranked,
    profile: {
      role: profile.role,
      mode: profile.topology.mode,
      organization: profile.topology.organization,
      required_capabilities: profile.topology.required,
      membrane_potential_mv: profile.membrane.membranePotentialMv,
      budget_tokens: profile.budget.tokens || 0,
    },
    manifest: null,
  };
}

function partitionByAuthority(ranked) {
  const authorized = [];
  const suppressed = [];
  const unavailable = [];
  for (const entry of ranked) {
    if (entry.authorized) authorized.push(entry);
    else if (entry.suppressed_reason === 'authority_boundary') suppressed.push(entry);
    else unavailable.push(entry);
  }
  return { authorized, suppressed, unavailable };
}

function toManifestEntry(entry, tokenBudget) {
  return {
    capability_id: entry.id,
    category: entry.category,
    utility: entry.utility,
    why_selected: entry.justification,
    when_to_use: entry.utility > 0.5 ? 'immediate' : 'deferred',
    preconditions: entry.capabilities.length ? ['topology_match'] : [],
    expected_output: entry.tools.length ? `tools:${entry.tools.join(',')}` : 'information_state_change',
    evidence_required: entry.category === 'strategy' ? ['artifact_hash'] : [],
    budget: { tokens: tokenBudget },
    escalation_path: entry.utility > 0.7 ? 'auto' : 'review',
  };
}

function buildCapabilityManifest(ctx) {
  const { ranked, profile } = resolveCapabilities(ctx);
  if (!profile || !ranked.length) {
    return { owned: [], inherited: [], currently_expressed: [], suppressed: [], unavailable: [], entries: [] };
  }

  const { authorized, suppressed, unavailable } = partitionByAuthority(ranked);
  const expressed = authorized.slice(0, 5);
  const inherited = authorized.slice(5, 10);
  const tokenBudget = ctx.budget && ctx.budget.tokens || 0;

  return {
    owned: expressed.map((e) => e.id),
    inherited: inherited.map((e) => e.id),
    currently_expressed: expressed.map((e) => toManifestEntry(e, tokenBudget)),
    suppressed: suppressed.map((e) => ({ id: e.id, reason: e.suppressed_reason })),
    unavailable: unavailable.map((e) => ({ id: e.id, reason: 'filtered' })),
    role: profile.role,
    mode: profile.mode,
    organization: profile.organization,
    generated_at: new Date().toISOString(),
  };
}

module.exports = {
  resolveCapabilities,
  buildCapabilityManifest,
};
