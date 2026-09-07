const assert = require('node:assert/strict');
const { catalogProviders, configuredProviderRows } = require('../src/controllers/platformController');

const previousKey = process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY = 'test-only';
const catalog = catalogProviders();
assert(catalog.some((provider) => provider.provider === 'openai' && provider.model === (process.env.OPENAI_MODEL || 'gpt-4o-mini')));
assert(configuredProviderRows(catalog).some((provider) => provider.provider === 'openai'));
if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
else process.env.OPENAI_API_KEY = previousKey;
console.log('Cloud catalog profiles are available when credentials are configured.');