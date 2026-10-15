'use strict';

const assert = require('node:assert/strict');
const { executionMission } = require('../src/services/aTeam/execution/teamEvidenceService');

const criterion = 'Chaque worker connait les deux autres workers.';
const prompt = executionMission({ mission: 'Inspect peer identity.' }, [criterion]);

assert.match(prompt, /copy each evaluated criterion string exactly/);
assert.match(prompt, /Do not translate, summarize or paraphrase/);
assert.ok(prompt.includes(JSON.stringify(criterion)));
console.log('A-Team mission prompt preserves canonical acceptance criteria.');
