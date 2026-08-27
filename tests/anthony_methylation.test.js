import assert from 'node:assert';
import { AnthonyOrchestrator } from '../scripts/anthony_orchestrator.mjs';

function runTests() {
    const anthony = new AnthonyOrchestrator();
    
    const truth = "Expected JSON Result";
    const methylated = anthony.methylateTruth(truth);
    
    assert.ok(methylated.methylated_id.startsWith('METHYL_'), "Should tag with METHYL_ prefix");
    assert.strictEqual(methylated.original_data, truth, "Should preserve original data");
    assert.strictEqual(methylated.is_immutable_truth, true, "Should flag as immutable truth");
    
    console.log("✅ Methylation tests passed!");
}

runTests();
