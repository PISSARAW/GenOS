'use strict';

/**
 * Aristotelian Service — Catégories, causes, hylémorphisme, dynamis/energeia.
 *
 * Mapping GenOS :
 *  - Catégories = types d'attributs d'un agent (substance, quantité, qualité, relation, etc.)
 *  - Causes = matérielle (ce dont il est fait), formelle (sa structure), efficiente (son origine), finale (son but)
 *  - Hylémorphisme = matière (potentialité) + forme (actualité)
 *  - Dynamis/Energeia = puissance (capacité) → acte (réalisation)
 *  - Téléologie = finalité, but vers lequel tend l'agent
 *
 * Référence : Aristote, *Métaphysique*, *Catégories*, *Physique*, *De Anima*.
 */

const CATEGORIES = {
  substance: { description: 'Ce qui est en soi et par soi (l\'agent)', priority: 1 },
  quantity: { description: 'Combien (budget, tokens, workers)', priority: 2 },
  quality: { description: 'Quel type (role, status, model_tier)', priority: 3 },
  relation: { description: 'Rapport à autre chose (parent_agent_id, fleet_id)', priority: 4 },
  place: { description: 'Où (workspace_id, organization_id)', priority: 5 },
  time: { description: 'Quand (created_at, updated_at)', priority: 6 },
  position: { description: 'Disposition spatiale (isolation_mode)', priority: 7 },
  state: { description: 'État (idle, running, blocked, completed)', priority: 8 },
  action: { description: 'Ce qui est fait (current_task)', priority: 9 },
  passion: { description: 'Ce qui est subi (recovery, apoptosis)', priority: 10 },
};

const CAUSE_TYPES = ['material', 'formal', 'efficient', 'final'];

function fourCauses({ agent }) {
  if (!agent) throw new Error('aristotelianService.fourCauses requires an agent');
  return {
    material: { cause: 'material', substrate: agent.substrate || 'genos_process' },
    formal: { cause: 'formal', role: agent.role || 'unknown' },
    efficient: { cause: 'efficient', initiator: agent.parent_agent_id || 'spontaneous' },
    final: { cause: 'final', purpose: agent.current_task || 'undefined' },
  };
}

function categoryEntry(value, fallback) {
  return value || fallback;
}

function categorize({ agent }) {
  if (!agent) throw new Error('aristotelianService.categorize requires an agent');
  const passion = agent.is_apoptotic ? 'apoptosis' : 'none';
  return {
    substance: categoryEntry(agent.id, null),
    quantity: categoryEntry(agent.cognitive_budget, 0),
    quality: categoryEntry(agent.role, 'unknown'),
    relation: categoryEntry(agent.parent_agent_id, null),
    place: categoryEntry(agent.workspace_id, null),
    time: categoryEntry(agent.created_at, null),
    position: categoryEntry(agent.isolation_mode, 'unknown'),
    state: categoryEntry(agent.status, 'unknown'),
    action: categoryEntry(agent.current_task, null),
    passion,
  };
}

function teleology({ agent }) {
  if (!agent) throw new Error('aristotelianService.teleology requires an agent');
  return {
    agentId: agent.id,
    telos: agent.current_task || 'undefined',
    purpose: agent.purpose || agent.current_task || 'undefined',
    finalCause: agent.current_task || 'undefined',
    actualization: agent.status === 'completed' ? 'fully_actualized' : 'in_progress',
  };
}

function hylomorphism({ matter, form }) {
  if (!matter || !form) throw new Error('aristotelianService.hylomorphism requires matter and form');
  return { matter, form, substance: { matter, form }, actuality: form, potentiality: matter };
}

function dynamisEnergeia({ potential, actual }) {
  if (!potential || !actual) throw new Error('aristotelianService.dynamisEnergeia requires potential and actual');
  return { dynamis: potential, energeia: actual, transition: `${potential} → ${actual}` };
}

module.exports = {
  CATEGORIES,
  CAUSE_TYPES,
  fourCauses,
  hylomorphism,
  dynamisEnergeia,
  teleology,
  categorize,
};
