const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { checkChromatinLock, execute } = require('../src/services/mcpExecutor');

async function runTests() {
  console.log('--- Testing Chromatin Locking Enforcement ---');

  const testAgentId = 'test-chromatin-agent-001';
  const chromatinDir = path.resolve(__dirname, '../../.genos/chromatin');
  fs.mkdirSync(chromatinDir, { recursive: true });
  const chromatinFile = path.join(chromatinDir, `${testAgentId}.json`);

  try {
    const genomeData = {
      genes: {
        'genos_synaptic_prune_scale': {
          locus: 'genos_synaptic_prune_scale',
          chromatin_state: 'HeterochromatinFacultative',
          developmentally_locked: true,
          is_methylated: true
        },
        'genos_active_sensing': {
          locus: 'genos_active_sensing',
          chromatin_state: 'Euchromatin',
          developmentally_locked: false,
          is_methylated: false
        }
      }
    };
    fs.writeFileSync(chromatinFile, JSON.stringify(genomeData, null, 2));

    const lockResult = checkChromatinLock(testAgentId, 'genos_synaptic_prune_scale');
    assert.ok(lockResult, 'checkChromatinLock should detect locked gene');
    assert.strictEqual(lockResult.locked, true);
    assert.strictEqual(lockResult.reason, 'Tool locked in heterochromatin');

    const openResult = checkChromatinLock(testAgentId, 'genos_active_sensing');
    assert.strictEqual(openResult, null, 'Euchromatin gene must not be locked');

    const execResult = await execute({
      agentId: testAgentId,
      toolName: 'genos_synaptic_prune_scale',
      args: { threshold: 0.2 }
    });
    assert.strictEqual(execResult.success, false, 'Execution of locked tool must fail');
    assert.strictEqual(execResult.status, 'deny');
    assert.strictEqual(execResult.reason, 'Tool locked in heterochromatin');

    console.log('✓ All Chromatin Locking Enforcement tests passed!');
  } finally {
    if (fs.existsSync(chromatinFile)) {
      fs.unlinkSync(chromatinFile);
    }
  }
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
