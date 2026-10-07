'use strict';

function agentCapabilityGap(agent, required) {
  const owned = new Set(agent.capabilities || []);
  return required.filter((c) => !owned.has(c));
}

function coverageActionForGap(gap, genomes, agent) {
  const exact = genomes.find((g) => gap.every((c) => (g.capabilities || []).includes(c)));
  if (exact) {
    return { action: 'clone', genomeId: exact.id, targetAgentId: agent.id, reasoning: 'Clone covers full gap', rollback: 'revert_genome' };
  }
  const partial = genomes.filter((g) => gap.some((c) => (g.capabilities || []).includes(c)));
  if (partial.length >= 2) {
    return { action: 'cross', genomeId: partial.map((g) => g.id), targetAgentId: agent.id, reasoning: 'Cross merges partial coverage', rollback: 'revert_genome' };
  }
  if (partial.length === 1) {
    return { action: 'graft', genomeId: partial[0].id, targetAgentId: agent.id, reasoning: 'Graft adds missing capability', rollback: 'remove_graft' };
  }
  return { action: 'mutate', targetAgentId: agent.id, reasoning: 'No genome covers gap; mutation needed', rollback: 'revert_mutation' };
}

function genotypeActionsForAgent(agent, ctx) {
  const gap = agentCapabilityGap(agent, ctx.requiredCapabilities || []);
  if (gap.length === 0) {
    return [{ action: 'reuse', targetAgentId: agent.id, reasoning: 'No capability gap; reuse existing genotype', rollback: 'none' }];
  }
  const actions = [coverageActionForGap(gap, ctx.availableGenomes || [], agent)];
  if (gap.length > 2) {
    actions.push({ action: 'speciate', targetAgentId: agent.id, reasoning: 'Large gap (' + gap.length + ') may require speciation', rollback: 'merge_species' });
  }
  return actions;
}

function planGenotypeActions(ctx) {
  const actions = [];
  const targets = ctx.targetAgents || [];
  for (const agent of targets) {
    actions.push(...genotypeActionsForAgent(agent, ctx));
  }
  return actions;
}

function planEpigeneticChanges(ctx) {
  const changes = [];
  const pressure = ctx.pressure || 0;
  const evidence = ctx.evidence || [];
  for (const agent of ctx.agentStates || []) {
    if (pressure < 0.5) continue;
    const markers = (agent.epigeneticMarkers || []).map((m) => ({ ...m, active: true }));
    changes.push({
      agentId: agent.id,
      changes: markers,
      reason: 'Epigenetic adaptation to pressure ' + pressure.toFixed(2) + '; evidence: ' + evidence.length + ' items',
      rollback: 'reset_markers'
    });
  }
  return changes;
}

function planPlasmidActions(ctx) {
  const actions = [];
  const plasmids = ctx.availablePlasmids || [];
  const targets = ctx.targetAgents || [];
  const required = ctx.requiredCapabilities || [];
  for (const agent of targets) {
    const owned = new Set(agent.capabilities || []);
    const gap = required.filter((c) => !owned.has(c));
    if (gap.length === 0) continue;
    const compatible = plasmids.filter((p) => gap.includes(p.capability) && p.expressionStatus === 'active');
    if (compatible.length > 0) {
      actions.push({
        action: 'acquire',
        plasmidId: compatible[0].id,
        fromAgentId: compatible[0].donor,
        toAgentId: agent.id,
        reason: 'Plasmid covers gap: ' + gap.join(', '),
        rollback: 'revoke_plasmid'
      });
    }
  }
  return actions;
}

module.exports = { planGenotypeActions, planEpigeneticChanges, planPlasmidActions };
