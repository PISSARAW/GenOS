const { executeConfiguredTransport } = require('./src/services/mcpExecutor');
const assert = require('assert');

async function runTests() {
  console.log("Testing Biological MCP execution...");

  const res1 = await executeConfiguredTransport({
    toolName: 'genos_resilience_cryptobiosis',
    args: { agent_id: 'griot-001', duration: 10 }
  });
  console.log('Cryptobiosis result:', res1.status);

  const res2 = await executeConfiguredTransport({
    toolName: 'genos_biomimicry_cellular_bbb',
    args: { agent_id: 'griot-001', filter_level: 'strict' }
  });
  console.log('BBB result:', res2.status);

  console.log("All mocked bio MCP tests completed.");
}

runTests().catch(console.error);
