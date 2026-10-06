'use strict';

const workspace = require('../../backend/src/services/globalWorkspaceService');
const registry = require('../../backend/src/services/agow/workspaceReceiverRegistry');
const adapters = require('../../backend/src/services/agow/candidates/candidateAdapterService');
const pool = require('../../backend/src/services/agow/candidatePoolService');

async function execute(options) {
  const agentId = `${options.namespace}:${options.caseId}:${options.condition}`;
  const payload = options.input.targets[0];
  let received = null;
  const release = registry.register({ module: 'completion_actuator', handle: async ({ phase, candidate }) => {
    if (phase === 'inspect') return { received };
    received = Number(candidate.content.compactPreview);
    return { consumed: true, changed: true, state: { received },
      interventionCondition: 'broadcast_delivered', interventionInput: [payload],
      interventionOutputDelta: [received], downstreamAction: 'actuator-target' };
  } });
  const candidate = adapters.build({ agentId, module: 'perception', observation: {
    compactPreview: String(payload), confidence: 0.98, goalMatched: true,
    evidenceRefs: [options.caseId], causalEvidence: true, actionable: true } });
  try {
    const modules = ['broadcast_suppressed', 'broadcast_ablated'].includes(options.condition) ? [] : ['completion_actuator'];
    const admission = await pool.submit({ candidate, db: options.db });
    if (!admission.accepted) throw new Error(`Local candidate admission failed: ${admission.reason}`);
    const cycle = await workspace.cycle({ agentId, db: options.db,
      receivers: modules, skipTransport: true, ignitionThreshold: 0.1, modeCosts: { ACT: 0 } });
    if (cycle.modeResult?.executed !== true) throw new Error(`Workspace execution failed: ${JSON.stringify(cycle.modeResult)}`);
    const success = received === payload;
    return { success, errors: success ? 0 : 1, taskUtility: Number(success),
      globalWorkspaceActivations: cycle?.frame ? 1 : 0,
      broadcasts: cycle?.broadcast?.deliveries?.length || 0,
      received, expected: payload, mode: cycle?.modeReceipt?.chosenMode,
      cost: 0, frameId: cycle?.frame?.frameId, evidenceRefs: [candidate.candidateId] };
  } finally { release(); }
}

module.exports = { execute };
