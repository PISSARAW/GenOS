'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {
  compileQualityContract,
  createElevationSession,
  executeElevationLoop
} = require('../../backend/src/services/qualityElevation/qualityElevationService');
const { evaluateContent } = require('../../backend/src/services/qualityElevation/qualityEvaluatorRegistry');

const OLLAMA_HOST = '127.0.0.1';
const OLLAMA_PORT = 11434;
const OLLAMA_MODEL = 'llama3.1:8b';

function callOllama(prompt, systemPrompt = '') {
  return new Promise((resolve, reject) => {
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const body = JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      stream: false,
      options: {
        temperature: 0.7,
        num_predict: 1500
      }
    });

    const req = http.request({
      hostname: OLLAMA_HOST,
      port: OLLAMA_PORT,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.message?.content || '');
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function runWritingMission() {
  console.log('================================================================');
  console.log('  GENOS QUALITY ELEVATION LOOP (GQEL) — MISSION SCÉNARIO RÉEL  ');
  console.log(`  Modèle utilisé : Ollama (${OLLAMA_MODEL})                     `);
  console.log('================================================================\n');

  const missionBrief = `
Tu es un auteur et dramaturge de fiction.
Rédige le scénario d'un court-métrage dramatique intitulé "Le Dernier Sas".
Dans une station orbitale de recherche, le sas de dépressurisation principal est endommagé.
Deux officiers, Alain et Vera, sont confrontés à une fuite de pathogène et doivent décider
qui se sacrifie pour fermer manuellement le sas de l'extérieur.
`.trim();

  const contract = compileQualityContract({
    domain: 'creative_writing',
    policy: 'balanced',
    minQualityScore: 80,
    mission: missionBrief
  });

  const session = createElevationSession(contract);
  console.log(`[GQEL] Contrat compilé : ${contract.contractId}`);
  console.log(`[GQEL] Politique : ${contract.policy} (Seuil minimal : ${contract.minQualityScore}/100, Max itérations : ${contract.maxIterations})\n`);

  let currentPrompt = contract.mission;

  const generator = async ({ iteration, prompt }) => {
    console.log(`--- [GQEL] Génération V${iteration} en cours par ${OLLAMA_MODEL}... ---`);
    const systemPrompt = iteration === 1
      ? 'Tu es un scénariste. Réponds directement en fournissant le texte créatif en français.'
      : 'Tu es un scénariste appliquant une révision corrective causale. Réponds en respectant scrupuleusement les consignes de correction en français.';

    const output = await callOllama(prompt, systemPrompt);
    console.log(`[GQEL] V${iteration} généré (${output.length} caractères).\n`);
    return output;
  };

  const elevationResult = await executeElevationLoop({
    contract,
    session,
    generator
  });

  console.log('================================================================');
  console.log('               RÉSULTAT DE LA MISSION GQEL                      ');
  console.log('================================================================');
  console.log(`Statut final        : ${elevationResult.finalStatus.toUpperCase()}`);
  console.log(`Promu               : ${elevationResult.promoted}`);
  console.log(`Total itérations    : ${elevationResult.totalIterations}`);
  console.log(`Gain qualitatif     : +${elevationResult.demonstratedGain} points`);
  console.log(`Score V1            : ${elevationResult.session.versions[0]?.score}/100`);
  console.log(`Score Best (V${elevationResult.bestVersion?.version})    : ${elevationResult.bestVersion?.score}/100\n`);

  for (const v of elevationResult.session.versions) {
    console.log(`[Version V${v.version}] Score: ${v.score}/100 | Défauts restants: ${v.defects.length}`);
    for (const d of v.defects) {
      console.log(`  - [${d.severity.toUpperCase()}] ${d.code} (${d.section}): ${d.message}`);
    }
  }

  const outPath = path.join(__dirname, 'scenario_gqel_execution_report.json');
  fs.writeFileSync(outPath, JSON.stringify(elevationResult, null, 2), 'utf8');
  console.log(`\nRapport d'exécution complet persisté dans : ${outPath}`);

  return elevationResult;
}

if (require.main === module) {
  runWritingMission().catch(err => {
    console.error('Erreur mission :', err);
    process.exit(1);
  });
}

module.exports = { runWritingMission };
