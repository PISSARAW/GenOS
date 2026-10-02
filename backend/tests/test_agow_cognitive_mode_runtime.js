'use strict';

const assert = require('node:assert/strict');
const runtime = require('../src/services/agow/cognitiveModeRuntimeService');
const experience = require('../src/services/agow/cognitiveModeExperienceService');

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

async function main() {
  const db = memoryDb();
  const frame = { frameId: 'mode-frame', agentId: 'mode-agent', unresolvedQuestions: ['safety'],
    epistemicState: { uncertainty: 1, contradiction: 1 }, causalContext: { predictionError: 1 },
    selfModel: { uncertainty: 1 }, interoception: { viabilityRisk: 1 } };
  const candidates = [{ epistemicContext: { irreversibility: 1 }, measures: { goalRelevance: 0.1 } }];
  const decision = await runtime.choose({ frame, candidates, agentId: frame.agentId, db });
  assert.equal(decision.mode, 'OBSERVE');
  const receipt = await runtime.record({ frame, decision, agentId: frame.agentId, db, now: 1 });
  const route = await runtime.execute({ frame, decision, receipt, agentId: frame.agentId, db,
    runQuery: async (mode) => ({ mode }) });
  assert.equal(route.route, 'OBSERVE');
  assert.equal(route.result.mode, 'OBSERVE');
  const update = await experience.observeOutcome({ agentId: frame.agentId, db,
    receiptId: receipt.receiptId, realizedLoss: 0.8 });
  assert.equal(update.chosenMode, 'OBSERVE');
  assert.equal(typeof update.predictionError, 'number');
  const calibrated = await runtime.choose({ frame, candidates, agentId: frame.agentId, db });
  assert.equal(calibrated.provenance.calibrated, true);
  console.log('AGOW cognitive mode runtime selection, receipts and calibration passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
