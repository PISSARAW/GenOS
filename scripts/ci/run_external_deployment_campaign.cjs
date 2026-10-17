#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const contract = require('./check_external_deployment_contract.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const NAMESPACE = 'genos-morphogenesis-parity';
const STATEFULSET = 'genos-morphogenesis';

function command(args, options = {}) {
  const result = spawnSync('kubectl', args, { cwd: ROOT, encoding: 'utf8',
    windowsHide: true, timeout: options.timeout || 120000 });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || 'kubectl failed').trim());
  return result.stdout.trim();
}

function preflight() {
  if (!contract.commandAvailable('kubectl')) return { ready: false, reason: 'kubectl_missing' };
  const context = spawnSync('kubectl', ['config', 'current-context'], {
    encoding: 'utf8', windowsHide: true, timeout: 10000 });
  if (context.status !== 0 || !context.stdout.trim()) {
    return { ready: false, reason: 'kubernetes_context_missing' };
  }
  return { ready: true, context: context.stdout.trim() };
}

function parityProgram() {
  return `const crypto=require('node:crypto');const {MorphologyRuntime}=require('./src/services/morphogenesis/runtime/morphologyRuntime');const {compileExpression}=require('./src/services/morphogenesis/graph/morphologyCompiler');const {topologyExpression}=require('./src/services/morphogenesis/expression');const input={problemSpace:['p1','p2'],requirements:['r1'],work_packages:['w1'],document:{v:1},operations:[],measurements:{productivity:1}};const dynamic=new Set(['executionId','parentExecutionId','receiptId','startedAt','completedAt','timestamp','expressionId']);function stable(v){if(Array.isArray(v))return v.map(stable);if(!v||typeof v!=='object')return v;return Object.fromEntries(Object.keys(v).sort().filter(k=>!dynamic.has(k)).map(k=>[k,stable(v[k])]))}(async()=>{const graph=compileExpression(topologyExpression('rhizome',null,{mission:'external-parity'}),{mission:'external-parity',globalBudget:{tokens:120}});const result=await new MorphologyRuntime({globalBudget:{tokens:120}}).execute(graph,input);process.stdout.write(crypto.createHash('sha256').update(JSON.stringify(stable(result.output))).digest('hex'))})().catch(e=>{console.error(e);process.exit(1)})`;
}

function podRows() {
  const data = JSON.parse(command(['get', 'pods', '-n', NAMESPACE,
    '-l', 'app=genos-morphogenesis', '-o', 'json']));
  return data.items.map((item) => ({ name: item.metadata.name, uid: item.metadata.uid,
    ready: (item.status.containerStatuses || []).every((status) => status.ready),
    imageId: item.status.containerStatuses?.[0]?.imageID || '' }));
}

function imageDigest(pods) {
  const match = pods.map((pod) => pod.imageId.match(/sha256:[0-9a-f]{64}/i)?.[0]).find(Boolean);
  if (!match) throw new Error('Running pods do not expose an immutable image digest.');
  return match;
}

function executeParity(pod) {
  return command(['exec', '-n', NAMESPACE, pod, '--', 'node', '-e', parityProgram()],
    { timeout: 180000 });
}

function healthChecks(pod) {
  const observedAt = new Date().toISOString();
  for (const endpoint of ['/readyz', '/healthz']) {
    command(['get', '--raw', `/api/v1/namespaces/${NAMESPACE}/pods/${pod}:4000/proxy${endpoint}`]);
  }
  return ['/readyz', '/healthz'].map((endpoint) => ({ path: endpoint, status: 200, observedAt }));
}

async function waitForReplacement(name, priorUid) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    try {
      const pod = podRows().find((item) => item.name === name);
      if (pod?.ready && pod.uid !== priorUid) return pod;
    } catch (_) {}
  }
  throw new Error(`Replacement pod ${name} did not become ready.`);
}

function writeEvidence(outputDir, pods, runId) {
  fs.mkdirSync(outputDir, { recursive: true });
  const refs = [];
  for (const pod of pods) {
    const filename = path.join(outputDir, `${runId}-${pod.name}.log`);
    fs.writeFileSync(filename, command(['logs', '-n', NAMESPACE, pod.name]), 'utf8');
    refs.push(path.relative(ROOT, filename).replaceAll('\\', '/'));
  }
  return refs;
}

async function execute(options = {}) {
  const ready = preflight();
  if (!ready.ready) return { status: 'not_observed', claimable: false, reason: ready.reason };
  command(['apply', '-f', contract.MANIFEST]);
  if (options.image) command(['set', 'image', '-n', NAMESPACE,
    `statefulset/${STATEFULSET}`, `backend=${options.image}`]);
  command(['rollout', 'status', '-n', NAMESPACE, `statefulset/${STATEFULSET}`, '--timeout=300s'],
    { timeout: 320000 });
  const pods = podRows();
  if (pods.length < 3 || pods.some((pod) => !pod.ready)) throw new Error('Three ready pods are required.');
  const digests = pods.map((pod) => executeParity(pod.name));
  if (new Set(digests).size !== 1) throw new Error('Morphogenesis output diverged across pods.');
  const health = healthChecks(pods[0].name);
  command(['delete', 'pod', '-n', NAMESPACE, pods[0].name, '--wait=true']);
  const replacement = await waitForReplacement(pods[0].name, pods[0].uid);
  const recoveredDigest = executeParity(replacement.name);
  if (recoveredDigest !== digests[0]) throw new Error('Restarted pod produced a different digest.');
  const runId = `k8s-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const outputDir = path.resolve(options.outputDir || path.join(ROOT, '.genos-evidence', 'external'));
  const evidenceRefs = writeEvidence(outputDir, podRows(), runId);
  const receipt = { schemaVersion: contract.RECEIPT_SCHEMA, target: 'kubernetes', runId,
    contract: contract.CONTRACT, context: ready.context, namespace: NAMESPACE,
    imageDigest: imageDigest(podRows()), podIdentities: podRows(), healthChecks: health,
    parityDigest: digests[0], restartObserved: { beforePodUid: pods[0].uid,
      afterPodUid: replacement.uid, recoveredDigest }, evidenceRefs };
  const validation = contract.validateReceipt(receipt);
  if (!validation.valid) throw new Error(`Generated receipt is invalid: ${validation.missing.join(', ')}`);
  const receiptPath = path.join(outputDir, `${runId}-receipt.json`);
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { status: 'observed', claimable: true, receiptPath, receipt };
}

function optionsFrom(argv) {
  const value = (flag) => argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null;
  return { execute: argv.includes('--execute'), image: value('--image'), outputDir: value('--output-dir') };
}

if (require.main === module) {
  const options = optionsFrom(process.argv.slice(2));
  const operation = options.execute ? execute(options) : Promise.resolve({ ...preflight(),
    status: 'not_observed', claimable: false, reason: 'execution_requires_explicit_execute_flag' });
  operation.then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}

module.exports = { NAMESPACE, STATEFULSET, preflight, parityProgram, execute, optionsFrom };
