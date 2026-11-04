'use strict';
const c = require('./common.cjs');
const checker = require('./checker.cjs');

function executeOracle(file, caseId) {
  const started = performance.now();
  const result = c.cp.spawnSync(process.execPath, ['--max-old-space-size=64',
    c.path.join(__dirname, 'checker.cjs'), file, caseId],
  { encoding: 'utf8', timeout: c.CONFIG.oracleDeadlineMs, windowsHide: true });
  let score = null;
  try { score = JSON.parse(result.stdout); } catch (_) { score = null; }
  return { command: [process.execPath, '--max-old-space-size=64',
    c.path.join(__dirname, 'checker.cjs'), file, caseId], exitCode: result.status,
  stdout: result.stdout, stderr: result.stderr, error: result.error?.message || null,
  wallMs: performance.now() - started, score };
}

function prepareWorkspace(directory, task) {
  const workspace = c.inside(directory, 'workspace');
  c.fs.mkdirSync(workspace);
  c.fs.writeFileSync(c.path.join(workspace, 'module.js'), task.original);
  const checkerFile = c.path.join(__dirname, 'checker.cjs').replaceAll('\\', '/');
  const check = `'use strict';\nconst checker=require(${JSON.stringify(checkerFile)});\n`
    + `const result=checker.evaluate(require('path').join(__dirname,'module.js'),${JSON.stringify(task.id)},true);\n`
    + 'console.log(JSON.stringify(result));process.exitCode=result.allPassed?0:1;\n';
  c.fs.writeFileSync(c.path.join(workspace, 'check.cjs'), check);
  return workspace;
}

function requestBody(genome, task, run) {
  const expression = c.service('workerGenomeExpression');
  const genes = c.service('agentDna').workerGenes(genome);
  const taskText = `Repair module.js to satisfy this specification:\n${task.specification}\n\n`
    + `Current module.js:\n${task.original}\n`
    + 'Return only one JSON object with exactly format, patches, tests and evidence. '
    + 'Use format genos.file-replacement/v1, one patch {"path":"module.js","content":"complete source code"}, '
    + 'tests ["node check.cjs"], and a short evidence string. Keep the CommonJS export. '
    + 'Use pure JavaScript only: no host APIs, imports, dynamic code, timers or external dependencies. '
    + 'There is no opportunity for another generation attempt.';
  const mission = expression.apply({ prompt: taskText, toolLease: [...genes.tools] }, genes);
  const format = c.service('localCodeWorkerService').proposalResponseFormat({
    allowedCommands: ['node check.cjs'], allowedPatchPaths: ['module.js'],
    requiredPatchPaths: ['module.js'], forceFullFileReplacement: true });
  const sampling = expression.samplingOptions(mission);
  c.assert.equal(Buffer.byteLength(mission.prompt) < 4000, true, 'Prompt byte ceiling');
  return { model: c.CONFIG.model, stream: false, keep_alive: '20m',
    messages: [{ role: 'user', content: mission.prompt }], format: format.schema,
    options: { temperature: sampling.temperature, top_p: sampling.topP,
      seed: run.seed, num_ctx: c.CONFIG.contextTokens, num_predict: c.CONFIG.outputTokens } };
}

async function applyCandidate(context) {
  const { directory, workspace, response, task } = context;
  const service = c.service('localCodeWorkerService');
  const proposal = service.parseProposal(response.message.content, {}, { forceFullFileReplacement: true });
  service.assertAllowedPatchPaths(proposal, ['module.js']);
  c.assert.equal(proposal.patches.length, 1);
  c.assert.deepEqual(proposal.tests, ['node check.cjs']);
  const code = proposal.patches[0].content;
  checker.assertPure(code);
  const candidate = c.path.join(directory, 'candidate.js');
  c.fs.writeFileSync(candidate, code, { flag: 'wx' });
  const result = await service.executeProposal({ workspaceRoot: workspace,
    text: response.message.content, allowedCommands: ['node check.cjs'],
    requiredPatchPaths: ['module.js'], allowedPatchPaths: ['module.js'],
    mission: { forceFullFileReplacement: true } });
  c.write(c.path.join(directory, 'executor.json'), result);
  const oracle = executeOracle(candidate, task.id);
  c.write(c.path.join(directory, 'oracle.json'), oracle);
  return { admitted: true, executorPassed: result.testStatus === 'passed',
    rolledBack: result.rolledBack || false, signedWorkerReceipt: result.testExecutionReceipt,
    oracle, candidateSha256: c.fileHash(candidate),
    finalWorkspaceSha256: c.fileHash(c.path.join(workspace, 'module.js')) };
}
module.exports = { executeOracle, prepareWorkspace, requestBody, applyCandidate };
