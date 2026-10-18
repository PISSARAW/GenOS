'use strict';

const GENOME_ACTION_SCHEMA = 'genos.morphogenesis-genome-action/v1';

function agentCapabilityGap(agent, required) {
  const owned = new Set(agent.capabilities || []);
  return required.filter((c) => !owned.has(c));
}

function genomeCapabilities(genome) {
  return genome.capabilities || genome.phenotype?.capabilities || [];
}

function parentBinding(genome) {
  return {
    genomeRef: genome.id,
    contentHash: genome.contentHash,
    phenotypeHash: genome.phenotypeHash || null,
    lineageId: genome.lineageId || null,
    generation: genome.generation || 0,
    dnaStatus: genome.dnaStatus || 'DRAFT'
  };
}

function obligations(action) {
  const common = ['parent_fingerprint_match', 'tenant_scope_match', 'provenance_persisted'];
  if (action === 'reuse') return [...common, 'active_genome_required'];
  return [...common, 'candidate_isolation', 'paired_evaluation', 'promotion_gate'];
}

function genomeAction(input) {
  const { action, agent, parents, extra = {} } = input;
  return {
    schema: GENOME_ACTION_SCHEMA,
    action,
    targetAgentId: agent.id,
    targetSpawnIndex: Number.isInteger(agent.spawnIndex) ? agent.spawnIndex : null,
    parentBindings: parents.map(parentBinding),
    expectedOutputStatus: action === 'reuse' ? 'active' : 'candidate',
    evidenceObligations: obligations(action),
    rollback: action === 'reuse' ? 'restore_binding' : 'discard_candidate',
    ...extra
  };
}

function graftSpecs(gap) {
  return gap.map((capability) => ({
    locus: `CAP_${String(capability).replace(/[^a-z0-9]+/gi, '_').toUpperCase()}`,
    instruction: String(capability),
    plasmid: false
  }));
}

function coverageActionForGap(gap, genomes, agent) {
  const exact = genomes.find((g) => gap.every((c) => genomeCapabilities(g).includes(c)));
  if (exact) {
    return genomeAction({ action: 'reuse', agent, parents: [exact], extra: { genomeRef: exact.id,
      reasoning: 'An active genome covers the complete capability gap.' } });
  }
  const partial = genomes.filter((g) => gap.some((c) => genomeCapabilities(g).includes(c)));
  if (partial.length >= 2) {
    return genomeAction({ action: 'cross', agent, parents: partial.slice(0, 2), extra: {
      reasoning: 'Two active genomes provide complementary partial coverage.' } });
  }
  if (partial.length === 1) {
    const action = gap.length > 1 ? 'speciate' : 'graft';
    return genomeAction({ action, agent, parents: partial, extra: { grafts: graftSpecs(gap),
      concept: gap.join('+'), reasoning: `${action} derives the missing capabilities.` } });
  }
  return genomeAction({ action: 'unresolved', agent, parents: [], extra: { missingCapabilities: gap,
    expectedOutputStatus: null, evidenceObligations: ['admissible_parent_required'],
    rollback: 'none', reasoning: 'No admissible parent genome covers the gap.' } });
}

function genotypeActionsForAgent(agent, ctx) {
  const gap = agentCapabilityGap(agent, ctx.requiredCapabilities || []);
  if (gap.length === 0) {
    return [];
  }
  return [coverageActionForGap(gap, ctx.availableGenomes || [], agent)];
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

module.exports = { GENOME_ACTION_SCHEMA, planGenotypeActions, planEpigeneticChanges, planPlasmidActions };
