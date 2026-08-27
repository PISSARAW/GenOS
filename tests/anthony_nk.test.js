import assert from 'node:assert';
import { AnthonyOrchestrator } from '../scripts/anthony_orchestrator.mjs';

function runTests() {
    const anthony = new AnthonyOrchestrator();
    
    // Test 1: Vacuous test
    const badCode = `
        const items = [];
        assert.ok(items.every(x => x.isValid()));
    `;
    const badResult = anthony.naturalKillerScan(badCode);
    assert.ok(badResult.includes('APOPTOSIS'), "Should trigger apoptosis on vacuous test");
    
    // Test 2: Valid test
    const goodCode = `
        const items = getItems();
        assert.ok(items.length > 0);
        assert.ok(items[0].isValid);
    `;
    const goodResult = anthony.naturalKillerScan(goodCode);
    assert.ok(goodResult.includes('PASS'), "Should pass valid tests");
    
    console.log("✅ NK Cell tests passed!");
}

runTests();
