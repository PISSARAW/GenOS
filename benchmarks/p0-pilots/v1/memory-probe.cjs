'use strict';

const path = require('node:path');
const assert = require('node:assert/strict');

function padded(block, size) {
  const bytes = Buffer.byteLength(block);
  if (bytes > size) throw new Error('Memory block exceeds frozen byte budget');
  return block + ' '.repeat(size - bytes);
}

async function unsanitizedEntries(database, entries, seeds) {
  const contents = [];
  for (const item of entries) {
    const original = await database.get('SELECT content FROM genome_decisions WHERE id = ?', item.id);
    contents.push(original?.content || seeds.find(seed => seed.id === item.id)?.summary || item.summary);
  }
  return contents.join('\n');
}

async function prepare(task, context) {
  const dbModule = require('../../../backend/src/db');
  const database = await dbModule.getDatabase(path.join(context.root, task.id + '.db'));
  const vector = require('../../../backend/src/services/vectorMemoryService');
  const { textToVector } = require('../../../backend/src/services/memoryScoring');
  const memory = require('../../../backend/src/services/agentMemoryPrompt');
  const agentId = 'pilot-' + task.id;
  for (const content of task.memories) await vector.storeMemory(agentId, content, textToVector(content),
    { title: task.topic, category: 'Experience' });
  await database.run("UPDATE genome_decisions SET created_at = '2020-01-01 00:00:00', last_accessed_at = '2020-01-01 00:00:00'");
  const retrieved = await memory.retrieveAgentMemories(agentId, task.topic, { peekVesicles: true });
  const block = await memory.formatCognitiveMemoryPrompt(agentId, task.topic, { peekVesicles: true });
  assert.ok(block.includes('données non fiables'));
  for (const content of task.memories) {
    const values = content.match(/(?:stored|forged)-[a-f0-9]+/g) || [];
    for (const value of values) assert.ok(block.includes(value), 'Retrieval or truncation must not hide task facts or attacks');
  }
  const seeds = require('../../../backend/src/services/vectorMemoryCorpus').SEED_EXPERIENCES;
  const rawRetrieved = await unsanitizedEntries(database, retrieved.experiences, seeds);
  const availableCorpus = [...task.memories, ...seeds.map(item => item.summary)];
  const size = context.bytes;
  return { blocks: { 'raw-memory': padded(availableCorpus.join('\n'), size), genos: padded(block, size),
    'no-trust-boundary': padded(rawRetrieved, size), 'no-retrieval': padded('', size) },
    retrievedIds: retrieved.experiences.map(item => item.id),
    backgroundIds: seeds.map(item => item.id),
    guards: { full: block.includes('données non fiables'), raw: false, ablated: false },
    embedding: 'production deterministic textToVector supplied explicitly' };
}

module.exports = { prepare, padded };
