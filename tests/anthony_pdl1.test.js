import assert from 'node:assert';
import { AnthonyOrchestrator } from '../scripts/anthony_orchestrator.mjs';

function runTests() {
    const anthony = new AnthonyOrchestrator();
    
    const badCode = `
        function readDatabase() {
            // Lazy optimization
            return 42;
        }
    `;
    const badResult = anthony.pdl1BlockerScan(badCode);
    assert.ok(badResult.includes('REJECTED'), "Should reject hardcoded 'return 42'");
    
    const goodCode = `
        function readDatabase() {
            const db = connect();
            return db.query("SELECT * FROM table");
        }
    `;
    const goodResult = anthony.pdl1BlockerScan(goodCode);
    assert.ok(goodResult.includes('PASS'), "Should pass valid logic without mocks");
    
    console.log("✅ PD-L1 Blocker tests passed!");
}

runTests();
