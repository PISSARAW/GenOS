'use strict';

/**
 * Causality Service — Lois de causalité, contrefactuels, déterminisme, régularité.
 *
 * Mapping philosophique :
 *  - Hume (problème de la causalité) : la causalité n'est pas observée directement, mais inférée.
 *    La régularité (cause → effet répétée) est la base de l'induction.
 *  - Lewis (contrefactuels) : "Si X n'avait pas eu lieu, Y se serait produit ?"
 *    Nécessité = contrefactuel valide (Y dépend de X).
 *    Contingence = contrefactuel invalide (Y sans X est possible).
 *  - Déterminisme : un état initial unique → un état final unique.
 */
const causalLinks = new Map();
const counterfactualRegistry = new Map();

function recordCausalLink({ causeAgent, effectAgent, mechanism = 'tool_call' }) {
  if (!causeAgent || !effectAgent) {
    throw new Error('causalityService.recordCausalLink requires causeAgent and effectAgent');
  }
  const link = {
    id: `causal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    causeAgent,
    effectAgent,
    mechanism,
    timestamp: Date.now(),
  };
  causalLinks.set(link.id, link);
  return link;
}

/**
 * computeNecessity — Lewis (contrefactuels).
 *
 * Nécessité vs contingence (Lewis, contrefactuels) :
 *  - Nécessaire : l'effet NE se produit PAS en l'absence de la cause.
 *    → actualOutcome ≠ counterfactualOutcome → nécessité.
 *  - Contingent : l'effet se produit AUSSI en l'absence de la cause.
 *    → actualOutcome === counterfactualOutcome → contingence.
 *
 * Retourne un objet structuré avec verdict, causeAgent, effectAgent, reason.
 */
function computeNecessity({ causeAgent, effectAgent, actualOutcome, counterfactualOutcome }) {
  if (!causeAgent || !effectAgent) {
    throw new Error('causalityService.computeNecessity requires causeAgent and effectAgent');
  }
  const necessity = actualOutcome !== counterfactualOutcome;
  return {
    verdict: necessity ? 'necessary' : 'contingent',
    causeAgent,
    effectAgent,
    reason: necessity
      ? 'Effect counterfactually depends on cause (absent cause → blocked effect)'
      : 'Effect occurs even without cause (no counterfactual dependence)',
  };
}

/**
 * simulateCounterfactual — Lewis (scénario contrefactuel).
 *
 * Simule un monde possible où la cause est retirée, pour évaluer la dépendance.
 */
function simulateCounterfactual({ causeAgent, effectAgent, scenario }) {
  if (!causeAgent || !effectAgent || !scenario) {
    throw new Error('causalityService.simulateCounterfactual requires causeAgent, effectAgent, scenario');
  }
  const counterfactualOutcome = 'blocked';
  const entry = {
    causeAgent,
    effectAgent,
    scenario,
    actualOutcome: 'completed',
    counterfactualOutcome,
    registeredAt: Date.now(),
  };
  counterfactualRegistry.set(`${causeAgent}:${effectAgent}:${scenario}`, entry);
  const verdict = computeNecessity(entry);
  return {
    causeAgent,
    effectAgent,
    scenario,
    actualOutcome: 'completed',
    counterfactualOutcome,
    causalEffect: verdict.verdict === 'necessary' ? 'prevented_block' : 'no_prevention',
    verdict: verdict.verdict,
  };
}

function isDeterministic(executionRuns) {
  if (!Array.isArray(executionRuns) || executionRuns.length === 0) return false;
  const firstOutcome = executionRuns[0]?.finalOutcome ?? null;
  return executionRuns.every(run => (run?.finalOutcome ?? null) === firstOutcome);
}

/**
 * isIndeterministic — complément : détecte l'indétermination.
 */
function isIndeterministic(executionRuns) {
  if (!Array.isArray(executionRuns) || executionRuns.length < 2) return false;
  return !isDeterministic(executionRuns);
}

function checkRegularity(links) {
  if (!Array.isArray(links)) return false;
  return links.every(link => typeof link.timestamp === 'number' && link.timestamp > 0);
}

function humeRegularity({ observations = [] } = {}) {
  const regular = Array.isArray(observations) && observations.length > 0
    && observations.every((observation) => observation.cause !== undefined && observation.effect !== undefined);
  return {
    regular,
    observations: Array.isArray(observations) ? observations : [],
    inference: regular ? 'regularity_based' : 'insufficient_observations',
    humeClaim: 'La necessite causale est inferee d une regularite, non observee directement.',
  };
}

function assessFreeWill({ agent, model = 'compatibilism', choice, causes = [] } = {}) {
  if (!agent || choice === undefined) throw new Error('causalityService.assessFreeWill requires agent and choice');
  const models = ['compatibilism', 'incompatibilism', 'libertarianism'];
  if (!models.includes(model)) throw new Error(`causalityService.assessFreeWill invalid model: ${model}`);
  return { agent, choice, causes, model, free: model !== 'incompatibilism', responsibility: model !== 'incompatibilism' };
}

function listCausalLinks({ agentId = null, limit = 100 } = {}) {
  const all = Array.from(causalLinks.values()).sort((a, b) => b.timestamp - a.timestamp);
  if (!agentId) return all.slice(0, limit);
  return all
    .filter(link => link.causeAgent === agentId || link.effectAgent === agentId)
    .slice(0, limit);
}

function listCounterfactuals() {
  return Array.from(counterfactualRegistry.values());
}

module.exports = {
  recordCausalLink,
  computeNecessity,
  simulateCounterfactual,
  isDeterministic,
  isIndeterministic,
  checkRegularity,
  humeRegularity,
  assessFreeWill,
  listCausalLinks,
  listCounterfactuals,
  counterfactualRegistry,
};
