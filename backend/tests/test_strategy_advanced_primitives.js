const assert = require('node:assert/strict');
const adapter = require('../src/services/strategyExecutionAdapter');
const registry = require('../src/strategies/strategyRegistry');

(async () => {
  const reports = await adapter.executePrimitive('independent_reports', {
    reports: [
      { id: 'red-1', author: 'red', verdict: 'vulnerable', evidence: ['request'] },
      { id: 'blue-1', author: 'blue', verdict: 'safe', evidence: ['test'] }
    ]
  });
  assert.equal(reports.success, true);
  assert.equal(reports.independent, true);

  const observer = await adapter.executePrimitive('neutral_observer', {
    reports: [
      { author: 'a', verdict: 'safe', evidence: ['test'] },
      { author: 'b', verdict: 'safe', evidence: ['test-2'] }
    ]
  });
  assert.equal(observer.verdict, 'safe');
  assert.equal(observer.confidence, 1);

  const security = await adapter.executePrimitive('security_coevolution', {
    redTeam: [{ findings: ['missing-auth'], evidence: ['probe'] }],
    blueTeam: [{ addressedFindings: ['missing-auth'], evidence: ['patch-test'] }]
  });
  assert.equal(security.resolved, true);
  assert.equal(registry.getStrategy('red_blue_coevolution').missingPrimitives.length, 0);
  console.log('Advanced strategy primitive checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });