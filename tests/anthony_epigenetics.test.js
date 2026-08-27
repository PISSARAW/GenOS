import assert from 'node:assert';
import { existsSync, rmSync, readFileSync } from 'node:fs';
import { AnthonyOrchestrator } from '../scripts/anthony_orchestrator.mjs';

function runTests() {
    const anthony = new AnthonyOrchestrator();
    
    const massiveData = "{\"data\": \"massive_payload_12345\"}";
    const pointer = anthony.createEpigeneticPointer(massiveData);
    
    assert.ok(pointer.startsWith('[Pointer: file://'), "Should return a valid pointer string");
    
    // Extract file path
    const filePathMatch = pointer.match(/file:\/\/(.*)\]/);
    assert.ok(filePathMatch && filePathMatch[1], "Should extract file path");
    const filePath = filePathMatch[1];
    
    assert.ok(existsSync(filePath), "Epigenetic file should exist");
    
    // Verify content
    const content = JSON.parse(readFileSync(filePath, 'utf8'));
    assert.strictEqual(content.data, massiveData, "File content should match original data");
    
    // Cleanup
    rmSync(filePath);
    
    console.log("✅ Epigenetic Pointer tests passed!");
}

runTests();
