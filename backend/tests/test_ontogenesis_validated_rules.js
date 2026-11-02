'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const validation = require('../src/services/ontogenesis/learningRuleValidation');
const memory = require('../src/services/ontogenesis/validatedRuleMemory');
const application = require('../src/services/ontogenesis/learningApplicationPlan');

const good = { op: 'number-a', rule: { kind: 'affine', a: 3, b: -8 } };
const feedback = { phase: 'train', op: 'number-a', family: 'number', taskIds: ['t1', 't2', 't3'],
  examples: [{ input: -2, output: -14 }, { input: 1, output: -5 }, { input: 4, output: 4 }] };

function validationChecks() {
  assert(validation.validate(good, feedback).accepted);
  assert.equal(validation.validate({ ...good, op: 'number-b' }, feedback).accepted, false);
  assert.equal(validation.validate({ ...good, rule: { kind: 'affine', a: 3, b: -22 } }, feedback).accepted, false);
  assert.equal(validation.validate(good, { ...feedback, phase: 'evaluate' }).accepted, false);
  assert.equal(validation.validate({ ...good, op: '__proto__' }, { ...feedback, op: '__proto__' }).accepted, false);
  assert.equal(validation.validate({ ...good, op: 'constructor' }, { ...feedback, op: 'constructor' }).accepted, false);
  assert.equal(validation.validate(good, { ...feedback, taskIds: ['t1', 't1', 't3'] }).accepted, false);
  assert.equal(validation.validate(good, { ...feedback, examples: [feedback.examples[0]], taskIds: ['t1'] }).accepted, false);
  assert.equal(validation.validRule({ ...good.rule, answer: 42 }), false);
  assert.throws(() => validation.evaluate(good.rule, Number.MAX_SAFE_INTEGER), /OVERFLOW/);
  assert.throws(() => validation.evaluate({ kind: 'affine', a: 4503599627370497, b: -9007199254740991 }, 3), /OVERFLOW/);
  const rule = { kind: 'text', prefix: '41', suffix: '38', reverse: true, upper: true };
  const text = { phase: 'train', op: 'text-a', family: 'text', taskIds: ['s1', 's2'],
    examples: [{ input: 'ab', output: '41BA38' }, { input: 'cd', output: '41DC38' }] };
  assert(validation.validate({ op: 'text-a', rule }, text).accepted);
  assert.equal(validation.validate({ op: 'text-a', rule: { ...rule, upper: false } }, text).accepted, false);
  assert.equal(validation.validRule({ ...rule, prefix: 41 }), false);
  const ambiguous = { ...text, examples: [{ input: 'aa', output: '41AA38' }, { input: 'bb', output: '41BB38' }] };
  assert.equal(validation.validate({ op: 'text-a', rule }, ambiguous).accepted, false);
}

function applicationChecks() {
  const rule = good.rule;
  const expression = { op: 'outer', input: { op: 'inner', input: 100 } };
  assert.deepEqual(application.describe({ inner: rule }, expression), {
    steps: [{ operator: 'inner', rule, input: 100 }, { operator: 'outer', rule: null, input: { step: 0 } }],
    unknownOperators: ['outer']
  });
  const recursive = { op: 'inner' }; recursive.input = recursive;
  assert.throws(() => application.describe({}, recursive), /EXPRESSION_INVALID/);
  assert.throws(() => application.describe({}, { op: 'inner', input: true }), /INPUT_INVALID/);
}

async function recordChecks(db) {
  const input = { id: 'rule-1', agentId: 'agent-a', update: good, feedback, provenance: { ordinal: 1, responseHash: 'real-fixture' } };
  assert((await memory.record(db, input)).accepted);
  assert.deepEqual(await memory.list(db, 'agent-a'), { 'number-a': good.rule });
  await memory.record(db, input);
  assert.equal((await db.get('SELECT count(*) AS n FROM ontogenesis_memory')).n, 2);
  await assert.rejects(memory.record(db, { ...input, provenance: { ordinal: 2 } }), /IDEMPOTENCY_CONFLICT/);
  const bad = { ...input, id: 'rule-2', update: { ...good, rule: { kind: 'affine', a: 3, b: -22 } }, provenance: { ordinal: 2 } };
  assert.equal((await memory.record(db, bad)).accepted, false);
  assert.deepEqual(await memory.list(db, 'agent-a'), { 'number-a': good.rule });
  assert.deepEqual(await memory.list(db, 'other-agent'), {});
  await db.run("UPDATE ontogenesis_memory SET content = ? WHERE id='rule-1'", JSON.stringify(bad.update));
  assert.deepEqual(await memory.list(db, 'agent-a'), {});
}

async function counterexampleChecks(db) {
  await memory.record(db, { id: 'rule-3', agentId: 'agent-a', update: good, feedback, provenance: { ordinal: 3 } });
  const contradiction = { ...feedback, taskIds: ['new1', 'new2'], examples: [{ input: 1, output: 99 }, { input: 4, output: 108 }] };
  await memory.record(db, { id: 'check-4', agentId: 'agent-a', update: null, feedback: contradiction, provenance: { ordinal: 4 } });
  assert.deepEqual(await memory.list(db, 'agent-a'), {});
}

async function main() {
  validationChecks();
  applicationChecks();
  const parent = process.env.GENOS_TEST_RUN_ROOT || os.tmpdir();
  fs.mkdirSync(parent, { recursive: true });
  const directory = fs.mkdtempSync(path.join(parent, 'validated-rules-'));
  const filename = path.join(directory, 'memory.sqlite');
  let db = await sqlite.open({ filename, driver: sqlite3.Database });
  try {
    await db.exec(`CREATE TABLE ontogenesis_memory(id TEXT PRIMARY KEY, project_id TEXT, kind TEXT,
      content TEXT, provenance_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
    await recordChecks(db);
    await counterexampleChecks(db);
    await memory.record(db, { id: 'durable-other', agentId: 'agent-b', update: good, feedback, provenance: { ordinal: 1 } });
    const before = await memory.list(db, 'agent-a');
    await db.close();
    db = await sqlite.open({ filename, driver: sqlite3.Database });
    assert.deepEqual(await memory.list(db, 'agent-a'), before);
    assert.deepEqual(await memory.list(db, 'agent-b'), { 'number-a': good.rule });
    console.log('PASS typed learning validation: counterexamples ambiguity retention idempotency tampering scope durable revocation');
  } finally { await db.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
