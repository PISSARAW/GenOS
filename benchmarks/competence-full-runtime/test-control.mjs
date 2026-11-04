import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {cases, score, candidateRules, accountedUsage} from './control.mjs';
import './run.mjs';

const require = createRequire(import.meta.url);
const programs = require('./programs.cjs');
const data = cases();
const measured = {provider_called: 1, status: 'completed', input_tokens: 5, output_tokens: 6,
  token_usage_source: 'provider'};
assert.equal(accountedUsage([measured]), true);
assert.equal(accountedUsage([]), false);
assert.equal(accountedUsage([measured, {provider_called: 0, status: 'started'}]), false);
assert.equal(accountedUsage([{...measured, output_tokens: null}]), false);
const rendering = require('./prompt.cjs');
const displayedRows = rendering.publicSamples(data.context).split('\n').flatMap(line =>
  JSON.parse(line.split('samples [x,y]: ')[1]));
assert.equal(displayedRows.length, data.context.observations.length, 'Grouping preserves every public row.');
assert.equal(data.context.requested.length, 8);
assert.equal(data.queries.length, 12);
assert.equal(data.context.learnedRules.length, 0);
assert.equal(data.context.rules, undefined);
assert.equal(programs.admit({rules: data.rules.map(rule => ({...rule, confidence: 1, reason: 'answerable'})),
  observations: data.context.observations}).accepted.length, 6);
const rows = score(data, {rules: data.rules.map(rule => ({...rule, confidence: 1, reason: 'answerable'}))});
assert.equal(rows.filter(row => row.correct).length, 12);
assert.equal(rows.filter(row => row.query.unknown).length, 2);
assert.equal(score(data, {rules: []}).filter(row => row.correct).length, 2,
  'The control cannot pass by abstaining on every problem.');
const records = ['first', 'second'].map(id => ({run: {id, agent_id: 'same-worker'},
  reports: [{fullText: JSON.stringify({functionPrograms: {rules: []}})}], oracle: {status: 'refused'}}));
assert.equal(candidateRules({records, identity: {agentId: 'root'}}, []).declarations.length, 1,
  'Recovery attempts remain in exports but do not create additional worker identities.');
console.log('Executable module imports and separate induction/ignorance control assignment: PASS');
