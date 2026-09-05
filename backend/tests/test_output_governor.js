const { enforceOutputContract } = require('../src/services/outputGovernor.js');

/**
 * Test unitaire pour l'Output Governor
 * Vérifie la capacité de l'exonucléase à amputer les préambules et postambules conversationnels.
 */
function testOutputGovernorCleavage() {
    const rawText = "Voici le texte révisé comme demandé :\n\n# Mon Article\nDu contenu passionnant.\n\nN'hésitez pas si vous avez des questions !";
    
    // Le texte final attendu sans l'incontinence verbale
    const expectedOutput = "# Mon Article\nDu contenu passionnant.";
    
    try {
        const result = enforceOutputContract(rawText, { format: 'markdown', stripPreamble: true, stripPostamble: true });
        
        if (result === expectedOutput) {
            console.log("✅ testOutputGovernorCleavage : PASS (Le texte a été correctement décapité)");
        } else {
            console.error("❌ testOutputGovernorCleavage : FAIL");
            console.error("Attendu :\n", expectedOutput);
            console.error("Obtenu :\n", result);
            process.exit(1);
        }
    } catch (error) {
        console.error("❌ Erreur durant le test :", error.message);
        process.exit(1);
    }
}

// Exécution du test
testOutputGovernorCleavage();
