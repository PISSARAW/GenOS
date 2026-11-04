'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {decodeEvents} = require('../../src/services/runtimeProtocol');

async function qualify(ctx, report) {
  const reference = report.delegatedOracleRefs[0];
  const plan = {synthesisOnly: true, completedWorkerIds: ['worker'], completedWorkerDossiers: [{
    workerId: 'worker', events: [{executionRunId: reference.runId, nativeOracleRef: reference.reference,
      evidenceReport: report}]}]};
  const canonical = require('../../src/services/deterministicFinalReportService').compile(plan);
  const state = {mission: {agentId: 'parent'}, autonomyPlan: plan, eventCount: 0};
  const preparation = require('../../src/services/localRuntimeCanonicalEvaluation').prepare;
  const checked = preparation(state, JSON.stringify(canonical));
  assert.equal(checked.nativeVerification, 'required_in_trusted_parent');
  const changed = structuredClone(canonical); changed.claims[0].statement = 'An invented result';
  assert.throws(() => preparation(state, JSON.stringify(changed)), {code: 'CANONICAL_REPORT_BINDING_MISMATCH'});
  const workspace = ctx.normalizedMission.workspaceRoot;
  const filename = path.join(path.dirname(workspace), 'canonical-public-input.json');
  const deniedDatabase = path.join(path.dirname(workspace), 'child-must-not-open.sqlite');
  fs.writeFileSync(filename, JSON.stringify({state, reply: JSON.stringify(canonical)}));
  const env = require('../../src/services/agentProcessOutcome').buildRuntimeEnvironment({}, workspace, false);
  Object.assign(env, {GENOS_DB_PATH: deniedDatabase, GENOS_DB_BOOTSTRAP_SKIP: '1', GENOS_DISABLE_DOTENV: '1'});
  assert.equal(env.GENOS_EPISTEMIC_RECEIPT_SECRET, undefined);
  const child = spawnSync(process.execPath, [path.join(__dirname, 'canonicalRuntimeProbe.cjs'), filename],
    {env, timeout: 30000, windowsHide: true});
  assert.equal(child.status, 0, child.stderr.toString());
  const events = []; decodeEvents(child.stdout, event => events.push(event));
  const marker = events.find(event => event.eventType === 'DOSSIER_INFLUENCE_VERIFIED');
  assert.deepEqual(JSON.parse(marker.payloadJson).workerIds, ['worker']);
  assert.equal(fs.existsSync(deniedDatabase), false, 'The sandboxed runtime does not open privileged verification storage.');
  return checked;
}

module.exports = {qualify};
