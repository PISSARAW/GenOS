import assert from 'node:assert';
import { existsSync, rmSync } from 'node:fs';
import { AnthonyOrchestrator } from '../scripts/anthony_orchestrator.mjs';

function runTests() {
    const anthony = new AnthonyOrchestrator();
    
    const history = ["tried approach A, failed", "tried approach B, success"];
    const result = anthony.hippocampalConsolidate(history);
    
    assert.ok(result.includes('Memory consolidated'), "Should return consolidation message");
    
    // Extract file path from result
    const filePathMatch = result.match(/to: (.*)/);
    assert.ok(filePathMatch && filePathMatch[1], "Should contain file path");
    const filePath = filePathMatch[1];
    
    assert.ok(existsSync(filePath), "Consolidated memory file should exist");
    
    // Cleanup
    rmSync(filePath);
    
    console.log("✅ Hippocampal Consolidation tests passed!");
}

runTests();
