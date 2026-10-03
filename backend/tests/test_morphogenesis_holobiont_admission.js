'use strict';

const assert = require('node:assert/strict');
const { compileExpression } = require('../src/services/morphogenesis/graph/morphologyCompiler');
const { topologyExpression } = require('../src/services/morphogenesis/expression');
const { MorphologyRuntime } = require('../src/services/morphogenesis/runtime/morphologyRuntime');
const { installTopologyPlugins } = require('../src/services/morphogenesis/runtime/topologyPlugins');

function runtime() {
  const instance = new MorphologyRuntime({ globalBudget: { tokens: 100 } });
  installTopologyPlugins(instance);
  return instance;
}

function graph() {
  return compileExpression(topologyExpression('holobionte'), {
    mission: 'verify holobiont admission', globalBudget: { tokens: 100 }
  });
}

function verifiedOutput() {
  return {
    receiptId: 'mission-receipt-1', benefitScore: 0.9, evidenceQuality: 0.9,
    costScore: 0.1, riskScore: 0, resourcesConsumed: { tokens: 1 },
    verification: {
      status: 'VERIFIED', verifierId: 'verifier.mission', resultHash: 'sha256:mission-result',
      evidenceRefs: ['proof:review-architecture-proof:result']
    }
  };
}

async function main() {
  let executions = 0;
  const rejected = await runtime().execute(graph(), {
    missionId: 'mission-trial-reject', capability: 'review-architecture',
    trialCapabilityExecutor: async () => ({ contributionScore: 0.2, contractCompliant: true,
      verification: { status: 'VERIFIED', verifierId: 'verifier.trial', resultHash: 'sha256:trial-low',
        evidenceRefs: ['proof:review-architecture-proof:trial'] } }),
    executeCapability: async () => { executions += 1; return verifiedOutput(); }
  });
  assert.equal(rejected.output.status, 'ADMISSION_REJECTED');
  assert.equal(executions, 0, 'a rejected trial must never reach normal execution');

  const admitted = await runtime().execute(graph(), {
    missionId: 'mission-trial-pass', capability: 'review-architecture',
    allocation: { policy: { tokens: { basal: 1, preferred: 2, maximum: 5, burstAllowance: 0 } },
      available: { tokens: 10 } },
    trialCapabilityExecutor: async ({ sandbox, contract }) => {
      assert.equal(sandbox.maxCost.tokens, 4);
      assert.ok(sandbox.maxCost.tokens <= contract.maxCost.tokens);
      return { contributionScore: 0.9, contractCompliant: true,
        verification: { status: 'VERIFIED', verifierId: 'verifier.trial', resultHash: 'sha256:trial-pass',
          evidenceRefs: ['proof:review-architecture-proof:trial'] } };
    },
    executeCapability: async () => { executions += 1; return verifiedOutput(); }
  });
  assert.equal(admitted.output.status, 'VERIFIED');
  assert.equal(executions, 1);

  await assert.rejects(() => runtime().execute(graph(), {
    capability: 'review-architecture', executeCapability: async () => verifiedOutput()
  }), { code: 'HOLOBIONT_TRIAL_EXECUTOR_REQUIRED' });
  console.log('morphogenesis holobiont admission: passed');
}

main().catch((error) => { console.error(error); process.exit(1); });
