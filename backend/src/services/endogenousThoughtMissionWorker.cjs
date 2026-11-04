'use strict';

const vm = require('node:vm');
const crypto = require('node:crypto');

function dialogueOf(lines) {
  return lines.some((line, i) => /^[\p{Lu}][\p{Lu} .\u2019\u0027-]{1,40}:?$/u.test(line)
    && Boolean(lines[i + 1]) && !/^(?:INT|EXT)\./i.test(line));
}
function wordCount(text) {
  return (text.match(/[\p{L}\p{N}]+(?:[\u0027\u2019][\p{L}\p{N}]+)*/gu) || []).length;
}
function normalizedLines(text) {
  return text.split(/\r?\n/).map(line => line.replace(/^\s*#{1,6}\s*/, '').replace(/\*\*/g, '').trim());
}
function sceneCount(lines) { return lines.filter(line => /^(?:\d+[.\s]+)?(?:INT\.?|EXT\.?)\s/i.test(line)).length; }
function missingOf(metrics, required) {
  const missing = [];
  if (metrics.words < required.minWords) missing.push('MIN_WORDS');
  if (metrics.scenes < required.minScenes) missing.push('MIN_SCENES');
  if (metrics.scenes > required.maxScenes) missing.push('MAX_SCENES');
  if (required.requireDialogue && !metrics.hasDialogue) missing.push('DIALOGUE');
  return missing;
}
function measure(input) {
  const lines = normalizedLines(input.text);
  const metrics = { words: wordCount(input.text), scenes: sceneCount(lines), hasDialogue: dialogueOf(lines) };
  return { ...metrics, missing: missingOf(metrics, input.requirements) };
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
    const program = [dialogueOf, wordCount, normalizedLines, sceneCount, missingOf, measure].map(fn => fn.toString()).join('\n');
    const metrics = new vm.Script(`${program}\nmeasure(input)`).runInContext(context, { timeout: 1000 });
    const capabilities = new vm.Script('({require:typeof require,process:typeof process,fetch:typeof fetch})')
      .runInContext(context, { timeout: 1000 });
    process.stdout.write(JSON.stringify({ schema: 'genos.ett-artifact-measurement/v1', processId: process.pid,
      artifactDigest: crypto.createHash('sha256').update(input.text).digest('hex'), metrics, capabilities }));
  } catch (error) { process.stderr.write(error.message); process.exitCode = 1; }
});
