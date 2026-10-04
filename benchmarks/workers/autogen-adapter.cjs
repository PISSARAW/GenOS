'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { digest, parseAssignments, scheduleOutput } = require('./autogen-evidence.cjs');

async function runCase(testCase) {
  if (testCase.id !== 'lpt-schedule') return { status: 'unavailable', reason: 'AutoGen LPT adapter covers this case only.' };
  const python = process.env.GENOS_RIVAL_PYTHON;
  if (!python) return { status: 'unavailable', reason: 'GENOS_RIVAL_PYTHON is required.' };
  return outcomeFor(invokeAutoGen(python, testCase), testCase);
}

function invokeAutoGen(python, testCase) {
  return spawnSync(python, [path.join(__dirname, 'autogen-rival.py')], {
    input: JSON.stringify(testCase.methodContract.parameters), encoding: 'utf8', windowsHide: true,
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
  let parsed;
  try { parsed = parseAssignments(response.rawOutput); } catch (_) {
    return { status: 'failed', reason: 'AutoGen answer is not JSON.', rawOutput: response.rawOutput.slice(0, 2000) };
  }
  const output = scheduleOutput(parsed, testCase.methodContract.parameters);
  if (!output) return { status: 'failed', reason: 'AutoGen answer is not a complete valid assignment.' };
  return { status: 'executed', result: { output }, receipt: { id: digest(response.rawOutput) },
    provenance: { agentFramework: 'autogen-agentchat', rawOutput: response.rawOutput,
      model: response.model, frameworkVersion: response.frameworkVersion } };
}

module.exports = { runCase };
