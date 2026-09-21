#!/usr/bin/env node
'use strict';
const solarTools = require('./solar-tool-runtime.cjs');
const { loadNousCredentials } = require('./solarDirectContext.cjs');

async function main() {
  const mission = JSON.parse(process.argv[2] || '{}');
  const prompt = mission.prompt || mission.task || mission.currentTask || 'Aucune tâche.';
  const credentials = loadNousCredentials();
  console.error('=== SOLAR DIRECT RUNTIME ===');
  console.error('Model:', process.env.GENOS_SOLAR_MODEL || 'solar-pro4:free');
  console.error('Credentials found:', !!credentials?.accessToken);
  console.error('Token length:', credentials?.accessToken?.length || 0);
  
  // Bon, on va directement appeller Solar sans passer par le framework complet
  const response = await solarTools.callSolar({
    request: {
      model: process.env.GENOS_SOLAR_MODEL || 'solar-pro4:free',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.5
    },
    state: {
      executionBudget: { tokens: 4000, latencyMs: 300000 },
      startedAt: Date.now(),
      tokensUsed: 0,
      usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
      abortController: new AbortController()
    }
  });
  
  console.log('RESPONSE:', JSON.stringify(response));
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});