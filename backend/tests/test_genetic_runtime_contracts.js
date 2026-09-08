const assert = require('node:assert/strict');
const mcp = require('../src/services/mcpStrategyTools');
const bio = require('../src/services/mcpBioExtra');
const { dossierToCandidate } = require('../src/services/arenaTaskEvaluation');

(async () => {
  const genes = { role: 'worker', strategy: 'search', tools: ['genos_test'], temp: 0.4, topP: 0.8 };
  const result = await mcp.executeStrategyTool('genos_resilience_hypermutation', { genes, seed: 'contract-seed' });
  assert.equal(result.success, true);
  assert.equal(result.output.reproducibilitySeed, 'contract-seed');
  const failedLamarckian = bio.executeBioExtra('genos_lamarckian_mutation', { agent_id: 'missing-agent' }, { timeoutMs: 1 });
  const lamarckian = await Promise.resolve(failedLamarckian);
  assert.equal(lamarckian.success, false);
  const candidate = dossierToCandidate({ workerId: 'fitness-worker', fitnessScore: 37, evidenceReport: { claims: [{ evidence: [{ receiptHash: 'a'.repeat(64), source: 'test' }] }] } });
  assert.equal(candidate.fitnessScore, 37);
  console.log('Genetic runtime contracts passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });