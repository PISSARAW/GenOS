'use strict';

const assert = require('node:assert/strict');
const queryService = require('../src/services/agow/workspaceQueryService');
const receiverRegistry = require('../src/services/agow/workspaceReceiverRegistry');

function memoryDb() {
  const values = new Map();
  return {
    async get(_sql, scope, key) {
      const value = values.get(`${scope}:${key}`);
      return value == null ? null : { payload_json: JSON.stringify(value) };
    },
    async run(sql, ...args) {
      if (sql.includes('INSERT OR REPLACE INTO adaptive_state')) values.set(`${args[0]}:${args[1]}`, JSON.parse(args[2]));
      return { changes: 1 };
    }
  };
}

async function seedPolicy(db, scope, state) {
  const { AdaptiveStateService } = require('../src/services/adaptiveStateService');
  await new AdaptiveStateService(db).persistObject(scope, 'query-test', state, 1);
}

async function main() {
  const db = memoryDb();
  await seedPolicy(db, 'agow_attention_policy', { minimumEvidenceRefs: 2, maxCost: 0.25, moduleBudget: 2 });
  const frame = { frameId: 'frame-query', agentId: 'query-test', activeGoal: 'verify claim',
    unresolvedQuestions: ['Is the claim supported?'],
    epistemicState: { confidence: 0.4, uncertainty: 0.6, contradiction: 0 },
    causalContext: { predictionError: 0, triggeredBy: [], previousFrameId: null } };
  const result = await queryService.plan({ frame, db, capability: 'verification', maxCost: 0, moduleBudget: 2 });
  assert.equal(result.planned, true);
  assert.equal(result.query.minimumEvidenceRefs, 2);
  assert.equal(result.query.budget.maxCost, 0);
  assert.deepEqual(result.query.candidateModules, ['memory']);
  const prospective = await queryService.plan({ frame, db, capability: 'prospective_simulation', moduleBudget: 1 });
  assert.equal(prospective.planned, true);
  assert.deepEqual(prospective.query.candidateModules, ['counterfactual']);
  const procedure = { pathwayId: 'known', confidence: 0.96 };
  const direct = queryService.cognitiveDemand({ epistemicState: { uncertainty: 0.1, contradiction: 0 },
    causalContext: { predictionError: 0 }, unresolvedQuestions: [] }, procedure);
  assert.equal(direct.route, procedure);
  assert.equal(direct.reason, 'consolidated_low_risk_procedure');
  const escalated = queryService.cognitiveDemand({ epistemicState: { uncertainty: 0.6, contradiction: 0 },
    causalContext: { predictionError: 0 }, unresolvedQuestions: ['uncertain'] }, procedure);
  assert.equal(escalated.route, null);
  assert.equal(escalated.reason, 'procedure_requires_deliberation');
  receiverRegistry.clear();
  console.log('✅ AGOW active query planning and evidence budget passed');
}

main().catch((error) => {
  receiverRegistry.clear();
  console.error(error);
  process.exitCode = 1;
});
