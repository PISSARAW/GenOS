'use strict';

const assert = require('node:assert/strict');
const { artifactInstruction } = require('../src/services/agents/workerArtifactInstructions');

const cases = [
  { name: 'generic dossier', contract: { evidence: { requiredArtifacts: ['dossier'] }, identity: {} } },
  { name: 'recovery worker', contract: { evidence: { requiredArtifacts: ['dossier'] }, identity: { workerKind: 'recovery_worker' } } },
  { name: 'specialist', contract: { evidence: { requiredArtifacts: ['dossier'] }, identity: { workerKind: 'specialist' }, mission: { specialtyNiche: 'biome:resource_steward' } } },
  { name: 'rhizome', contract: { evidence: { requiredArtifacts: ['dossier'] }, identity: {}, mission: { objective: 'Rhizome discovery branch' } } }
];

for (const entry of cases) {
  const prompt = artifactInstruction(entry.contract);
  assert.match(prompt, /"uncertainties":\[\]/, `${entry.name} success schema must show the required empty uncertainties array`);
}

process.stdout.write('Worker artifact prompts align with the provider response schema: PASS\n');
