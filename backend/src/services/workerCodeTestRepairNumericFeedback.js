'use strict';

function build(error) {
  const output = (error.proposal?.tests || []).map((test) => `${test.stdout || ''}\n${test.stderr || ''}`).join('\n');
  const patches = error.proposal?.failedPatchContents || [];
  const code = patches.map(({ content }) => content).join('\n');
  if (/partial\s+(?:numeric|number)|trailing\s+(?:numeric|number)/i.test(output)
      && /\bparseInt\s*\(/.test(code)) {
    return 'The independent oracle reports that a partial numeric string was accepted. Number.parseInt accepts a valid numeric prefix and ignores trailing characters; validate the entire trimmed input before converting, then apply the required range checks.';
  }
  if (/one decimal|decimal place|fixed precision/i.test(output)
      && /toFixed\s*\(\s*\d+\s*\)[\s\S]*?replace\s*\(/i.test(code)) {
    return 'The independent oracle requires fixed decimal precision. Keep the requested trailing zeroes from toFixed; do not strip .0 or other trailing zeroes afterward.';
  }
  return '';
}

module.exports = { build };
