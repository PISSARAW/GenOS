const assert = require('assert');

const mcpGenomeTools = require('../src/services/mcpGenomeTools');
const { validateToolArguments } = require('../src/services/mcpArgumentValidation');
const registry = require('../src/services/mcpToolRegistry');

async function run() {
  assert.ok(mcpGenomeTools.isGenomeTool('genos_genome_cross'));
  assert.ok(registry.isSupportedTool('genos_genome_mutate'));
  assert.equal(registry.detectExecutionKind('genos_genome_clone'), 'cli');

  assert.ok(validateToolArguments('genos_genome_mutate', { input: 'C:\\x\\a.dna' }), 'missing out must be rejected');
  assert.equal(validateToolArguments('genos_genome_mutate', { input: 'C:\\x\\a.dna', out: 'C:\\y\\b.dna', rate: 0.2 }), null);

  let captured = null;
  const fakeRun = (command) => {
    captured = command;
    return { configured: true, success: true, status: 'completed', transport: 'local', output: '{}' };
  };
  const result = await mcpGenomeTools.executeGenomeTool(
    'genos_genome_cross',
    { parent_a: 'a.dna', parent_b: 'b.dna', out: 'c.dna', swap_prob: 0.5 },
    fakeRun
  );
  assert.equal(result.success, true);
  assert.ok(captured.includes('genos genome cross'));
  assert.ok(captured.includes('--swap-prob 0.5'));

  const missing = await mcpGenomeTools.executeGenomeTool('genos_genome_cross', { parent_a: 'a.dna' }, fakeRun);
  assert.equal(missing.status, 'invalid_args');

  console.log('Genome MCP tool checks passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
