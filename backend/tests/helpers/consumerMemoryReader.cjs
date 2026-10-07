'use strict';

const { getDatabase, closeDatabase } = require('../../src/db');
const memory = require('../../src/services/vectorMemoryService');
const prompt = require('../../src/services/agentMemoryContext');

async function main() {
  const input = JSON.parse(process.argv[2]);
  const db = await getDatabase(input.filename);
  try {
    const options = { organizationId: 'consumer-org', projectId: 'consumer-project',
      ownerId: input.ownerId || 'consumer-memory-agent', limit: 30, peekVesicles: true };
    const result = await memory.searchMemory('consumer qualification provenance', options, db);
    const records = result.allScoredExperiences.filter(item => input.ids.includes(item.id));
    const links = await db.all('SELECT id, evidence_status, provenance_record_id, provenance_hash FROM genome_decisions WHERE id IN (?, ?)', ...input.ids);
    const injected = await prompt.formatCognitiveMemoryPrompt(options.ownerId,
      'consumer qualification provenance', options);
    process.stdout.write(`CONSUMER_MEMORY_RESULT=${JSON.stringify({ records, links, injected })}\n`);
  } finally {
    await closeDatabase();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
