import assert from 'node:assert';
import { AnthonyOrchestrator } from '../scripts/anthony_orchestrator.mjs';

function runTests() {
    const anthony = new AnthonyOrchestrator();
    
    // Test 1: File length rule
    const longFile = Array(405).fill("line of code").join('\n');
    const result1 = anthony.p53Checkpoint('WRITE_FILE', longFile, 'ADMIN');
    assert.ok(result1.includes('ACCESS DENIED'), "Should block files over 400 lines");
    
    // Test 2: Intransigent Security rule
    const result2 = anthony.p53Checkpoint('READ_FILE', '/app/secrets/api_key.txt', 'DEFAULT');
    assert.ok(result2.includes('ACCESS DENIED'), "Should block /secrets for DEFAULT clearance");
    
    // Test 3: Valid Admin access
    const result3 = anthony.p53Checkpoint('READ_FILE', '/app/secrets/api_key.txt', 'ADMIN');
    assert.ok(result3.includes('PASS'), "Should allow /secrets for ADMIN clearance");
    
    // Test 4: Aesthetic rule
    const badUI = "<div style='background: linear-gradient(red, blue)'>Hello 🚀</div>";
    const result4 = anthony.p53Checkpoint('UPDATE_FRONTEND', badUI, 'ADMIN');
    assert.ok(result4.includes('ACCESS DENIED'), "Should block linear-gradients and emojis");
    
    const goodUI = "<div style='background: #fff; color: #333'>Hello Github</div>";
    const result5 = anthony.p53Checkpoint('UPDATE_FRONTEND', goodUI, 'DEFAULT');
    assert.ok(result5.includes('PASS'), "Should pass strict github aesthetic");
    
    console.log("✅ p53 Checkpoint tests passed!");
}

runTests();
