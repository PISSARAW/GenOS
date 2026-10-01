'use strict';

const { createHash } = require('node:crypto');
const adapter = require('../candidates/candidateAdapterService');
const workspace = require('../../globalWorkspaceService');

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function candidateForReceipt(options) {
  const { receipt, parentFrame, agentId } = options;
  const outcome = receipt.outcome;
  return adapter.build({ module: 'epistemic', agentId, now: receipt.createdAt,
    observation: {
      candidateId: `counterfactual:${receipt.simulationId}`, semanticType: 'counterfactual_outcome',
      artifactRef: receipt.receiptId,
      compactPreview: String(outcome.predictedOutcome || `predicted_success=${outcome.success}`).slice(0, 500),
      evidenceRefs: [...new Set([receipt.receiptId, ...(outcome.evidenceRefs || [])])],
      causalParents: [parentFrame.frameId], confidence: 1 - outcome.uncertainty,
      predictionError: 0, evidenceCoverage: outcome.evidenceRefs.length ? 1 : 0,
      expectedInformationGain: outcome.uncertainty, goalMatched: true, actionable: false,
      causalEvidence: outcome.evidenceRefs.length > 0, estimatedCost: outcome.cost,
      stateHash: digest(receipt),
      epistemicOrigin: { origin: 'counterfactual_simulated', realityMode: 'counterfactual',
        agency: 'environment', simulationId: receipt.simulationId, parentRealityFrameId: parentFrame.frameId }
    }
  });
}

async function publish(options) {
  const candidate = candidateForReceipt(options);
  return workspace.submitCandidate({ candidate, db: options.db, triggerCycle: false,
    activeGoal: options.parentFrame.activeGoal });
}

module.exports = { candidateForReceipt, publish };
