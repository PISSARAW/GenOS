import assert from 'node:assert';
import { AnthonyOrchestrator } from '../scripts/anthony_orchestrator.mjs';

function runTests() {
    const anthony = new AnthonyOrchestrator();
    
    const errorLog = `Error: Cannot read properties of undefined (reading 'length')
    at processArray (file.js:12:34)
    at runTask (file.js:45:10)
    at Object.<anonymous> (file.js:100:2)
    at Module._compile (node:internal/modules/cjs/loader:1254:14)
    at Module._extensions..js (node:internal/modules/cjs/loader:1308:10)`;

    const signature = anthony.immuneKeyCompress(errorLog);
    
    assert.ok(signature.includes('[ImmuneSignature:'), "Should format as an immune signature");
    assert.ok(signature.includes('Cannot read properties of undefined'), "Should retain the core error message");
    assert.ok(signature.length < 100, "Should be highly compressed compared to the original stack trace");
    
    console.log("✅ Immune Key Compression tests passed!");
}

runTests();
