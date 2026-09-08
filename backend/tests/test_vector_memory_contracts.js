const assert = require('node:assert/strict');
const { VectorMemoryService } = require('../src/services/vectorMemoryService');

const service = new VectorMemoryService();
const calls = [];
service.initDb = async () => ({
  async get(sql, ...args) { calls.push({ sql, args }); return null; },
  async run(sql, ...args) { calls.push({ sql, args }); return { changes: 1 }; }
});

(async () => {
  const a = await service.storeMemory('agent', 'same content', new Array(768).fill(0.1), { organizationId: 'org-a', projectId: 'p' });
  const b = await service.storeMemory('agent', 'same content', new Array(768).fill(0.1), { organizationId: 'org-b', projectId: 'p' });
  assert.notEqual(a, b);
  await assert.rejects(service.storeMemory('agent', 'bad', new Array(768).fill(Number.NaN)), /finite numeric/);
  console.log('Vector memory contract checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });