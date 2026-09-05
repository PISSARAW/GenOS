const { executeBioTool } = require('../src/services/mcpBioTools');
const cp = require('child_process');

function runEndocrineTest() {
  console.log("Running endocrine test...");
  
  const originalExecSync = cp.execSync;
  let executedCommand = "";
  
  cp.execSync = (cmd) => {
    executedCommand = cmd;
    return Buffer.from("Success");
  };

  const args = {
    endocrine_action: "secrete",
    hormone: "adrenaline",
    amount: "high",
    swarm_id: "swarm_01"
  };

  const result = executeBioTool('genos_biomimicry_endocrine_modulate', args);
  
  if (!result.success) {
    throw new Error("Test failed: execution was not successful");
  }

  const expectedSuffix = 'biomimicry bio-feature --feature endocrine --action modulate --param endocrine_action="secrete" --param swarm_id="swarm_01" --param hormone="adrenaline" --param amount="high"';
  
  if (!executedCommand.endsWith(expectedSuffix)) {
    throw new Error(`Test failed. Expected command ending in:\n${expectedSuffix}\nGot:\n${executedCommand}`);
  }

  console.log("Endocrine test passed!");
  cp.execSync = originalExecSync;
}

function runEpigeneticTest() {
  console.log("Running epigenetic test...");
  
  const originalExecSync = cp.execSync;
  let executedCommand = "";
  
  cp.execSync = (cmd) => {
    executedCommand = cmd;
    return Buffer.from("Success");
  };

  const args = {
    agent_id: "griot_01",
    locus: "communication_module",
    state: "methylated"
  };

  const result = executeBioTool('genos_biomimicry_epigenetic_chromatin', args);
  
  if (!result.success) {
    throw new Error("Test failed: execution was not successful");
  }

  const expectedSuffix = 'biomimicry epigenetic-chromatin --agent-id griot_01 --locus "communication_module" --state methylated';
  
  if (!executedCommand.endsWith(expectedSuffix)) {
    throw new Error(`Test failed. Expected command ending in:\n${expectedSuffix}\nGot:\n${executedCommand}`);
  }

  console.log("Epigenetic test passed!");
  cp.execSync = originalExecSync;
}

function runAllTests() {
  try {
    runEndocrineTest();
    runEpigeneticTest();
    console.log("All tests passed.");
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

runAllTests();
