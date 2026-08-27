const { executeConfiguredTransport } = require('./backend/src/services/mcpExecutor.js');
async function test() {
  const result = await executeConfiguredTransport({ toolName: 'genos_biomimicry_sar_prime', args: { incident_id: '123' } });
  console.log(result);
}
test();
