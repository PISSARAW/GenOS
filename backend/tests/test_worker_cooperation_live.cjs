'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const ORDER = ['resident_daemon', 'specialist', 'verifier_worker', 'recovery_worker'];
let calls = 0;
let abstain = false;
let mode = 'success';
let observationAttempts = 0;
const requestKinds = [];

function shouldRecover(prompt) {
  return mode === 'recoverOnce' && prompt.includes('Stage: observation.') && observationAttempts++ === 0;
}

function plannedResponse(prompt) {
  const input = JSON.parse(prompt.split('PLANNER_INPUT_JSON\n')[1]);
  assert.ok(input.finding.receiptId && input.finding.oracleHash);
  assert.ok(input.finding.sourceRefs.length >= 2);
  const repair = input.finding.observation.anomaly;
  const steps = ORDER.slice(1).map((kind, i) => ({ kind,
    dependsOn: [i ? ORDER[i] : 'finding'], goal: `Apply ${kind} to the supplied allocation.` }));
  if (mode === 'invalidPlan') [steps[0], steps[1]] = [steps[1], steps[0]];
  return { findingRunId: input.finding.runId, decision: repair ? 'repair' : 'stop', steps: repair ? steps : [] };
}

function reply(prompt) {
  if (prompt.includes('PLANNER_INPUT_JSON\n')) {
    requestKinds.push('planning');
    assert.equal(requestKinds.at(-2), 'observation', 'Planner must run after daemon observation.');
    return plannedResponse(prompt);
  }
  requestKinds.push(prompt.match(/Stage: (\w+)\./)?.[1] || 'unknown');
  const recoverable = shouldRecover(prompt);
  if (abstain || recoverable) return { schema: 'genos.daemon-allocation-observation/v1',
    outcome: 'unresolved', observation: null, uncertainties: ['Controlled abstention.'] };
  const refs = [...new Set(prompt.match(/sha256:[a-f0-9]{64}/g))];
  const base = { outcome: 'success', uncertainties: [] };
  if (prompt.includes('Stage: verification.')) return { ...base,
    claims: [{ statement: '{"sum":17,"target":17,"accepted":true}', evidence: refs }],
    workerArtifact: { type: 'verification_report', content: { testedClaim: 'candidate sums to target',
      verificationMethod: 'independent arithmetic', verdict: 'accept', reproductionSteps: ['9+8=17'], evidence: refs },
    provenance: { sourceRefs: refs } } };
  if (prompt.includes('Stage: candidate.')) return { ...base,
    claims: [{ statement: '{"indices":[1,4],"sum":17}', evidence: refs }],
    specialtyAssessment: { niche: 'resource_allocation', inScope: true, evidence: refs } };
  assert.ok(prompt.includes('Stage: observation.'));
  const observed = mode === 'healthy' ? { observedSum: 17, target: 17, anomaly: false }
    : { observedSum: mode === 'falsePositive' ? 27 : 13, target: 17, anomaly: true };
  return { ...base, schema: 'genos.daemon-allocation-observation/v1', observation: observed, evidence: refs,
    territoryReport: { territoryId: 'allocation.json', observedAt: new Date().toISOString(), sourceRefs: refs } };
}

function serverForFixture() {
  return http.createServer((request, response) => {
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      response.setHeader('content-type', 'application/json');
      if (request.url === '/api/tags') return response.end(JSON.stringify({ models: [{ name: 'qwen2.5-coder:7b' }] }));
      calls++;
      const payload = JSON.parse(body);
      const prompt = payload.messages.map(item => item.content).join('\n');
      if (!prompt.includes('PLANNER_INPUT_JSON\n') && prompt.includes('Stage: observation.')) {
        assert.equal(payload.format.oneOf[0].properties.schema.const, 'genos.daemon-allocation-observation/v1');
        assert.equal(payload.format.oneOf[0].properties.observation.properties.anomaly.const, undefined);
        assert.ok(!prompt.includes('first and only claim statement'));
      }
      response.end(JSON.stringify({ model: 'qwen2.5-coder:7b',
        message: { role: 'assistant', content: JSON.stringify(reply(prompt)) },
        done: true, prompt_eval_count: 100, eval_count: 40 }) + '\n');
    });
  });
}

async function runCase(parent, name) {
  const config = path.join(parent, `${name}.json`);
  const directory = path.join(parent, name);
  await fs.writeFile(config, JSON.stringify({ root: directory, model: 'ollama://qwen2.5-coder:7b',
    scenario: ['healthy', 'falsePositive'].includes(name) ? 'healthy' : 'incorrect' }));
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve(__dirname, '../bin/qualify-worker-cooperation-live.cjs'), config],
      { env: { ...process.env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const collect = chunk => { output = (output + chunk).slice(-32768); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const timer = setTimeout(() => { child.kill(); }, 15 * 60000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); resolve({ code, output }); });
  });
  await fs.writeFile(path.join(parent, `${name}.log`), result.output);
  const report = JSON.parse(await fs.readFile(path.join(directory, 'report.json'), 'utf8'));
  console.log(`Controlled case ${name}: ${JSON.stringify({ qualified: report.qualified, error: report.error,
    coverage: report.coverage?.checks, stages: report.stages.length })}`);
  assert.equal(result.code, report.qualified ? 0 : 1, result.output);
  return report;
}

async function main() {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-cooperation-live-test-'));
  const server = serverForFixture();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  process.env.GENOS_OLLAMA_ENDPOINT = `http://127.0.0.1:${server.address().port}/api/chat`;
  try {
    const report = await runCase(parent, 'success');
    assert.equal(report.qualified, true, JSON.stringify({ error: report.error, shutdown: report.shutdownError,
      events: report.failureEvents, resources: report.resources }));
    assert.equal(report.genosMissionQualified, true);
    assert.ok(report.nativeCompletion?.dossierDigest);
    assert.equal(report.nativeController.body, true);
    assert.equal(report.coverage.satisfied, true);
    assert.deepEqual(report.stages.map(stage => stage.kind), ORDER);
    assert.ok(report.stages.every(stage => stage.receipt.result.verified));
    assert.ok(report.stages.every(stage => stage.receipt.semanticVerification.costs.processes === 2));
    assert.equal(new Set(report.stages.map(stage => stage.workerId)).size, 4);
    assert.ok(Date.parse(report.controllerAuthority.checkedAt) < Date.parse(report.controllerAuthority.expiresAt));
    assert.equal(report.resources.modelTokens, 560);
    assert.equal(calls, 4);
    assert.deepEqual(requestKinds, ['observation', 'planning', 'candidate', 'verification']);
    assert.equal(report.finding.runId, report.stages[0].runId);
    assert.equal(report.acceptedPlan.findingRunId, report.finding.runId);
    assert.deepEqual(JSON.parse(report.stages[0].report.claims[0].statement),
      JSON.parse(report.stages[0].report.fullText).observation);
    if (process.argv.includes('--success-only')) return;
    mode = 'healthy';
    const healthy = await runCase(parent, 'healthy');
    assert.equal(healthy.qualified, true, JSON.stringify(healthy.error));
    assert.equal(healthy.responseDecision, 'stop');
    assert.equal(healthy.stages.length, 1);
    assert.equal(healthy.resources.modelTokens, 280);
    mode = 'falsePositive';
    const falsePositive = await runCase(parent, 'falsePositive');
    assert.equal(falsePositive.qualified, false);
    assert.equal(falsePositive.stages.length, 1);
    assert.equal(falsePositive.planningAttempted, undefined);
    assert.ok(falsePositive.resources.modelTokens >= 140);
    assert.match(falsePositive.error.message, /ORACLE_ASSEMBLY_NOT_ACCEPTED/);
    assert.equal(falsePositive.stages[0].receipt.oracleExecution.costs.processes, 2);
    mode = 'invalidPlan';
    const refused = await runCase(parent, 'invalidPlan');
    assert.equal(refused.qualified, false);
    assert.equal(refused.stages.length, 1);
    assert.equal(refused.resources.modelTokens, 280);
    assert.match(refused.error.message, /Future|prerequisite/);
    assert.equal(report.recovery.sourceUnchanged, true);
    assert.equal(report.promoted, false);
    mode = 'recoverOnce';
    const recovered = await runCase(parent, 'recoverOnce');
    assert.equal(recovered.qualified, true, JSON.stringify(recovered.error));
    assert.ok(recovered.stages[0].recoveryTransitions.length > 0);
    assert.ok(recovered.resources.providerAttempts.filter(item => item.provider_called).length >= 5);
    assert.ok(recovered.resources.attempts.some(item => item.status !== 'completed'));
    abstain = true;
    const failed = await runCase(parent, 'abstention');
    assert.equal(failed.qualified, false);
    assert.equal(failed.stages.length, 1, JSON.stringify(failed.error));
    assert.equal(failed.planningAttempted, undefined);
    assert.equal(failed.resources.planningTokens, 0);
    assert.match(failed.error.message, /insufficient|substantiate|unresolved/i);
    assert.equal(failed.shutdown.stopped, true);
    assert.ok(failed.resources.attempts.every(run => run.status !== 'running'));
    const raw = JSON.stringify(failed);
    assert.ok(!raw.includes('SQLITE_MISUSE'));
    assert.ok(failed.resources.workerTokens >= 140);
  } finally {
    await new Promise(resolve => server.close(resolve));
    assert.equal(path.dirname(parent), path.resolve(os.tmpdir()));
    assert.ok(path.basename(parent).startsWith('genos-cooperation-live-test-'));
    await fs.rm(parent, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  console.log('Live cooperation pilot: controlled transport fixture, native semantic oracles, recovery and abstention shutdown PASS (no real LLM qualification).');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
