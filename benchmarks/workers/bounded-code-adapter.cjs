'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const CAMPAIGN = path.join(ROOT, 'backend/tests/run_worker_qualification_campaign.cjs');

function unavailable(reason) { return { status: 'unavailable', reason }; }

async function runBoundedCode() {
  const model = process.env.GENOS_LOCAL_MODEL;
  if (!model || !/^ollama:\/\//.test(model)) return unavailable('GENOS_LOCAL_MODEL must select an Ollama model.');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-worker-benchmark-code-'));
  try { return executeCampaign({ model, root }); }
  finally { removeRoot(root); }
}

function executeCampaign(input) {
  const reportPath = path.join(input.root, 'qualification.json');
  const env = { ...process.env, GENOS_LOCAL_MODEL: input.model,
    GENOS_COMPLIANCE_BOUNDED_CODE: '1', GENOS_ALLOW_LOCAL_CODE_WORKERS: '1',
    GENOS_COMPLIANCE_DETERMINISTIC_BOUNDED: '0', GENOS_WORKSPACE_COPY_HEADROOM_BYTES: '0' };
  const command = spawnSync(process.execPath, [CAMPAIGN, reportPath, 'bounded_worker'], {
    cwd: ROOT, env, encoding: 'utf8', timeout: 240000, maxBuffer: 16 * 1024 * 1024, windowsHide: true
  });
  if (command.error || command.status !== 0 || !fs.existsSync(reportPath)) {
    return { status: 'failed', reason: command.error?.message || command.stderr || 'Bounded code mission failed.' };
  }
  return campaignExecution(JSON.parse(fs.readFileSync(reportPath, 'utf8')));
}

function campaignExecution(report) {
  const item = report.results?.find((result) => result.kind === 'bounded_worker');
  const mission = item?.result;
  if (!item?.verified || !mission?.codeCompletion?.biologicalReceipt) {
    return { status: 'failed', reason: 'Qualified bounded code mission or biological receipt missing.' };
  }
  return { status: 'executed', result: { mission: missionBinding(mission),
    codeCompletion: mission.codeCompletion }, receipt: mission.codeCompletion.biologicalReceipt };
}

function missionBinding(mission) {
  return { runId: mission.executionRunId, workerId: mission.workerId,
    status: mission.status, terminalEvent: mission.terminalEvent };
}

function removeRoot(root) {
  const resolved = path.resolve(root);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir())
    || !path.basename(resolved).startsWith('genos-worker-benchmark-code-')) {
    throw new Error('Refusing to remove a path outside the dedicated code benchmark root.');
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

module.exports = { runBoundedCode };
