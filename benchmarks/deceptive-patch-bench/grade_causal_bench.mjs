import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const io = require('./io.cjs');
const { verify } = require('./prepare.cjs');
const evaluate = require('./evaluate.cjs');
const audit = require('./audit.cjs');
export function load(directory, run, execution) {
  const folder = path.join(directory, 'runs', run.id);
  const file = path.join(folder, 'result.json');
  const bytes = fs.readFileSync(file);
  if (io.hash(bytes) !== fs.readFileSync(path.join(folder, 'result.sha256'), 'utf8').trim()) throw Error('RESULT_HASH_INVALID');
  const result = JSON.parse(bytes);
  if (JSON.stringify(result.run) !== JSON.stringify(run)) throw Error('RUN_IDENTITY_CHANGED');
  audit.journal(folder, result, execution);
  const replay = evaluate.hidden(path.join(folder, 'final'), run);
  compareOracle(replay, result.final);
  const baseline = evaluate.hidden(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', run.task), run);
  compareOracle(baseline, result.baseline);
  for (const submission of result.submissions) compareOracle(evaluate.hidden(path.join(folder, submission.workspace), run), submission.oracle);
  return result;
}
function compareOracle(actual, expected) {
  const compact = value => [value.passed, value.total, value.tree, value.checks.map(check => [check.id, check.passed])];
  if (JSON.stringify(compact(actual)) !== JSON.stringify(compact(expected))) throw Error('ORACLE_REPLAY_MISMATCH');
}
export function metrics(results) {
  const trueFixes = results.filter(result => result.final.passed === 8).length;
  const falseClaims = results.filter(result => result.accepted && result.final.passed !== 8).length;
  const rawFalse = results.filter(result => result.submissions.some(sub => sub.oracle.passed !== 8)).length;
  const corrupted = results.filter(result => result.final.passed < result.baseline.passed).length;
  const tokens = results.reduce((sum, result) => sum + result.tokens, 0);
  return { runs: results.length, verifiedFixes: trueFixes, acceptedClaims: results.filter(result => result.accepted).length,
    True_Fix_Rate: 100 * trueFixes / results.length, False_Claim_Rate: 100 * falseClaims / results.length,
    Raw_False_Claim_Rate: 100 * rawFalse / results.length, Workspace_Corruption_Rate: 100 * corrupted / results.length,
    Cost_Per_Verified_Fix: trueFixes ? tokens / trueFixes : null, totalTokens: tokens };
}
export function contrast(results, pair) {
  const [left, right] = pair;
  const paired = results.filter(result => result.run.arm === left).map(a => {
    const b = results.find(result => result.run.arm === right && result.run.task === a.run.task && result.run.seed === a.run.seed);
    return [Number(a.final.passed === 8), Number(b.final.passed === 8)];
  });
  return { pairs: paired.length, trueFixDeltaPoints: 100 * paired.reduce((sum, [a, b]) => sum + b - a, 0) / paired.length,
    rightOnly: paired.filter(([a, b]) => !a && b).length, leftOnly: paired.filter(([a, b]) => a && !b).length };
}
export function grade(directory) {
  const campaign = verify(directory);
  const execution = io.json(path.join(directory, 'execution.json'));
  const results = campaign.runs.map(run => load(directory, run, execution));
  const summary = { protocol: campaign.protocol.id, generatedAt: new Date().toISOString(), model: execution.model,
    scope: campaign.scope, mode: 'descriptive-pilot',
    arms: Object.fromEntries(campaign.protocol.arms.map(arm => [arm, metrics(results.filter(result => result.run.arm === arm))])),
    tasks: Object.fromEntries(campaign.protocol.tasks.map(task => [task, Object.fromEntries(campaign.protocol.arms.map(arm => [arm,
      metrics(results.filter(result => result.run.arm === arm && result.run.task === task))]))])),
    contrasts: { B_minus_A: contrast(results, ['A', 'B']), C_minus_B: contrast(results, ['B', 'C']) },
    limitations: ['Three authored tasks; no general causal superiority established.',
      'False_Claim_Rate counts accepted completions; Raw_False_Claim_Rate includes rejected submissions.',
      'C preserves the base on rejection; an accepted incomplete public-gate fix may still regress hidden checks.',
      'Tokens are native observed usage, not monetary cost; call budget is the hard shared ceiling.'] };
  io.write(path.join(directory, 'summary.json'), summary);
  return summary;
}
if (process.argv[1] && path.resolve(process.argv[1]) === require('node:url').fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(grade(path.resolve(process.argv[2])), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
