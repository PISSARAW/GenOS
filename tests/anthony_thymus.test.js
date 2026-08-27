import assert from 'node:assert';
import { AnthonyOrchestrator } from '../scripts/anthony_orchestrator.mjs';

function runTests() {
    const anthony = new AnthonyOrchestrator();
    
    const validCode = "function sum(a, b) { return a + b; }";
    
    const mutated = anthony.thymusSaboteur(validCode);
    
    assert.ok(mutated.includes('MUTATION_INJECTED'), "Should report mutation injection");
    assert.ok(mutated.includes('function sum(a, b) { return a - b; }'), "Should flip '+' to '-'");
    
    console.log("✅ Thymus Saboteur tests passed!");
}

runTests();
