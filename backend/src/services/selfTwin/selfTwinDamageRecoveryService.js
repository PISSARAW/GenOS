'use strict';

const discovery = require('./selfTwinDependencyDiscovery');
const edgeLearning = require('./selfTwinEdgeLearningService');

async function diagnose(options) {
  if (!options?.prediction || !Array.isArray(options.observations)) {
    throw new TypeError('Self-Twin recovery diagnosis requires prediction and observations.');
  }
  const discrepancy = require('./selfTwinService').compare(options.prediction, options.observations);
  const edges = await edgeLearning.listEdges(options.db, options.scope);
  const target = options.prediction.target;
  const hasKnownDependency = edges.some((edge) => edge.source.endsWith(`:${target}`)
    || edge.target.endsWith(`:${target}`) || edge.source === target || edge.target === target);
  const proposals = discovery.propose({ target: options.prediction.target, components: options.components || [],
    edges, discrepancies: options.observations.filter((item) => Number.isFinite(item.predicted)
      && Number.isFinite(item.observed)).map((item) => ({ ...item, unexplained: !hasKnownDependency })),
    evidenceRefs: options.evidenceRefs || [] });
  return { diagnosisId: require('node:crypto').randomUUID(), predictionId: options.prediction.predictionId,
    discrepancy, candidateDependencies: proposals, status: discrepancy.epsilon > 0 ? 'diagnostic_hypotheses' : 'no_discrepancy',
    repairApplied: false, promotionAllowed: false };
}

async function recover(options) {
  if (typeof options?.runInNursery !== 'function') throw new TypeError('Self-Twin recovery requires isolated nursery execution.');
  const diagnosis = await diagnose(options);
  const interventions = discovery.planInterventions(diagnosis.candidateDependencies, options.budget);
  const outcomes = [];
  for (const intervention of interventions) outcomes.push(await execute(options, diagnosis, intervention));
  return { diagnosis, interventions, outcomes, status: 'nursery_review_required', promotionAllowed: false };
}

async function execute(options, diagnosis, intervention) {
  const result = await options.runInNursery({ diagnosis, intervention, budget: options.budget });
  if (!result || result.status !== 'completed' || !Array.isArray(result.evidenceRefs) || !result.evidenceRefs.length) {
    throw new TypeError('Self-Twin nursery recovery outcome requires completed status and evidence.');
  }
  return { interventionId: intervention.interventionId, status: result.status,
    evidenceRefs: result.evidenceRefs, repairApplied: false, promotionAllowed: false };
}

module.exports = { diagnose, recover };
