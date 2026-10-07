'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { parseCommandLine } = require('../src/services/genosCliEnv');
const { parseArgs } = require('../src/services/mcpExecutor/config');
const { executeSolver } = require('../src/services/arenaSolvers');
const { probeBioFeature } = require('../src/services/mcpBioTools/featureProbe');

function verifyParsers() {
  const quoted = String.raw`tool "C:\work dir\file.js" 'two words' tail`;
  const expected = ['tool', String.raw`C:\work dir\file.js`, 'two words', 'tail'];
  assert.deepEqual(parseCommandLine(quoted), expected);
  assert.deepEqual(parseArgs(quoted), expected);
  assert.deepEqual(parseCommandLine(String.raw`one\ two`), ['one two']);
  assert.deepEqual(parseArgs(String.raw`one\ two`), ['one\\', 'two']);
  assert.deepEqual(parseCommandLine('one\ttwo\nthree'), ['one', 'two', 'three']);
  assert.deepEqual(parseArgs('one\ttwo'), ['one', 'two']);
  assert.throws(() => parseCommandLine('"unterminated'), /Unterminated quote/);
  assert.deepEqual(parseArgs('"unterminated'), ['unterminated']);
  assert.deepEqual(parseArgs(null), []);
}

function verifySearches() {
  const values = [1, 3, 5, 7, 9];
  for (const solver of ['react_solver', 'beam_solver', 'genetic_solver', 'mcts_solver', 'reflexion_solver']) {
    assert.equal(executeSolver(solver, values, 7).index, 3);
    assert.equal(executeSolver(solver, values, 8).index, -1);
    assert.equal(executeSolver(solver, [], 1).index, -1);
  }
  assert.equal(executeSolver('react_solver', values, 7).steps, 4);
  assert.equal(executeSolver('genetic_solver', values, 9).steps, 1);
  assert.equal(executeSolver('reflexion_solver', values, 5).trace[0].phase, 'Verification');
  assert.equal(executeSolver('unknown', values, 7).index, 3);
  assert.equal(executeSolver('__proto__', values, 7).index, 3);
}

function verifyFeatureProbe() {
  assert.deepEqual(probeBioFeature(undefined, 'probe'), {
    cliOutput: null, cliFailed: false, cliErrorText: null
  });
  assert.equal(probeBioFeature(() => Buffer.from('measured'), 'probe').cliOutput, 'measured');
  const failure = probeBioFeature(() => { throw new Error('CLI unavailable'); }, 'probe');
  assert.equal(failure.cliFailed, true);
  assert.equal(failure.cliErrorText, 'CLI unavailable');
  assert.equal(failure.cliOutput, null);
}

async function verifyCliArguments() {
  const url = pathToFileURL(path.resolve(__dirname, '../../mcp/argumentValidation.js'));
  const { validateCliArguments } = await import(url.href);
  assert.equal(validateCliArguments('genos_snapshot', { agent: 'agent.json', out: 'snap.json' }), null);
  assert.equal(validateCliArguments('genos_replay', { snapshot_id: 'snapshot.json' }), null);
  assert.match(validateCliArguments('genos_replay', {}), /must be provided/);
  assert.match(validateCliArguments('genos_snapshot', { agent: 'agent.json' }), /out/);
  assert.match(validateCliArguments('genos_snapshot', { agent: '../agent.json', out: 'snap.json' }), /parent/);
  assert.match(validateCliArguments('genos_snapshot', { agent: 'C:/agent.json', out: 'snap.json' }), /relative/);
  assert.match(validateCliArguments('genos_replay', []), /JSON object/);
}

async function run() {
  verifyParsers();
  verifySearches();
  verifyFeatureProbe();
  await verifyCliArguments();
  console.log('Historical quality refactor boundaries passed.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
