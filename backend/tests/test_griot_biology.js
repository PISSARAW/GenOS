const { executeConfiguredTransport } = require('../src/services/mcpExecutor');
const assert = require('assert');

async function runTests() {
  console.log("=== Testing Biological MCP Execution with Live Rust Engine ===");

  // 1. Cryptobiosis
  const res1 = await executeConfiguredTransport({
    toolName: 'genos_resilience_cryptobiosis',
    args: { agent_id: 'griot-001', duration: 10 }
  });
  console.log('1. Cryptobiosis result:', res1.status, res1.success);
  assert.strictEqual(res1.success, true);

  // 2. Cellular BBB
  const res2 = await executeConfiguredTransport({
    toolName: 'genos_biomimicry_cellular_bbb',
    args: { agent_id: 'griot-001', filter_level: 'strict' }
  });
  console.log('2. BBB result:', res2.status, res2.success);
  assert.strictEqual(res2.success, true);

  // 3. Spore Formation & Dormancy
  const resSpore = await executeConfiguredTransport({
    toolName: 'genos_biomimicry_spore',
    args: { action: 'create', agent_id: 'griot-spore-01', spore_type: 'bacterial' }
  });
  console.log('3. Spore Create result:', resSpore.status, resSpore.success);
  assert.strictEqual(resSpore.success, true);
  assert.ok(resSpore.output.includes('BacterialEndospore'));

  // 4. Spore Germination
  const resGerm = await executeConfiguredTransport({
    toolName: 'genos_biomimicry_spore',
    args: { action: 'germinate', agent_id: 'griot-spore-01', spore_type: 'bacterial', warm_and_wet: true, nutrients: true }
  });
  console.log('4. Spore Germinate result:', resGerm.status, resGerm.success);
  assert.strictEqual(resGerm.success, true);
  assert.ok(resGerm.output.includes('Bacterial Vegetative Cell'));

  // 5. Bioluminescence
  const resBioLum = await executeConfiguredTransport({
    toolName: 'genos_biomimicry_bioluminescence',
    args: { agent_id: 'griot-lum-01', color: 'blue', organelle: 'cilia', event_type: 'MCP_DISPATCH', details: 'Signal broadcast' }
  });
  console.log('5. Bioluminescence result:', resBioLum.status, resBioLum.success);
  assert.strictEqual(resBioLum.success, true);

  // 6. Anti-Collusion Audit (Zahavi Costly Signaling)
  const resAntiGood = await executeConfiguredTransport({
    toolName: 'genos_biomimicry_anti_collusion',
    args: { agent_id: 'griot-auditor', consumed_tokens: 650, physical_test_passed: true }
  });
  console.log('6. Anti-Collusion (Valid) result:', resAntiGood.status, resAntiGood.success);
  assert.strictEqual(resAntiGood.success, true);

  // 7. Anti-Collusion Audit (Fraud Detection on Cheap Signal)
  const resAntiCheap = await executeConfiguredTransport({
    toolName: 'genos_biomimicry_anti_collusion',
    args: { agent_id: 'griot-lazy', consumed_tokens: 40, physical_test_passed: true }
  });
  console.log('7. Anti-Collusion (Cheap Signal Rejection) result:', resAntiCheap.status);
  assert.ok(resAntiCheap.output.includes('SIGNAL TROMPEUR'));

  // 8. Redundancy (Codon Degeneracy Tolerant Tool Execution)
  const resRed = await executeConfiguredTransport({
    toolName: 'genos_biomimicry_redundancy',
    args: { expected_tool: 'git_commit', mutated_tool: 'git_comit', fallback: false }
  });
  console.log('8. Redundancy Codon result:', resRed.status, resRed.success);
  assert.strictEqual(resRed.success, true);
  assert.ok(resRed.output.includes('"silent_mutation": true'));

  // 9. Tissue Formation & Delegation
  const resTissue = await executeConfiguredTransport({
    toolName: 'genos_biomimicry_tissue',
    args: { action: 'create', name: 'Neural_Ganglion', role: 'Decision_Engine' }
  });
  console.log('9. Tissue Create result:', resTissue.status, resTissue.success);
  assert.strictEqual(resTissue.success, true);

  // 10. Embryology Zygote Cleavage
  const resEmbryo = await executeConfiguredTransport({
    toolName: 'genos_biomimicry_embryology',
    args: { divisions: 2, gradient: 1.0 }
  });
  console.log('10. Embryology Cleave result:', resEmbryo.status, resEmbryo.success);
  assert.strictEqual(resEmbryo.success, true);

  console.log("\n✅ ALL 10 BIOLOGICAL MCP TOOLS VERIFIED SUCCESSFULLY AGAINST RUST ENGINE!");
}

runTests().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
