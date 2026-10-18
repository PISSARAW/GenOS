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
    const memories = await db.all('SELECT * FROM genome_decisions WHERE id IN (?, ?)', ...input.ids);
    const links = memories.map(({ id, evidence_status, provenance_record_id, provenance_hash }) => (
      { id, evidence_status, provenance_record_id, provenance_hash }));
    const fidelity = await Promise.all(memories.map(async item => (
      { id: item.id, ...await require('../../src/services/promotionMemoryReadGate').inspect(db, item) })));
    const injected = await prompt.formatCognitiveMemoryPrompt(options.ownerId,
      'consumer qualification provenance', options);
    process.stdout.write(`CONSUMER_MEMORY_RESULT=${JSON.stringify({ records, links, fidelity, injected })}\n`);
  } finally {
    await closeDatabase();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
