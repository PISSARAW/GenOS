const assert = require('assert');
const { commandOptions } = require('./src/services/codexRuntimeConfiguration');

assert.deepStrictEqual(commandOptions({}, {}), []);
assert.deepStrictEqual(
  commandOptions({}, { GENOS_CODEX_MODEL: 'gpt-5.6-terra', GENOS_CODEX_REASONING_EFFORT: 'medium' }),
  ['--model', 'gpt-5.6-terra', '-c', 'model_reasoning_effort="medium"']
);
assert.deepStrictEqual(
  commandOptions({ codexModel: 'gpt-5.6-sol', codexReasoningEffort: 'high' }, { GENOS_CODEX_MODEL: 'ignored' }),
  ['--model', 'gpt-5.6-sol', '-c', 'model_reasoning_effort="high"']
);
assert.throws(() => commandOptions({}, { GENOS_CODEX_REASONING_EFFORT: 'unbounded' }), /Unsupported Codex reasoning effort/);
console.log('Agent Codex configuration checks passed.');
