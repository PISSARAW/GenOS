'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { digest, validatedOutput } = require('./autogen-evidence.cjs');

async function runCase(testCase) {
  if (!['lpt-schedule', 'subset-sum'].includes(testCase.id)) {
    return { status: 'unavailable', reason: 'AutoGen adapter covers LPT and subset sum only.' };
  }
  const python = process.env.GENOS_RIVAL_PYTHON;
  if (!python) return { status: 'unavailable', reason: 'GENOS_RIVAL_PYTHON is required.' };
  return outcomeFor(invokeAutoGen(python, testCase), testCase);
}

function invokeAutoGen(python, testCase) {
  return spawnSync(python, [path.join(__dirname, 'autogen-rival.py')], {
    input: JSON.stringify({ id: testCase.id, parameters: testCase.methodContract.parameters }),
    encoding: 'utf8', windowsHide: true,
    timeout: 180000, maxBuffer: 1024 * 1024
  });
}

function outcomeFor(child, testCase) {
  if (child.error || child.status !== 0) {
    return { status: 'failed', reason: String(child.error?.message || child.stderr || 'AutoGen exited unsuccessfully.').slice(0, 500) };
  }
  let response;
  try { response = JSON.parse(child.stdout); } catch (_) { return { status: 'failed', reason: 'AutoGen adapter returned invalid JSON.' }; }
  if (typeof response.rawOutput !== 'string') return { status: 'failed', reason: 'AutoGen supplied no text output.' };
  return responseOutcome(response, testCase);
}

function responseOutcome(response, testCase) {
  let output;
  try { output = validatedOutput(testCase, response.rawOutput); } catch (_) {
    return { status: 'failed', reason: 'AutoGen answer is not JSON.', rawOutput: response.rawOutput.slice(0, 2000) };
  }
  if (!output) return { status: 'failed', reason: 'AutoGen answer lacks a valid witness.' };
  return { status: 'executed', result: { output }, receipt: { id: digest(response.rawOutput) },
    provenance: { agentFramework: 'autogen-agentchat', rawOutput: response.rawOutput,
      model: response.model, frameworkVersion: response.frameworkVersion } };
}

module.exports = { runCase };
