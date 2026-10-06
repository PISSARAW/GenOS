'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { validateProgram, digest } = require('./nceProcedureProgram');

function executePureProcedure(request, signal) {
  const payload = JSON.stringify({ program: validateProgram(request.program), input: request.input });
  if (Buffer.byteLength(payload) > 131072) throw new Error('NCE request exceeds worker limit');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve(__dirname, '../../bin/nce-procedure-worker.cjs')], {
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, signal,
      env: { SystemRoot: process.env.SystemRoot || 'C:\\Windows' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; if (stdout.length > 131072) child.kill(); });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(0, 4096); });
    child.stdin.on('error', reject);
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`NCE worker failed (${code}): ${stderr}`));
      try { resolve({ output: JSON.parse(stdout), exitCode: code, programHash: digest(request.program) }); }
      catch (error) { reject(error); }
    });
    child.stdin.end(payload);
  });
}

async function runProcedureAgent(ctx) {
  const { agent, environment, signal } = ctx;
  if (environment.artifactPath !== 'solution.json') throw new Error('NCE worker requires solution.json');
  const inputPath = path.join(environment.workspacePath, 'input.json');
  const inputStat = await fs.lstat(inputPath);
  if (!inputStat.isFile() || inputStat.size > 131072) throw new Error('Invalid NCE input file');
  const input = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  const outcome = await executePureProcedure({ program: agent.procedure, input }, signal);
  signal.throwIfAborted();
  await fs.writeFile(path.join(environment.workspacePath, 'solution.json'), JSON.stringify(outcome.output), { flag: 'wx' });
  return { terminated: true, eventType: 'AGENT_COMPLETED', source: 'native-process',
    exitCode: outcome.exitCode, programHash: outcome.programHash };
}

async function executeLearnedProcedure(db, input) {
  const state = await require('./phenotypicDevelopmentService').loadPhenotypeState(null, db, input.agentId);
  if (!state?.learnedProcedure) throw new Error('No learned NCE procedure for this agent');
  const programHash = digest(state.learnedProcedure);
  const proof = state.nceReceipts?.find((receipt) => receipt.promoted
    && digest(receipt.procedure) === programHash);
  if (!proof) throw new Error('Learned NCE procedure has no promotion evidence');
  const result = await require('./operationDeadline').withDeadline({ timeoutMs: input.timeoutMs ?? 5000 },
    (signal) => executePureProcedure({ program: state.learnedProcedure, input: input.values }, signal));
  return { ...result, agentId: input.agentId, learnedFrom: proof.evidenceRef };
}

module.exports = { executePureProcedure, runProcedureAgent, executeLearnedProcedure };
