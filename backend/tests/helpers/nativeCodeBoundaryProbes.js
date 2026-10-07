'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const source = require('../../src/services/epistemic/codeArtifactSource');
const journal = require('../../src/services/epistemic/nativeOracleJournal');

async function inputRefusal(db, context, probe) {
  const { dispatch } = require('../test_native_code_completion');
  const method = structuredClone(context.method);
  Object.assign(method.parameters, probe.parameters);
  const refused = await dispatch(db, method);
  assert.equal(refused.result.success, false, JSON.stringify(refused));
  assert.equal(refused.row, undefined);
  assert.match(refused.result.supervision.error.message, probe.reason);
  const reservations = await db.get("SELECT count(*) AS count FROM gvx_development_events WHERE payload_json LIKE '%native_oracle_reservation%'");
  assert.equal(reservations.count, 0);
  console.log('Invalid code method refused before run creation:', refused.result.supervision.error.message);
}

function inputCases() {
  const probes = {
    traversal: { parameters: { artifactPath: '../outside.gexpr' }, reason: /unsafe path segment/ },
    dot: { parameters: { artifactPath: 'src/../answer.gexpr' }, reason: /unsafe path segment/ },
    ads: { parameters: { artifactPath: 'src/answer.gexpr:secret' }, reason: /CODE_ORACLE_PATH_INVALID/ },
    absolute: { parameters: { artifactPath: 'C:/outside.gexpr' }, reason: /relative to its workspace/ },
    suppliedTests: { parameters: { tests: ['always-pass'] }, reason: /CODE_ORACLE_INPUT_INVALID/ }
  };
  return Object.fromEntries(Object.entries(probes).map(([name, probe]) => [name, (db, context) => inputRefusal(db, context, probe)]));
}

async function wrongHash(db, context) {
  const wrong = structuredClone(context.method);
  wrong.parameters.expectedContentHash = '0'.repeat(64);
  const checked = await require('../test_native_code_completion').dispatch(db, wrong);
  assert.equal(checked.result.success, false);
  assert.equal(checked.row.status, 'failed');
  const failure = await db.get("SELECT payload_json FROM telemetry_events WHERE agent_id=? AND event_type='AGENT_FAILED' ORDER BY id DESC LIMIT 1", checked.request.agentId);
  assert.equal(JSON.parse(failure.payload_json).failure.code, 'CODE_ORACLE_CONTENT_HASH_MISMATCH');
  assert.equal(await journal.read(db, { ...checked.request, kind: 'reservation' }), null);
  console.log('Wrong code hash refused before oracle allocation.');
}

async function links(db, context) {
  const outside = path.join(context.root, 'outside');
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'answer.gexpr'), 'a % b');
  await fs.symlink(outside, path.join(context.workspace, 'src/linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const linked = structuredClone(context.method);
  linked.parameters.artifactPath = 'src/linked/answer.gexpr';
  await assert.rejects(source.load({ workspaceRoot: context.workspace, method: linked }), /symbolic link/);
  console.log('Symlink source refuses external reads.');
}

async function budget(db, context) {
  const contracts = require('../../src/services/strategyContractService');
  const saved = await contracts.getLatestContract(db, 'delegation-root');
  const tighter = structuredClone(saved.contract);
  tighter.promotion.native_verification.executions = 1;
  await contracts.saveContract(db, { agentId: 'delegation-root', workspaceId: 'delegation-ws', contract: tighter });
  const checked = await require('../test_native_code_completion').dispatch(db, context.method);
  assert.equal(checked.result.success, false);
  assert.equal(await journal.read(db, { ...checked.request, kind: 'reservation' }), null);
  assert.equal(await journal.read(db, { ...checked.request, kind: 'attestation' }), null);
  console.log('An insufficient code verification budget starts no oracle allocation.');
}

module.exports = { inputCases, wrongHash, links, budget };
