'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const fixture = require('./helpers/memoryConsumerFixture.cjs');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-p1-memory-prompt-'));
  process.env.GENOS_DISABLE_DOTENV = '1';
  process.env.NODE_ENV = 'test';
  process.env.GENOS_ADMIN_PASSWORD = 'isolated-memory-prompt-test-only';
  process.env.GENOS_EMBEDDING_PROVIDER = 'none';
  process.env.GENOS_DB_PATH = path.join(root, 'memory.db');
  process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
  const store = require('../src/db');
  const vector = require('../src/services/vectorMemoryService');
  const original = vector.fetchCorpus;
  const trap = await fixture.embeddingTrap();
  try {
    const db = await store.getDatabase();
    const scoped = await fixture.seed(db);
    vector.fetchCorpus = async () => { throw new Error('Controlled failure of primary corpus retrieval'); };
    const prompt = await require('../src/services/agentMemoryContext').formatCognitiveMemoryPrompt('fixture', 'qualprobe', {
      organizationId: scoped.organization_id, projectId: scoped.project_id, peekVesicles: true });
    assert.ok(prompt.includes('canary-own'));
    for (const foreign of ['sibling', 'foreign', 'global']) assert.ok(!prompt.includes(`canary-${foreign}`), prompt);
  } finally {
    vector.fetchCorpus = original;
    await trap.close();
    await store.closeDatabase();
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log('Actual memory prompt fallback: project preserved under a primary-corpus fault.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
