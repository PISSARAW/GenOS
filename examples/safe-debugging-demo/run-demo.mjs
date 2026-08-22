import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const binary = process.argv[2] || path.join(repoRoot, 'target/debug/genos');
const demoRoot = path.join(repoRoot, '.genos/demo/safe-debugging');
const worldRoot = path.join(demoRoot, 'world');
const artifactDir = path.join(scriptDir, 'artifacts');
const studioEvidenceDir = path.join(repoRoot, 'studio/public/demo');
const events = [];
const startedAt = Date.now();

rmSync(demoRoot, { recursive: true, force: true });
mkdirSync(demoRoot, { recursive: true });
mkdirSync(artifactDir, { recursive: true });
mkdirSync(studioEvidenceDir, { recursive: true });

function runGenos(label, args) {
  const start = performance.now();
  const result = spawnSync(binary, args, { cwd: repoRoot, encoding: 'utf8' });
  const durationMs = Math.round((performance.now() - start) * 100) / 100;
  if (result.status !== 0) {
    throw new Error(`${label} failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  const output = JSON.parse(result.stdout);
  events.push({ sequence: events.length + 1, label, duration_ms: durationMs, output });
  return output;
}

function worldArgs(command, worldId, extras = []) {
  return ['world', command, '--provider', 'directory', '--root', worldRoot, '--world-id', worldId, ...extras, '--format', 'json'];
}

console.log('\nGenOS SAFE PARALLEL DEBUGGING');
console.log('Bug -> snapshot -> 3 forks -> isolated tests -> replay -> conditional promotion\n');

const parent = runGenos('create_parent', [
  'world', 'create', '--provider', 'directory', '--root', worldRoot,
  '--seed', path.join(scriptDir, 'fixture'), '--format', 'json',
]).world_id;

const baseline = runGenos('reproduce_bug', worldArgs('run', parent, [
  '--command', 'node test.js', '--allow-failure',
]));
if (baseline.success) throw new Error('The baseline must reproduce the bug');
console.log('1  REPRODUCE     FAIL   boundary bug confirmed');

const snapshot = runGenos('snapshot_baseline', worldArgs('snapshot', parent)).snapshot_id;
console.log(`2  SNAPSHOT      SAVED  ${snapshot}`);

const forked = runGenos('fork_candidates', [
  'world', 'fork', '--provider', 'directory', '--root', worldRoot,
  '--snapshot-id', snapshot, '--count', '3', '--format', 'json',
]).world_ids;

const names = ['candidate-a', 'candidate-b', 'candidate-c'];
const candidates = [];
for (let index = 0; index < forked.length; index += 1) {
  const name = names[index];
  const worldId = forked[index];
  const contents = readFileSync(path.join(scriptDir, 'mutations', `${name}.js`), 'utf8');
  runGenos(`mutate_${name}`, worldArgs('write-file', worldId, [
    '--path', 'discount.js', '--contents', contents,
  ]));
  const test = runGenos(`test_${name}`, worldArgs('run', worldId, [
    '--command', 'node test.js', '--allow-failure',
  ]));
  candidates.push({ name, world_id: worldId, test });
  console.log(`3  ${name.toUpperCase().padEnd(13)} ${test.success ? 'PASS' : 'FAIL'}   ${test.success ? '5/5 tests' : 'rejected by isolation gate'}`);
}

const winners = candidates.filter((candidate) => candidate.test.success);
if (winners.length !== 1) throw new Error(`Expected one winner, found ${winners.length}`);
const winner = winners[0];

const replayWorld = runGenos('restore_for_replay', [
  'world', 'fork', '--provider', 'directory', '--root', worldRoot,
  '--snapshot-id', snapshot, '--count', '1', '--format', 'json',
]).world_ids[0];
const winnerContents = readFileSync(path.join(scriptDir, 'mutations', `${winner.name}.js`), 'utf8');
runGenos('replay_winning_mutation', worldArgs('write-file', replayWorld, [
  '--path', 'discount.js', '--contents', winnerContents,
]));
const replayTest = runGenos('verify_replay', worldArgs('run', replayWorld, [
  '--command', 'node test.js', '--allow-failure',
]));
const replayDiff = runGenos('compare_replay', [
  'world', 'diff', '--provider', 'directory', '--root', worldRoot,
  '--world-a', winner.world_id, '--world-b', replayWorld, '--format', 'json',
]);
if (!replayTest.success || replayDiff.files_changed !== 0) {
  throw new Error('Replay did not reproduce the selected candidate');
}
console.log(`4  REPLAY        PASS   ${replayDiff.files_changed} changed files vs winner`);

const promotedSnapshot = runGenos('promote_after_gates', worldArgs('snapshot', replayWorld)).snapshot_id;
console.log(`5  PROMOTION     PASS   merge gate approved (${winner.name})`);

const report = {
  schema_version: 1,
  scenario: 'safe-parallel-debugging',
  generated_at: new Date().toISOString(),
  source: {
    command: './examples/safe-debugging-demo/run-demo.sh',
    fixture: 'examples/safe-debugging-demo/fixture',
  },
  baseline: { world_id: parent, reproduced: !baseline.success, snapshot_id: snapshot },
  candidates: candidates.map(({ name, world_id, test }) => ({
    name,
    world_id,
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
writeFileSync(path.join(studioEvidenceDir, 'safe-debugging.json'), serializedReport);
writeFileSync(path.join(artifactDir, 'events.jsonl'), `${events.map((event) => JSON.stringify(event)).join('\n')}\n`);

console.log(`\nWINNER          ${winner.name}`);
console.log(`REPLAY          VERIFIED`);
console.log(`MERGE           APPROVED`);
console.log(`TOKENS / COST   0 / $0.00 (no model call)`);
console.log(`WALL TIME       ${report.runtime.wall_ms} ms`);
console.log(`EVIDENCE        examples/safe-debugging-demo/artifacts/latest.json\n`);
