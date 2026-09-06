const { executeBioTool } = require('../src/services/mcpBioTools');
const cp = require('child_process');

async function runEndocrineTest() {
  console.log("Running endocrine test...");
  
  const args = {
    endocrine_action: "secrete",
    hormone: "adrenaline",
    amount: "high",
    swarm_id: "swarm_01"
  };

  const result = await executeBioTool('genos_biomimicry_endocrine_modulate', args);
  
  if (!result.success) {
    throw new Error("Test failed: execution was not successful");
  }

  console.log("Endocrine test passed!");
}

async function runEpigeneticTest() {
  console.log("Running epigenetic test...");
  
  const args = {
    agent_id: "griot_01",
    locus: "communication_module",
    state: "heterochromatin_facultative"
  };

  const result = await executeBioTool('genos_biomimicry_epigenetic_chromatin', args);
  
  if (!result.success) {
    throw new Error("Test failed: execution was not successful");
  }

  const output = JSON.parse(result.output);
  if (!output.developmentally_locked || !output.methylation_applied) throw new Error("Test failed: chromatin lock was not applied");

  console.log("Epigenetic test passed!");
}

async function runAllTests() {
  try {
    await runEndocrineTest();
    await runEpigeneticTest();
    console.log("All tests passed.");
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

runAllTests();
