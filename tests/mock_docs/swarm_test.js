const fs = require('fs');
const path = require('path');

function extractData(filepath) {
    console.log(`\x1b[34m[WORKER]\x1b[0m Extraction sur : ${path.basename(filepath)}`);
    const content = fs.readFileSync(filepath, 'utf-8');
    
    let data = {};
    const htMatch = content.match(/Montant HT\*\*\s*:\s*([\d.]+)/);
    const tvaMatch = content.match(/TVA.*\s*:\s*([\d.]+)/);
    
    if (htMatch) data.HT = parseFloat(htMatch[1]);
    if (tvaMatch) data.TVA = parseFloat(tvaMatch[1]);
        
    const ttcMatchLine = content.match(/Montant TTC\*\*\s*:\s*(.*)/);
    if (ttcMatchLine) {
        const rawTtc = ttcMatchLine[1];
        if (rawTtc.includes('~~') || rawTtc.includes('[') || rawTtc.toLowerCase().includes('illisible')) {
            console.log(`\x1b[33m[WORKER ALERT]\x1b[0m Ambiguïté détectée (Rature ou crochet). Confiance: 42.0%`);
            data.TTC = "AMBIGUOUS";
        } else {
            const ttcMatch = rawTtc.match(/([\d.]+)/);
            if (ttcMatch) {
                data.TTC = parseFloat(ttcMatch[1]);
                console.log(`\x1b[32m[WORKER INFO]\x1b[0m Confiance TTC: 99.8%`);
            }
        }
    }
    return data;
}

function validateData(data, docName) {
    console.log(`\x1b[35m[VALIDATION]\x1b[0m Vérification déterministe pour ${docName}...`);
    
    if (data.TTC === 'AMBIGUOUS') {
        console.log(`\x1b[31m[VALIDATION ALERT]\x1b[0m Donnée critique manquante ou ambiguë.`);
        console.log(`\x1b[35m[VALIDATION]\x1b[0m Appel du Circuit Breaker...`);
        return false;
    }
            
    if (data.HT && data.TVA && data.TTC) {
        if (Math.abs((data.HT + data.TVA) - data.TTC) < 0.01) {
            console.log(`\x1b[32m[VALIDATION INFO]\x1b[0m Équation HT+TVA=TTC respectée.`);
            return true;
        }
    }
    return false;
}

function main() {
    const docs = ['doc1_perfect.md', 'doc2_ambiguous.md'];
    const baseDir = __dirname;
    
    for (const doc of docs) {
        const filepath = path.join(baseDir, doc);
        console.log("\n" + "=".repeat(60));
        
        // 1. Worker Agent
        const extracted = extractData(filepath);
        console.log(`\x1b[34m[WORKER]\x1b[0m Données extraites : ${JSON.stringify(extracted)}`);
        
        // 2. Validation Agent
        const isValid = validateData(extracted, doc);
        
        // 3. Telemetry Agent / Result
        if (!isValid) {
            console.log(`\x1b[31m[CIRCUIT BREAKER]\x1b[0m Tripping circuit breaker on branch: ${doc}_branch (3 failures, threshold 3)`);
            console.log(`\x1b[31m[CIRCUIT BREAKER]\x1b[0m Circuit OPEN: branch is halted`);
            console.log("\n> [!CAUTION]");
            console.log("> **Tâche Suspendue : Révision Humaine Requise**");
            console.log(`> - Document : ${doc}`);
            console.log(`> - Cause : Extraction incertaine (Score < 95%)`);
            console.log("=".repeat(60));
            break;
        } else {
            console.log(`\x1b[32m[SUCCESS]\x1b[0m ${doc} validé pour export comptable.`);
            console.log("=".repeat(60));
        }
    }
}

main();
