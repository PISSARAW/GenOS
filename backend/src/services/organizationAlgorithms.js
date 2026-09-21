'use strict';

/**
 * @file organizationAlgorithms.js
 * @description Implements the organization topologies that were metadata-only
 * (consensus, adversarial, arena, hierarchy, resources, isolation, memory,
 * role-gradient, capability-mesh) as concrete, testable guidance steps, plus
 * a role authority map the routing layer can enforce.
 */

function list(value) {
  return Array.isArray(value) ? value : [];
}

function ids(agents) {
  return list(agents).map((agent) => agent && agent.id).filter(Boolean);
}

function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function specialistExpertCommittee(state) {
  return { hub: state.orchestratorId || null, spokes: ids(state.agents) };
}

function blindAdversarialReview(state) {
  const members = ids(state.agents);
  const pairs = [];
  for (let index = 0; index < members.length; index += 2) {
    pairs.push([members[index], members[index + 1]].filter(Boolean));
  }
  return { pairs, anonymous: true };
}

function redBlueCoevolution(state) {
  const agents = list(state.agents);
  return {
    red: agents.filter((agent) => /red|attack|adversar/i.test(agent.role || '')).map((agent) => agent.id),
    blue: agents.filter((agent) => /blue|defen/i.test(agent.role || '')).map((agent) => agent.id)
  };
}

function brierMember(dossier) {
  const events = list(dossier && dossier.events);
  const report = [...events].reverse().map((event) => event.evidenceReport).find(Boolean) || {};
  const confidence = num(report.confidence, num(report.coverage, 0.5));
  // Le Brier ne peut être calculé que si une vérité externe (resolvedOutcome)
  // est disponible. Sinon, on ne peut pas utiliser outcome comme ground truth.
  // C'est le correctif du Brier circulaire : le worker ne s'auto-évalue pas.
  const hasResolvedOutcome = report.resolvedOutcome !== undefined && report.resolvedOutcome !== null;
  const outcome = hasResolvedOutcome ? (report.resolvedOutcome === 'success' ? 1 : 0) : null;
  return { outcome, confidence: clamp01(confidence), hasResolvedOutcome };
}

function brierWeightedConsensus(state) {
  const members = list(state.dossiers).map(brierMember);
  // Ne conserver que les membres avec une vérité résolue.
  const resolvedMembers = members.filter((m) => m.hasResolvedOutcome);
  if (!resolvedMembers.length) return { weightedSupport: 0, meanBrier: null, participantCount: 0, resolvedCount: 0 };
  let weightSum = 0;
  let supportSum = 0;
  let brierSum = 0;
  for (const member of resolvedMembers) {
    const outcome = member.outcome;
    const brier = (member.confidence - outcome) ** 2;
    const weight = Math.max(0, 1 - brier);
    weightSum += weight;
    supportSum += weight * outcome;
    brierSum += brier;
  }
  return {
    weightedSupport: Number((weightSum > 0 ? supportSum / weightSum : 0).toFixed(3)),
    meanBrier: Number((brierSum / resolvedMembers.length).toFixed(4)),
    participantCount: resolvedMembers.length,
    resolvedCount: resolvedMembers.length
  };
}

function quorumWithAbstentionOrg(state, options) {
  const votes = list(state.votes);
  const ratio = num(options && options.quorumRatio, 0.5);
  let activeWeight = 0;
  let supportWeight = 0;
  let abstentions = 0;
  for (const vote of votes) {
    if (vote && vote.abstain === true) { abstentions += 1; continue; }
    const weight = num(vote && vote.weight, 1);
    activeWeight += weight;
    if (vote && vote.support === true) supportWeight += weight;
  }
  const support = activeWeight > 0 ? supportWeight / activeWeight : 0;
  return { reached: support >= ratio, support: Number(support.toFixed(3)), abstentions };
}

function stigmergy(state) {
  if (!state.matrix || typeof state.matrix.selectDominantPath !== 'function') return { dominant: null };
  return { dominant: state.matrix.selectDominantPath() };
}

function energyHuddle(state) {
  const populations = list(state.populations);
  const total = num(state.budget, populations.length * 1000);
  const weights = populations.map((population) => Math.max(0, num(population && population.weight, 1)));
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  return { allocations: populations.map((population, index) => ({ id: population && population.id, budget: Math.round((weights[index] / weightSum) * total) })) };
}

function networkSilence(state) {
  return { silent: true, buffered: list(state.agents).length };
}

function arenaTournament(state) {
  return { competitors: ids(state.agents), mode: 'isolated_tournament' };
}

function hierarchicalMerge(state) {
  const agents = list(state.agents);
  return { root: agents[0] ? agents[0].id : null, children: agents.slice(1).map((agent) => agent.id) };
}

function isolatedRecovery(state) {
  return { isolated: ids(state.agents), plan: list(state.lostRoles) };
}

function memoryCompilation(state) {
  return { facts: list(state.facts) };
}

function dynamicPolyethism(state) {
  const agents = list(state.agents).slice().sort((a, b) => num(b && b.fitness, 0) - num(a && a.fitness, 0));
  return { roleGradient: agents.map((agent, index) => ({ id: agent.id, rank: index + 1 })) };
}

function mycelialRouting(state) {
  const need = state.need;
  const agent = list(state.agents).find((candidate) => (candidate.capabilities || []).includes(need));
  return { need: need || null, route: agent ? agent.id : null };
}

const ALGORITHMS = Object.freeze({
  specialist_expert_committee: specialistExpertCommittee,
  blind_adversarial_review: blindAdversarialReview,
  red_blue_coevolution: redBlueCoevolution,
  brier_weighted_consensus: brierWeightedConsensus,
  quorum_with_abstention: quorumWithAbstentionOrg,
  stigmergy,
  energy_huddle: energyHuddle,
  network_silence: networkSilence,
  strategy_arena: arenaTournament,
  competitive_arena: arenaTournament,
  hierarchical_merge: hierarchicalMerge,
  isolated_recovery: isolatedRecovery,
  memory_compilation: memoryCompilation,
  dynamic_polyethism: dynamicPolyethism,
  mycelial_routing: mycelialRouting
});

const AUTHORITY = Object.freeze({
  grey_wolf_optimizer: (role) => (/alpha|beta|delta/i.test(role) ? 'leader' : 'follower'),
  specialist_expert_committee: (role) => (/orchestrator/i.test(role) ? 'hub' : 'spoke'),
  red_blue_coevolution: (role) => (/red|blue/i.test(role) ? 'adversary' : 'observer'),
  hierarchical_merge: (role) => (/orchestrator|host/i.test(role) ? 'root' : 'member')
});

function runOrganizationStep(organization, state = {}, options = {}) {
  const key = String(organization || '').trim().toLowerCase();
  const algorithm = ALGORITHMS[key];
  if (!algorithm) return null;
  return { organization: key, ...algorithm(state, options) };
}

function authorityFor(organization, role) {
  const key = String(organization || '').trim().toLowerCase();
  return AUTHORITY[key] ? AUTHORITY[key](String(role || '')) : 'member';
}

module.exports = { runOrganizationStep, authorityFor, ALGORITHMS, AUTHORITY };
