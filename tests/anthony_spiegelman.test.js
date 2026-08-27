import assert from 'node:assert';
import { AnthonyOrchestrator } from '../scripts/anthony_orchestrator.mjs';

function runTests() {
    const anthony = new AnthonyOrchestrator();
    
    // Simulate 25 lines of old code
    const oldCode = Array(25).fill("console.log('doing complex work');").join('\n');
    
    // Spiegelman lazy optimization: agent deleted everything to return a mock
    const badNewCode = "return true;";
    
    const badResult = anthony.spiegelmanMonitor(oldCode, badNewCode);
    assert.ok(badResult.includes('APOPTOSIS'), "Should detect lazy optimization (drop in complexity)");
    
    // Valid refactor: agent optimized some lines
    const goodNewCode = Array(20).fill("console.log('doing refactored work');").join('\n');
    const goodResult = anthony.spiegelmanMonitor(oldCode, goodNewCode);
    assert.ok(goodResult.includes('PASS'), "Should allow normal refactoring");
    
    console.log("✅ Spiegelman Monitor tests passed!");
}

runTests();
