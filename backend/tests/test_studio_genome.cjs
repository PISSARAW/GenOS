'use strict';
const assert = require('node:assert/strict');
const { withFixture, writeRefusals, seedGenome } = require('./helpers/studioGenosFixture.cjs');
const { request } = require('./helpers/studioRequest.cjs');

async function probe(spec) {
  const model = await seedGenome(spec);
  const base = '/api/studio/genomes/studio-source-genome';
  const read = await request(spec, base);
  assert.equal(read.status, 200);
  assert.equal(read.value.genome.contentHash, model.contentHash);
  assert.ok(read.value.sections.some(section => section.name === 'META'));
  assert.ok(read.value.sections.some(section => section.name === 'GENE'));
  assert.equal(read.value.functionalEffectMeasured, false);
  assert.equal((await request(spec, base, { project: 'b06-other' })).status, 404);
  const body = { contentHash: model.contentHash, rate: 0.2, seed: 'studio-d03' };
  assert.equal((await request(spec, base + '/mutate', { body: { ...body, rate: 2 } })).status, 400);
  assert.equal((await request(spec, base + '/mutate', { body: { ...body, seed: '../outside' } })).status, 400);
  assert.equal((await request(spec, base + '/mutate', { body: { ...body, contentHash: 'a'.repeat(64) } })).status, 409);
  const mutated = await request(spec, base + '/mutate', { body, timeoutMs: 20000 });
  assert.equal(mutated.status, 200, JSON.stringify(mutated.value));
  assert.equal(mutated.value.status, 'candidate');
  assert.equal(mutated.value.promotionGranted, false);
  const candidate = await request(spec, '/api/studio/genomes/' + mutated.value.genomeRef);
  assert.equal(candidate.value.genome.status, 'candidate');
  assert.equal((await request(spec, base)).value.genome.contentHash, model.contentHash);
  const event = await spec.db.get('SELECT * FROM genome_events WHERE id = ?', mutated.value.eventId);
  assert.equal(event.event_type, 'MUTATION');
  assert.deepEqual(JSON.parse(event.parent_genome_refs), ['studio-source-genome']);
  assert.equal(JSON.parse(event.payload_json).sourceHash, model.contentHash);
  assert.equal((await request(spec, '/api/studio/genomes')).value.genomes.length, 2);
  assert.equal((await request(spec, base + '/mutate', { body, project: 'b06-other' })).status, 404);
  await writeRefusals(spec, base + '/mutate');
  console.log('Studio genome: scoped sections, native mutation, candidate/event persisted, source unchanged and authority/version refusals passed.');
}
withFixture(probe).catch(error => { console.error(error); process.exitCode = 1; });
