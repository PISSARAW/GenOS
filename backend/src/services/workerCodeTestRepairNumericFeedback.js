'use strict';

function build(error) {
  const output = (error.proposal?.tests || []).map((test) => `${test.stdout || ''}\n${test.stderr || ''}`).join('\n');
  if (!/partial\s+(?:numeric|number)|trailing\s+(?:numeric|number)/i.test(output)) return '';
  const patches = error.proposal?.failedPatchContents || [];
  if (!patches.some(({ content }) => /\bparseInt\s*\(/.test(content))) return '';
  return 'The independent oracle reports that a partial numeric string was accepted. Number.parseInt accepts a valid numeric prefix and ignores trailing characters; validate the entire trimmed input before converting, then apply the required range checks.';
}

module.exports = { build };
