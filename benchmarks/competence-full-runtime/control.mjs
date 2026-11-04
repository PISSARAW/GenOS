import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {open, mission} from './session.mjs';

const require = createRequire(import.meta.url);
const corpus = require('../competence-five-arms/corpus.cjs');
const programs = require('./programs.cjs');
const prompt = require('./prompt.cjs');
const protocol = require('./protocol.json');
const coefficient = () => crypto.randomInt(-3, 4);
const nonzero = () => [-3, -2, -1, 1, 2, 3][crypto.randomInt(6)];
const operator = () => 'op_' + crypto.randomBytes(4).toString('hex');

export function cases() {
  const rules = ['affine', 'quadratic', 'hinge', 'affine', 'quadratic', 'hinge'].map(kind =>
    ({op: operator(), epoch: 0, kind, a: nonzero(), b: coefficient(), c: kind === 'affine' ? 0 : nonzero()}));
  const ambiguous = operator();
  const missing = operator();
  const observations = rules.flatMap(rule => [-2, -1, 0, 1, 2, 7].map(x =>
    ({op: rule.op, epoch: 0, x, y: corpus.value(rule, x)})));
  observations.push({op: ambiguous, epoch: 0, x: 0, y: 1});
  const requested = [...rules.map(({op, epoch}) => ({op, epoch})), {op: ambiguous, epoch: 0}, {op: missing, epoch: 0}];
  const specs = [...rules.map(rule => [rule.op]), ...[[0, 1], [1, 2], [2, 3], [4, 5]].map(pair => pair.map(i => rules[i].op)),
    [ambiguous], [missing]];
  const queries = specs.map((ops, i) => ({id: 'induction-' + i,
    expression: corpus.expression(ops, crypto.randomInt(100, 300)), epochs: {}, unknown: i >= 10}));
  return {rules, context: {observations, requested, learnedRules: []}, queries};
}

export function candidateRules(receipts, observations) {
  const accepted = new Map();
  const declarations = [];
  const failures = [];
  const workers = [...new Map((receipts.records || []).filter(row => row.run.agent_id !== receipts.identity?.agentId)
    .map(row => [row.run.agent_id, row])).values()];
  for (const worker of workers) {
    try {
      const rules = programs.parse(worker.reports.at(-1) || {});
      declarations.push({workerId: worker.run.agent_id, rules});
      if (worker.receipt?.result.verified !== true || worker.oracle.status !== 'accepted_at_decision') continue;
      const admitted = programs.admit({rules, observations});
      for (const rule of admitted.accepted) {
        const key = `${rule.op}:${rule.epoch}`;
        if (!accepted.has(key)) accepted.set(key, rule);
      }
    } catch (error) {failures.push({workerId: worker.run.agent_id, error: error.message});}
  }
  return {rules: [...accepted.values()], declarations, failures};
}

function answer(expression, rules) {
  if (typeof expression === 'number') return expression;
  return corpus.value(rules.find(rule => rule.op === expression.op), answer(expression.value, rules));
}

export function score(data, candidates) {
  return data.queries.map(query => {
    const response = programs.predict({query, rules: candidates.rules, observations: data.context.observations});
    const expected = query.unknown ? null : answer(query.expression, data.rules);
    return {query, response, expected, correct: query.unknown ? response.abstain : response.answer === expected};
  });
}

export async function describe() {
  const result = await fetch(protocol.endpoint + '/api/tags').then(response => response.json());
  const model = result.models.find(item => item.name === protocol.model);
  if (model?.digest !== protocol.modelDigest) throw Error('PINNED_MODEL_DIGEST_REQUIRED');
  const server = await fetch(protocol.endpoint + '/api/version').then(response => response.json());
  return {name: model.name, digest: model.digest, endpoint: protocol.endpoint, serverVersion: server.version};
}

function recognizesUnknown(data, candidates) {
  const expected = data.context.requested.slice(-2).map((item, index) =>
    ({...item, reason: index === 0 ? 'ambiguous' : 'missing'}));
  return candidates.declarations.length === 3 && candidates.declarations.every(worker =>
    expected.every(item => worker.rules.some(rule => rule.op === item.op && rule.epoch === item.epoch
      && rule.reason === item.reason && rule.confidence === 0 && rule.kind === 'unknown'
      && ['a', 'b', 'c'].every(key => rule[key] === 0))));
}

async function main() {
  const destination = process.argv[2];
  if (!destination) throw Error('Provide a fresh short D control directory');
  const runtimeManifest = require('./integrity.cjs').verifySources();
  const data = cases();
  const model = await describe();
  const session = await open(destination);
  const manifest = {schema: 'genos.sealed-induction-control/v1', model,
    runtimeRoot: session.runtimeRoot, runtimeSourceHash: runtimeManifest.sourcesHash,
    runtimeHash: runtimeManifest.runtimeHash,
    createdAt: new Date().toISOString(),
    contextHash: corpus.hash(data.context), casesHash: corpus.hash(data),
    acceptance: '12 of 12 heldout outcomes, native three-worker receipts, measured truth graph, successful mission, real pinned model usage'};
  fs.writeFileSync(destination + '/manifest.json', JSON.stringify(manifest, null, 2));
  fs.writeFileSync(destination + '/private-cases.json', JSON.stringify(data, null, 2));
  const manifestHash = corpus.hash(manifest);
  console.log(JSON.stringify({directory: destination, manifestHash}));
  try {
    const execution = await mission(session, {id: 'induction', context: data.context,
      prompt: prompt.build(data.context), useMemoryContext: false});
    const candidates = candidateRules(execution.receipts, data.context.observations);
    const rows = score(data, candidates);
    const attempts = execution.receipts.attempts || [];
    const called = attempts.filter(row => row.provider_called === 1);
    const parsed = execution.result.isError ? null : JSON.parse(execution.result.content.find(row => row.type === 'text').text);
    const integrity = {twelveCorrect: rows.every(row => row.correct), nativeReceipts: execution.receipts.success,
      nativeUnknownRecognition: recognizesUnknown(data, candidates),
      successfulMission: parsed?.success === true, actualLlm: called.length >= 3,
      accountedUsage: called.length > 0 && called.every(row => Number.isInteger(row.input_tokens)
        && Number.isInteger(row.output_tokens) && row.status === 'completed' && row.token_usage_source === 'provider'),
      pinnedModel: called.length > 0 && called.every(row => row.model === 'ollama://' + protocol.model),
      sourceManifestHash: runtimeManifest.sourcesHash};
    const result = {manifestHash, integrity, passed: Object.entries(integrity)
      .filter(([key]) => key !== 'sourceManifestHash').every(([, value]) => value === true), rows, candidates};
    fs.writeFileSync(destination + '/control-result.json', JSON.stringify(result, null, 2));
    require('./integrity.cjs').verifySources();
    console.log(JSON.stringify({passed: result.passed, integrity, correct: rows.filter(row => row.correct).length}));
    if (!result.passed) process.exitCode = 1;
  } finally {await session.close();}
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  main().catch(error => {console.error(error); process.exitCode = 1;});
}
