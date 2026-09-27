'use strict';

const assert = require('assert');
const { gateFinalOutput, assertFinalOutput } = require('../src/services/finalOutputGateService');

const report = { propositions: [
  { id: 'claim-ok', statement: 'Le score est 2', outcome: 'success', confidence: 'supported' },
  { id: 'claim-failed', statement: 'Le score est 3', outcome: 'failed', confidence: 'supported' },
  { id: 'claim-contested', statement: 'Le score est 4', outcome: 'success', confidence: 'contested', contradictedBy: ['claim-other'] },
] };

async function main() {
  const good = { report, sentences: [{ kind: 'factual', text: 'Le score est 2 [claim:claim-ok]', claimIds: ['claim-ok'] }] };
  assert.strictEqual(gateFinalOutput(good).passed, true);
  assert.strictEqual(assertFinalOutput(good).completionAllowed, true);
  assert.ok(gateFinalOutput({ report, sentences: [{ kind: 'factual', text: 'Le score est 99 [claim:claim-ok]', claimIds: ['claim-ok'] }] }).issues.some((item) => item.code === 'INVENTED_NUMBER'));
  assert.ok(gateFinalOutput({ report, sentences: [{ kind: 'factual', text: 'Le score est bon', claimIds: ['claim-failed'] }] }).issues.some((item) => item.code === 'INVERTED_OUTCOME'));
  assert.ok(gateFinalOutput({ report, sentences: [{ kind: 'factual', text: 'Le score est 4', claimIds: ['claim-contested'] }] }).issues.some((item) => item.code === 'CONTRADICTION_UNRESOLVED'));
  assert.throws(() => assertFinalOutput({ report, sentences: [{ kind: 'factual', text: 'Sans source' }] }), (error) => error.code === 'FINAL_OUTPUT_GATE_BLOCKED');
  console.log('✅ final output gate tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
