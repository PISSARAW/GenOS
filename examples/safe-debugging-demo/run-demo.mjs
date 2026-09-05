import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const demoRoot = path.join(repoRoot, '.genos/demo/safe-debugging');
const worldRoot = path.join(demoRoot, 'world');
const snapshotRoot = path.join(demoRoot, 'snapshots');
const artifactDir = path.join(scriptDir, 'artifacts');
const studioEvidenceDir = path.join(repoRoot, 'studio/public/demo');
const events = [];
const startedAt = Date.now();

rmSync(demoRoot, { recursive: true, force: true });
mkdirSync(worldRoot, { recursive: true });
mkdirSync(snapshotRoot, { recursive: true });
mkdirSync(artifactDir, { recursive: true });
if (existsSync(path.join(repoRoot, 'studio'))) {
  mkdirSync(studioEvidenceDir, { recursive: true });
}

function recordEvent(label, output, start) {
  const durationMs = Math.round((performance.now() - start) * 100) / 100;
  events.push({ sequence: events.length + 1, label, duration_ms: durationMs, output });
  return output;
}

function createWorld(worldId, seedDir) {
  const dir = path.join(worldRoot, worldId);
  mkdirSync(dir, { recursive: true });
  if (seedDir) cpSync(seedDir, dir, { recursive: true });
  return { world_id: worldId, path: dir, created: true };
}

function snapshotWorld(worldId, snapshotId) {
  const source = path.join(worldRoot, worldId);
  const dest = path.join(snapshotRoot, snapshotId);
  mkdirSync(dest, { recursive: true });
  cpSync(source, dest, { recursive: true });
  return { snapshot_id: snapshotId, world_id: worldId, saved: true };
}

function forkFromSnapshot(snapshotId, count = 1) {
  const ids = [];
  const source = path.join(snapshotRoot, snapshotId);
  for (let i = 0; i < count; i += 1) {
    const newId = randomUUID();
    const dest = path.join(worldRoot, newId);
    mkdirSync(dest, { recursive: true });
    cpSync(source, dest, { recursive: true });
    ids.push(newId);
  }
  return { world_ids: ids, count };
}

function writeWorldFile(worldId, relativePath, contents) {
  const filePath = path.join(worldRoot, worldId, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents, 'utf8');
  return { world_id: worldId, path: relativePath, bytes: Buffer.byteLength(contents) };
}

function runInWorld(worldId, commandStr) {
  const cwd = path.join(worldRoot, worldId);
  const [cmd, ...args] = commandStr.split(' ');
  const res = spawnSync(cmd === 'node' ? process.execPath : cmd, args, { cwd, encoding: 'utf8' });
  return {
    world_id: worldId,
    command: commandStr,
    exit_code: res.status ?? (res.error ? 1 : 0),
    success: res.status === 0,
    stdout: res.stdout || '',
    stderr: res.stderr || ''
  };
}

function diffWorlds(worldIdA, worldIdB) {
  const dirA = path.join(worldRoot, worldIdA);
  const dirB = path.join(worldRoot, worldIdB);
  const filesA = new Set(readdirSync(dirA));
  const filesB = new Set(readdirSync(dirB));
  let changed = 0;
  for (const f of filesA) {
    if (!filesB.has(f) || readFileSync(path.join(dirA, f), 'utf8') !== readFileSync(path.join(dirB, f), 'utf8')) {
      changed += 1;
    }
  }
  return { files_changed: changed };
}

console.log('\nGenOS SAFE PARALLEL DEBUGGING');
console.log('Bug -> snapshot -> 3 forks -> isolated tests -> replay -> conditional promotion\n');

// 1. REPRODUCE BUG
const parentId = randomUUID();
let start = performance.now();
createWorld(parentId, path.join(scriptDir, 'fixture'));
recordEvent('create_parent', { world_id: parentId }, start);

start = performance.now();
const baseline = runInWorld(parentId, 'node test.js');
recordEvent('reproduce_bug', baseline, start);
if (baseline.success) throw new Error('The baseline must reproduce the bug');
console.log('1  REPRODUCE     FAIL   boundary bug confirmed');

// 2. SNAPSHOT BASELINE
start = performance.now();
const snapshotId = randomUUID();
snapshotWorld(parentId, snapshotId);
recordEvent('snapshot_baseline', { snapshot_id: snapshotId }, start);
console.log(`2  SNAPSHOT      SAVED  ${snapshotId}`);

// 3. FORK CANDIDATES & EVALUATE
start = performance.now();
const forked = forkFromSnapshot(snapshotId, 3).world_ids;
recordEvent('fork_candidates', { world_ids: forked }, start);

const names = ['candidate-a', 'candidate-b', 'candidate-c'];
const candidates = [];
for (let index = 0; index < forked.length; index += 1) {
  const name = names[index];
  const worldId = forked[index];
  const contents = readFileSync(path.join(scriptDir, 'mutations', `${name}.js`), 'utf8');

  start = performance.now();
  writeWorldFile(worldId, 'discount.js', contents);
  recordEvent(`mutate_${name}`, { world_id: worldId, path: 'discount.js' }, start);

  start = performance.now();
  const test = runInWorld(worldId, 'node test.js');
  recordEvent(`test_${name}`, test, start);

  candidates.push({ name, world_id: worldId, mutation: contents.trim(), tests_passed: test.success ? 5 : 0, test });
  console.log(`3  ${name.toUpperCase().padEnd(13)} ${test.success ? 'PASS' : 'FAIL'}   ${test.success ? '5/5 tests' : 'rejected by isolation gate'}`);
}

const winners = candidates.filter((candidate) => candidate.test.success);
if (winners.length !== 1) throw new Error(`Expected one winner, found ${winners.length}`);
const winner = winners[0];

// 4. REPLAY IN CLEAN FORK
start = performance.now();
const replayWorld = forkFromSnapshot(snapshotId, 1).world_ids[0];
recordEvent('restore_for_replay', { world_ids: [replayWorld] }, start);

start = performance.now();
const winnerContents = readFileSync(path.join(scriptDir, 'mutations', `${winner.name}.js`), 'utf8');
writeWorldFile(replayWorld, 'discount.js', winnerContents);
recordEvent('replay_winning_mutation', { world_id: replayWorld, path: 'discount.js' }, start);

start = performance.now();
const replayTest = runInWorld(replayWorld, 'node test.js');
recordEvent('verify_replay', replayTest, start);

start = performance.now();
const replayDiff = diffWorlds(winner.world_id, replayWorld);
recordEvent('compare_replay', replayDiff, start);

if (!replayTest.success || replayDiff.files_changed !== 0) {
  throw new Error('Replay did not reproduce the selected candidate');
}
console.log(`4  REPLAY        PASS   ${replayDiff.files_changed} changed files vs winner`);

// 5. PROMOTION AFTER GATES
start = performance.now();
const promotedSnapshot = randomUUID();
snapshotWorld(replayWorld, promotedSnapshot);
recordEvent('promote_after_gates', { snapshot_id: promotedSnapshot }, start);
console.log(`5  PROMOTION     PASS   merge gate approved (${winner.name})`);

const report = {
  schema_version: 1,
  scenario: 'safe-parallel-debugging',
  generated_at: new Date().toISOString(),
  source: {
    command: './examples/safe-debugging-demo/run-demo.sh',
    fixture: 'examples/safe-debugging-demo/fixture',
  },
  baseline: { world_id: parentId, reproduced: !baseline.success, snapshot_id: snapshotId },
  candidates: candidates.map(({ name, world_id, mutation, test }) => ({
    name,
    world_id,
    mutation,
    tests_passed: test.success ? 5 : 0,
    success: test.success,
    exit_code: test.exit_code,
    duration_ms: events.find((event) => event.label === `test_${name}`).duration_ms,
  })),
  selection: {
    winner: winner.name,
    replay_world_id: replayWorld,
    replay_verified: replayTest.success && replayDiff.files_changed === 0,
    promoted_snapshot_id: promotedSnapshot,
    merge_decision: 'approved',
  },
  usage: {
    model_calls: 0,
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    reason: 'This deterministic demo invokes no language model.',
  },
  execution: {
    mode: 'deterministic_fixture',
    live: false,
    model_invoked: false,
    provider: 'directory',
    os_sandbox: false,
  },
  runtime: {
    wall_ms: Date.now() - startedAt,
    genos_operations: events.length,
  },
  limits: [
    'This proves isolation, replay and conditional selection; it does not measure model quality.',
    'The directory provider isolates files by directory, not by an OS security sandbox.',
  ],
};

const serializedReport = `${JSON.stringify(report, null, 2)}\n`;
writeFileSync(path.join(artifactDir, 'latest.json'), serializedReport);
if (existsSync(path.join(repoRoot, 'studio'))) {
  writeFileSync(path.join(studioEvidenceDir, 'safe-debugging.json'), serializedReport);
}
writeFileSync(path.join(artifactDir, 'events.jsonl'), `${events.map((event) => JSON.stringify(event)).join('\n')}\n`);

console.log(`\nWINNER          ${winner.name}`);
console.log(`REPLAY          VERIFIED`);
console.log(`MERGE           APPROVED`);
console.log(`TOKENS / COST   0 / $0.00 (no model call)`);
console.log(`WALL TIME       ${report.runtime.wall_ms} ms`);
console.log(`EVIDENCE        examples/safe-debugging-demo/artifacts/latest.json\n`);

