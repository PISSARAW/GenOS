const assert = require('node:assert/strict');
const genome = require('../src/services/promptGenomeService');
const microRna = require('../src/services/microRnaPromptService');

const base = genome.createGenome('Review safely.');
const regulated = microRna.regulatePrompt(base, [microRna.createMicroRna('web_foraging', 'suppress', { threshold: 0.5 })], { state: { web_foraging: 0.9 } });
assert.deepEqual(regulated.repressors, ['web_foraging']);
console.log('MicroRNA prompt regulation checks passed.');
