const assert = require('node:assert/strict');
const dns = require('node:dns').promises;

const originalLookup = dns.lookup;
dns.lookup = async () => [{ address: '10.0.0.5', family: 4 }];

const { generate } = require('../src/services/modelProvider');

(async () => {
  await assert.rejects(
    () => generate({ model: 'openai-compatible://test-model', prompt: 'ping', endpoint: 'https://rebind.example/v1/chat/completions' }),
    /blocked|private|reserved/i,
    'a public hostname resolving to a private address must be refused at call time'
  );
  console.log('Model provider DNS rebinding checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => { dns.lookup = originalLookup; });
