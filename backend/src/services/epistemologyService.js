'use strict';

/**
 * Epistemology Service — Platonisme, Aristotélisme, Kantisme.
 *
 * Mapping GenOS :
 *  - Platonisme      = strategy_contracts (formes idéales)
 *  - Aristotélisme   = quatre causes (matérielle/formelle/efficiente/finale)
 *  - Kantisme        = noumène (interne) vs phénomène (observable)
 *  - Catégories a priori = tool_lease (structure de la pensée agentique)
 */

const IDEAL_FORMS = {
  perfect_agent: { role: 'orchestrator', budget: Infinity, evidence: 'complete' },
  perfect_worker: { role: 'implementation', budget: 1000, evidence: 'verified' },
  perfect_evidence: { claims: [], receipts: [], verified: true },
};

function getFormIdeal(formName) {
  if (!formName || typeof formName !== 'string') {
    throw new Error('epistemologyService.getFormIdeal requires a form name');
  }
  return IDEAL_FORMS[formName] || null;
}

function fourCauses({ agent }) {
  if (!agent) throw new Error('epistemologyService.fourCauses requires an agent');
  return {
    material: agent.substrate || 'genos_process',
    formal: agent.role || 'unknown',
    efficient: agent.parent_agent_id || 'spontaneous',
    final: agent.current_task || 'undefined',
  };
}

function noumeneVsPhenomenon({ agent }) {
  if (!agent) throw new Error('epistemologyService.noumeneVsPhenomenon requires an agent');
  return {
    noumene: {
      trueState: agent.internalState || null,
      thingInItself: true,
    },
    phenomenon: {
      observableState: agent.status || 'unknown',
      appearances: agent.telemetry || [],
    },
  };
}

function categoriesAPriori() {
  return {
    quantity: ['unity', 'plurality', 'totality'],
    quality: ['reality', 'negation', 'limitation'],
    relation: ['substance', 'causality', 'community'],
    modality: ['possibility', 'existence', 'necessity'],
  };
}

module.exports = {
  getFormIdeal,
  fourCauses,
  noumeneVsPhenomenon,
  categoriesAPriori,
};
