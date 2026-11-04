'use strict';

const assert = require('node:assert/strict');
const status = require('../src/services/orchestratorMissionStatus');
const polling = require('../bin/orchestratorCompletionPolling.cjs');
const tasks = require('../src/services/runtimeMissionTasks');
const agents = [{id: 'parent', status: 'completed', runtime_pid: null},
  ...[1, 2, 3].map(id => ({id: 'worker-' + id, status: 'idle', runtime_pid: null,
    latest_run_status: 'completed'}))];
const worlds = [1, 2, 3].map(id => ({agent_id: 'worker-' + id, status: 'compared'}));

async function main() {
  assert.equal(status.missionExecutionTerminal(agents, worlds, 'parent'), true);
  for (const state of ['candidate', 'promoted', 'quarantined']) {
    assert.equal(status.missionExecutionTerminal(agents, worlds.map(row => ({...row, status: state})), 'parent'), true);
  }
  assert.equal(status.missionExecutionTerminal(agents, [{...worlds[0], status: 'running'}], 'parent'), false);
  assert.equal(status.missionExecutionTerminal([...agents, {id: 'live', status: 'running', runtime_pid: 123}], worlds, 'parent'), false);
  assert.equal(status.resolveFinalMissionStatus({success: false}, {allowed: true},
    {verdict: 'completed', coverage: {verdict: 'required-coverage-complete'}}).success, false);
  assert.equal(status.resolveFinalMissionStatus({success: true}, {allowed: false},
    {verdict: 'completed', coverage: {verdict: 'required-coverage-complete'}}).success, false);
  let release;
  const pending = tasks.track(new Promise(resolve => {release = resolve;}));
  assert.equal(polling.terminalReady(agents, worlds, 'parent'), false);
  release(); await pending;
  assert.equal(polling.terminalReady(agents, worlds, 'parent'), true);
  console.log('Compared Trinity worlds and idle completed workers are quiescent; active tasks and running worlds still block, and mission success remains separately gated: PASS');
}
main().catch(error => {console.error(error); process.exitCode = 1;});
