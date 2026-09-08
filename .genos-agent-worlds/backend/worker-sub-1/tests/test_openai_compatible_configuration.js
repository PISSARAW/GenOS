const assert = require('node:assert/strict');
const modelProvider = require('../src/services/modelProvider');

const previousCompatible = process.env.GENOS_OPENAI_COMPATIBLE_ENDPOINT;
const previousEndpoint = process.env.GENOS_MODEL_ENDPOINT;
delete process.env.GENOS_OPENAI_COMPATIBLE_ENDPOINT;
delete process.env.GENOS_MODEL_ENDPOINT;
assert.throws(
  () => modelProvider.modelConfiguration('openai-compatible://model'),
  /OPENAI_COMPATIBLE_ENDPOINT/
);
if (previousCompatible === undefined) delete process.env.GENOS_OPENAI_COMPATIBLE_ENDPOINT;
else process.env.GENOS_OPENAI_COMPATIBLE_ENDPOINT = previousCompatible;
if (previousEndpoint === undefined) delete process.env.GENOS_MODEL_ENDPOINT;
else process.env.GENOS_MODEL_ENDPOINT = previousEndpoint;
console.log('OpenAI-compatible models require an explicit endpoint.');