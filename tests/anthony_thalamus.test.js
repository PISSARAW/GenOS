import assert from 'node:assert';
import { AnthonyOrchestrator } from '../scripts/anthony_orchestrator.mjs';

function runTests() {
    const anthony = new AnthonyOrchestrator();
    
    const logs = [
        "info: agent is thinking...",
        "info: executing step 1",
        "warning: deprecated function used",
        "debug: payload is {a: 1}",
        "critical: database connection lost",
        "delta: state changed from 0 to 1"
    ];

    const filtered = anthony.thalamicFilter(logs);
    
    assert.strictEqual(filtered.length, 3, "Should only keep 3 critical/delta logs");
    assert.ok(filtered[0].includes('warning'), "Should keep warning");
    assert.ok(filtered[1].includes('critical'), "Should keep critical error");
    assert.ok(filtered[2].includes('delta'), "Should keep state delta");
    
    console.log("✅ Thalamic Filtering tests passed!");
}

runTests();
