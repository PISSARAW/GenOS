const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../src/services/agentEvolutionService.js'), 'utf8');
assert.match(source, /fitnessStatus: Number\.isFinite\(Number\(options\.validatedFitness\)\) \? 'validated' : 'unvalidated'/);
assert.match(source, /const validatedScore = Number\.isFinite\(Number\(options\.validatedFitness\)\)/);
assert.doesNotMatch(source, /Number\(\(\(options\.predictedFitness \|\| 80\) \/ 100\)\.toFixed\(2\)\)/);
console.log('Lineage scores require validated fitness.');