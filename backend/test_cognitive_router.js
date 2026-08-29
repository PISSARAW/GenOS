const router = require('./src/services/modelRouter');

async function runTests() {
  console.log('🧪 Lancement des tests du Routeur Cognitif...\n');
  const complexities = ['low', 'medium', 'high'];
  
  for (const comp of complexities) {
    try {
      console.log(`Demande de tâche de complexité : [${comp.toUpperCase()}]`);
      const result = await router.generate({
        prompt: 'Say exactly "OK"',
        complexity: comp,
        timeoutMs: 120000 
      });
      console.log(`✅ Modèle sélectionné : ${result.model}`);
      console.log(`   Réponse : ${result.text.trim()}\n`);
    } catch (e) {
      console.error(`❌ Erreur pour ${comp} : ${e.message}\n`);
    }
  }
}

runTests();
