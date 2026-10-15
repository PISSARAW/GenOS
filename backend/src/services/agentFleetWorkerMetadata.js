'use strict';

const crypto = require('crypto');
const { buildExecutionBudget } = require('./workerBudgetAllocationService');

function phenotypeHash(selection) {
  if (!selection || !selection.genes) return null;
  return crypto.createHash('sha256').update(JSON.stringify(selection.genes)).digest('hex').slice(0, 16);
}

function resolveGenotypeRef(evolution) {
  return evolution && (evolution.dnaGenomeRef || evolution.genomeRef) || null;
}

function buildWorkerMeta(details) {
  const { parent, plan, mission, index, evolution, dnaSelection } = details;
  const assignmentList = details.assignments || plan?.dispatchWorkers || [];
  const genotypeRef = resolveGenotypeRef(evolution);
  return {
    modelBudgetScope: mission.modelBudgetScope,
    executionPolicy: mission.executionPolicy,
    executionBudget: buildExecutionBudget({ executionBudget: mission.executionBudget,
      assignedTokens: details.assignedTokens, index, assignmentCount: assignmentList.length || 1 }),
    orchestratorAgentId: parent.id,
    budgetRound: { stage: 'initial', orchestratorId: parent.id,
      missionId: mission.missionId || parent.id, organizationId: mission.organizationId || null,
      projectId: mission.projectId || null },
    genome: evolution.genes,
    genomeRef: genotypeRef,
    genotypeRef,
    phenotypeHash: phenotypeHash(dnaSelection),
    genomeContentHash: (evolution && evolution.genomeContentHash) || null,
    dnaAuthority: Boolean(dnaSelection),
    predictedFitness: evolution.predictedFitness
  };
}

module.exports = { buildWorkerMeta };
