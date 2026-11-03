'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const protocol = require('./config.cjs');
const ROOT = 'D:/GenOS-runs/identity-llm-engine';
const EXE = path.join(ROOT, 'cuda-b12047/llama-server.exe');
const STATE = path.join(ROOT, 'engine.json');
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function processInfo(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) throw Error('ENGINE_PID_INVALID');
  const script = `Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}' | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress`;
  const raw = execFileSync('powershell.exe', ['-NoProfile','-Command',script], { encoding: 'utf8', windowsHide: true }).trim();
  return raw ? JSON.parse(raw) : null;
}

async function stop() {
  if (!fs.existsSync(STATE)) return;
  const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  const actual = await completeProcessInfo(state.pid);
  if (!actual) return;
  if (path.resolve(actual.ExecutablePath).toLowerCase() !== path.resolve(EXE).toLowerCase()
    || !actual.CommandLine.includes('--port 18081') || !actual.CommandLine.includes('--alias ' + protocol.modelAlias + ' ')) {
    throw Error('ENGINE_PROCESS_OWNERSHIP_UNVERIFIED');
  }
  process.kill(state.pid);
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!processInfo(state.pid)) return;
    await pause(200);
  }
  throw Error('ENGINE_FAILED_TO_STOP');
}

async function completeProcessInfo(pid) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const actual = processInfo(pid);
    if (!actual || (actual.ExecutablePath && actual.CommandLine)) return actual;
    await pause(200);
  }
  throw Error('ENGINE_PROCESS_METADATA_UNAVAILABLE');
}

function launch() {
  const label = new Date().toISOString().replace(/[:.]/g, '-');
  const stdout = path.join(ROOT, `${protocol.modelAlias}-cold-${label}.stdout.log`);
  const stderr = path.join(ROOT, `${protocol.modelAlias}-cold-${label}.stderr.log`);
  const outFd = fs.openSync(stdout, 'wx');
  const errFd = fs.openSync(stderr, 'wx');
  const args = ['-m',protocol.modelBlob,'--host','127.0.0.1','--port','18081','-ngl','99',
    '-c','8192','-np','2','--alias',protocol.modelAlias,'--jinja','--reasoning-format','deepseek',
    '--reasoning-budget',String(protocol.reasoningBudget),'--flash-attn','on','--offline'];
  const child = spawn(EXE, args, { cwd: path.dirname(EXE), windowsHide: true, stdio: ['ignore',outFd,errFd] });
  fs.closeSync(outFd);
  fs.closeSync(errFd);
  child.unref();
  return { pid: child.pid, exe: EXE, model: protocol.modelBlob, modelSha256: protocol.modelSha256,
    args, stdout, stderr, offline: true, endpoint: protocol.endpoint, reasoningBudget: protocol.reasoningBudget };
}

async function waitReady(state) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(protocol.endpoint + '/health', { signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        const models = await (await fetch(protocol.endpoint + '/v1/models')).json();
        if (models.data[0].id !== protocol.modelAlias) throw Error('WRONG_MODEL_SERVER');
        return;
      }
    } catch (_) { /* Loading is retained as bounded startup time, not an inference. */ }
    await pause(500);
  }
  throw Error(`ENGINE_START_TIMEOUT:${state.stderr}`);
}

async function restart() {
  await stop();
  const state = launch();
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  await waitReady(state);
  return state;
}

module.exports = { restart, stop };
