'use strict';

const { capabilitiesForMode, capabilitiesForOrganization } = require('../topologyCapabilityService');

const { DEFINITIONS } = require('./registry/topologyRegistry');

const TOPOLOGIES = Object.freeze({
  trinity: { independence: 0.95, diversity: 0.7, coordination_overhead: 0.6, communication_overhead: 0.6, latency: 0.4, risk: 0.4, state_preservation: 0.7, token_cost: 0.5, daemon_support: 0.7 },
  a_team: { independence: 0.5, diversity: 0.4, coordination_overhead: 0.5, communication_overhead: 0.5, latency: 0.3, risk: 0.3, state_preservation: 0.7, token_cost: 0.4, daemon_support: 0.5 },
  syncytium: { independence: 0.2, diversity: 0.2, coordination_overhead: 0.2, communication_overhead: 0.9, latency: 0.8, risk: 0.3, state_preservation: 0.95, token_cost: 0.8, daemon_support: 0.8 },
  rhizome: { independence: 0.8, diversity: 0.9, coordination_overhead: 0.3, communication_overhead: 0.4, latency: 0.3, risk: 0.4, state_preservation: 0.5, token_cost: 0.3, daemon_support: 0.6 },
  biome: { independence: 0.4, diversity: 0.7, coordination_overhead: 0.3, communication_overhead: 0.3, latency: 0.2, risk: 0.2, state_preservation: 0.6, token_cost: 0.2, daemon_support: 0.5 },
  biocenose: { independence: 0.6, diversity: 0.8, coordination_overhead: 0.5, communication_overhead: 0.6, latency: 0.4, risk: 0.3, state_preservation: 0.7, token_cost: 0.5, daemon_support: 0.6 },
  holobionte: { independence: 0.3, diversity: 0.4, coordination_overhead: 0.6, communication_overhead: 0.7, latency: 0.6, risk: 0.5, state_preservation: 0.9, token_cost: 0.6, daemon_support: 0.7 },
  metapopulation: { independence: 0.7, diversity: 0.6, coordination_overhead: 0.4, communication_overhead: 0.4, latency: 0.3, risk: 0.3, state_preservation: 0.8, token_cost: 0.4, daemon_support: 0.6 }
});

const ALL_IDS = Object.freeze(Object.keys(DEFINITIONS));

const WEIGHTS = Object.freeze({
  problem_fit: 0.20, capability_fit: 0.15, communication_fit: 0.10, epistemic_independence: 0.10,
  diversity: 0.08, coordination_overhead: -0.08, transition_cost: -0.07, state_preservation_cost: -0.05,
  token_cost: -0.05, latency: -0.04, risk: -0.04, daemon_support: 0.03, relation_fit: 0.03, historical_success: 0.02
});

function get(obj, key, fallback) {
  if (!obj || obj[key] === undefined || obj[key] === null) return fallback;
  return obj[key];
}

function all(conditions) {
  return conditions.every(Boolean);
}

const RULES = Object.freeze([
  { id: 'trinity', test: p => all([(p.hypotheses_count || 0) >= 3, (p.uncertainty || 0) > 0.6]), bonus: 0.3, reason: 'Multiple hypotheses with high uncertainty' },
  { id: 'trinity', test: p => (p.needed_independence || 0) > 0.7, bonus: 0.2, reason: 'High independence needed' },
  { id: 'biocenose', test: p => (p.adversarial_risk || 0) > 0.5, bonus: 0.3, reason: 'Adversarial risk detected' },
  { id: 'biocenose', test: p => p.domain === 'security', bonus: 0.2, reason: 'Security domain' },
  { id: 'syncytium', test: p => (p.shared_state_importance || 0) > 0.6, bonus: 0.25, reason: 'Shared state critical' },
  { id: 'syncytium', test: p => all([(p.trust_level || 0) > 0.7, (p.common_ground || 0) > 0.6]), bonus: 0.2, reason: 'High trust and common ground' },
  { id: 'rhizome', test: p => (p.exploration_need || 0) > 0.6, bonus: 0.3, reason: 'Exploration needed' },
  { id: 'rhizome', test: p => (p.uncertainty || 0) > 0.8, bonus: 0.2, reason: 'Very high uncertainty' },
  { id: 'biome', test: p => (p.resource_allocation_focus || 0) > 0.6, bonus: 0.3, reason: 'Resource allocation focus' },
  { id: 'metapopulation', test: p => all([(p.uncertainty || 0) > 0.5, (p.needed_independence || 0) > 0.4]), bonus: 0.15, reason: 'Moderate uncertainty with independence' },
  { id: 'biocenose', test: p => (p.needed_diversity || 0) > 0.6, bonus: 0.2, reason: 'Diversity needed' },
  { id: 'holobionte', test: p => all([(p.shared_state_importance || 0) > 0.5, (p.trust_level || 0) > 0.5]), bonus: 0.2, reason: 'Shared state with trust' },
  { id: 'a_team', test: p => (p.uncertainty || 0) < 0.3, bonus: 0.2, reason: 'Low uncertainty, well-defined' },
  { id: 'a_team', test: p => p.domain, bonus: 0.1, reason: 'Domain-specific problem' }
]);

const TRANSITION_PENALTIES = Object.freeze({
  'trinity->syncytium': 0.8, 'syncytium->trinity': 0.7,
  'trinity->rhizome': 0.5, 'rhizome->trinity': 0.5,
  'biome->rhizome': 0.3, 'rhizome->biome': 0.3,
  'biocenose->a_team': 0.2, 'a_team->biocenose': 0.2,
  'biocenose->metapopulation': 0.4, 'metapopulation->biocenose': 0.4,
  'holobionte->syncytium': 0.5, 'syncytium->holobionte': 0.5
});

function capsFor(id) {
  const mode = capabilitiesForMode(id);
  if (mode) return mode.required;
  const org = capabilitiesForOrganization(id);
  if (org) return org.required;
  return [];
}

function problemFit(id, profile) {
  const t = TOPOLOGIES[id];
  if (!t) return 0;
  let fit = 0.25 + t.independence * 0.2 + t.diversity * 0.15 + t.state_preservation * 0.1;
  for (const rule of RULES) {
    if (rule.id === id) {
      if (rule.test(profile)) fit += rule.bonus;
    }
  }
  return Math.min(1, fit);
}

function capabilityFit(id, available) {
  const caps = capsFor(id);
  if (caps.length === 0) return 0.5;
  const set = new Set(available || []);
  return caps.filter(c => set.has(c)).length / caps.length;
}

function communicationFit(id, profile) {
  const t = TOPOLOGIES[id];
  if (!t) return 0;
  const needs = get(profile, 'communication_needs', 'moderate');
  if (needs === 'low') return 1 - t.communication_overhead;
  if (needs === 'high') return t.communication_overhead;
  return 0.5 + (0.5 - Math.abs(0.5 - t.communication_overhead)) * 0.5;
}

function independenceScore(id, profile) {
  const t = TOPOLOGIES[id];
  if (!t) return 0;
  const needed = get(profile, 'needed_independence', 0.5);
  return 1 - Math.abs(needed - t.independence);
}

function diversityScore(id, profile) {
  const t = TOPOLOGIES[id];
  if (!t) return 0;
  const needed = get(profile, 'needed_diversity', 0.5);
  return 1 - Math.abs(needed - t.diversity);
}

function transitionCost(id, current) {
  const cur = get(current, 'topology', null);
  if (!cur || cur === id) return 0;
  return getTransitionCost(cur, id).cost;
}

function relationFit(id, relations) {
  if (!relations || relations.length === 0) return 0.5;
  const t = TOPOLOGIES[id];
  if (!t) return 0;
  const compat = relations.filter(r => {
    if (!r) return false;
    if (r.type === 'hierarchical') return t.independence < 0.6;
    if (r.type === 'peer') return t.independence > 0.5;
    return false;
  }).length;
  return compat / relations.length;
}

function historicalSuccess(id, history) {
  if (!history || history.length === 0) return 0.5;
  const entries = history.filter(h => h && h.topology === id);
  if (entries.length === 0) return 0.5;
  const successes = entries.filter(h => h.success).length;
  return successes / entries.length;
}

function computeFactors(id, ctx) {
  const profile = get(ctx, 'problemProfile', {});
  const current = get(ctx, 'currentState', {});
  const relations = get(ctx, 'relations', []);
  const history = get(ctx, 'history', []);
  const available = get(ctx, 'availableCapabilities', []);
  const t = TOPOLOGIES[id];

  return {
    problem_fit: problemFit(id, profile),
    capability_fit: capabilityFit(id, available),
    communication_fit: communicationFit(id, profile),
    epistemic_independence: independenceScore(id, profile),
    diversity: diversityScore(id, profile),
    coordination_overhead: t ? t.coordination_overhead : 0,
    transition_cost: transitionCost(id, current),
    state_preservation_cost: t ? 1 - t.state_preservation : 0,
    token_cost: t ? t.token_cost : 0,
    latency: t ? t.latency : 0,
    risk: t ? t.risk : 0,
    daemon_support: t ? t.daemon_support : 0,
    relation_fit: relationFit(id, relations),
    historical_success: historicalSuccess(id, history)
  };
}

function weightedScore(factors) {
  let score = 0;
  for (const [factor, weight] of Object.entries(WEIGHTS)) {
    score += (factors[factor] ?? 0) * weight;
  }
  return Math.round(score * 1000) / 1000;
}

function factorReasons(factors) {
  const reasons = [];
  const risks = [];
  for (const [factor, value] of Object.entries(factors)) {
    if (value > 0.7 && WEIGHTS[factor] > 0) {
      reasons.push(`${factor}: strong (${value.toFixed(2)})`);
    } else if (value < 0.3 && WEIGHTS[factor] > 0) {
      risks.push(`${factor}: weak (${value.toFixed(2)})`);
    }
  }
  return { reasons, risks };
}

function ruleReasons(id, profile) {
  const reasons = [];
  for (const rule of RULES) {
    if (rule.id === id) {
      if (rule.test(profile)) reasons.push(rule.reason);
    }
  }
  return reasons;
}

function scoreTopology(topologyId, ctx) {
  if (!TOPOLOGIES[topologyId]) return { score: 0, reasons: ['Unknown topology'], risks: ['Topology not recognized'] };
  const factors = computeFactors(topologyId, ctx);
  const { reasons, risks } = factorReasons(factors);
  const profile = get(ctx, 'problemProfile', {});
  reasons.push(...ruleReasons(topologyId, profile));
  return { score: weightedScore(factors), reasons, risks, factors };
}

function getTransitionCost(from, to) {
  const key = `${from}->${to}`;
  const penalty = TRANSITION_PENALTIES[key] || 0.4;
  return { cost: penalty, stateLoss: Math.round(penalty * 0.8 * 100) / 100, agentsAffected: Math.ceil(penalty * 5) };
}

function compareTopologies(ctx) {
  return ALL_IDS.map(id => {
    const r = scoreTopology(id, ctx);
    return { topology: id, score: r.score, reasons: r.reasons, risks: r.risks };
  }).sort((a, b) => b.score - a.score).map((item, i) => ({ ...item, rank: i + 1 }));
}

function resolveTopology(ctx) {
  const results = compareTopologies(ctx);
  if (results.length === 0) return null;
  const best = results[0];
  return { topology: best.topology, score: best.score, reasons: best.reasons, risks: best.risks, rankings: results };
}

module.exports = { TOPOLOGIES, ALL_IDS, scoreTopology, compareTopologies, getTransitionCost, resolveTopology, weightedScore };
