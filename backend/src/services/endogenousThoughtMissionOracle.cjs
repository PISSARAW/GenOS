'use strict';

const vm = require('node:vm');
const crypto = require('node:crypto');

function lineOf(line) { return (line || '').replace(/^\s*#{1,6}\s*/, '').split('**').join('').trim(); }
function dialogue(line, next) {
  return /^[\p{Lu}][\p{Lu} .\u2019\u0027-]{1,40}:?$/u.test(line) && Boolean(next) && !/^(?:INT|EXT)\./i.test(line);
}
function wordsIn(text) { return Array.from(text.matchAll(/[\p{L}\p{N}]+(?:[\u0027\u2019][\p{L}\p{N}]+)*/gu)).length; }
function isScene(line) { return /^(?:\d+[.\s]+)?(?:INT\.?|EXT\.?)\s/i.test(line); }
function measurements(input) {
  let scenes = 0, hasDialogue = false;
  const lines = input.text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lineOf(lines[index]);
    if (isScene(line)) scenes++;
    if (dialogue(line, lineOf(lines[index + 1]))) hasDialogue = true;
  }
  return { words: wordsIn(input.text), scenes, hasDialogue };
}
function missingRequirements(metrics, required) {
  const missing = [];
  if (metrics.words < required.minWords) missing.push('MIN_WORDS');
  if (metrics.scenes < required.minScenes) missing.push('MIN_SCENES');
  if (metrics.scenes > required.maxScenes) missing.push('MAX_SCENES');
  if (required.requireDialogue && !metrics.hasDialogue) missing.push('DIALOGUE');
  return missing;
}
function inspect(input) {
  const metrics = measurements(input);
  metrics.missing = missingRequirements(metrics, input.requirements);
  const measured = input.measurement.metrics;
  const matchesMeasurement = measured.words === metrics.words && measured.scenes === metrics.scenes
    && measured.hasDialogue === metrics.hasDialogue && JSON.stringify(measured.missing) === JSON.stringify(metrics.missing);
  return { verdict: matchesMeasurement ? (metrics.missing.length ? 'supported' : 'refuted') : 'inconclusive', metrics, matchesMeasurement };
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  if (Buffer.byteLength(buffer) > 1500000) process.exit(2);
});
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(buffer);
    const context = vm.createContext({ input, WebAssembly: undefined }, { codeGeneration: { strings: false, wasm: false } });
    const program = [lineOf, dialogue, wordsIn, isScene, measurements, missingRequirements, inspect].map(fn => fn.toString()).join('\n');
    const result = new vm.Script(`${program}\ninspect(input)`).runInContext(context, { timeout: 1000 });
    const artifactDigest = crypto.createHash('sha256').update(input.text).digest('hex');
    if (artifactDigest !== input.measurement.artifactDigest) result.verdict = 'inconclusive';
    process.stdout.write(JSON.stringify({ ...result, processId: process.pid, artifactDigest,
      schema: 'genos.ett-artifact-oracle/v1' }));
  } catch (error) { process.stderr.write(error.message); process.exitCode = 1; }
});
