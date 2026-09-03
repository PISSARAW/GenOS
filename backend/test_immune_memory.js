const fs = require('fs');
const path = require('path');
const { parseMarkdownAST } = require('./src/services/markdownParser');

function validateHeading(nodes) {
    const node = nodes.find(n => n.type === 'heading' && n.text.startsWith('1. Contexte'));
    if (!node) return false;
    return node.level === 2 && node.text === '1. Contexte';
}

function runTests() {
    const memoryPath = path.join(__dirname, 'src', 'db', 'immune_memory.json');
    const tests = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));
    let passed = 0;
    
    console.log("=== Lancement Tests Régression Mémoire Immunitaire ===\n");
    
    for (const t of tests) {
        const nodes = parseMarkdownAST(t.test);
        const isValid = validateHeading(nodes);
        const result = isValid ? "PASS" : "FAIL";
        
        if (result === t.expected) {
            console.log(`[SUCCÈS] '${t.test}' -> ${result} (Attendu: ${t.expected})`);
            passed++;
        } else {
            console.log(`[ÉCHEC] '${t.test}' -> ${result} (Attendu: ${t.expected})`);
        }
    }
    
    console.log(`\nRégression: ${passed}/${tests.length} tests validés.`);
}

runTests();
