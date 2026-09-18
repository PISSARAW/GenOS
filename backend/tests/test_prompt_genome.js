const assert = require('node:assert/strict');
const genome = require('../src/services/promptGenomeService');

const base = genome.createGenome('Solve the assigned task.', { role: 'reviewer' });
const next = genome.mutate(base, { enhancers: ['focus_security'], evidenceRefs: ['proof-1'] });
assert.equal(next.baseHash, base.baseHash);
assert.match(genome.render(next), /ENHANCER:focus_security/);
assert.match(genome.render(next), /EVIDENCE_REF:proof-1/);
console.log('Prompt genome checks passed.');
