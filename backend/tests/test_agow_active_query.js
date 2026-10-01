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
  receiverRegistry.clear();
  console.log('✅ AGOW active query planning and evidence budget passed');
}

main().catch((error) => {
  receiverRegistry.clear();
  console.error(error);
  process.exitCode = 1;
});
