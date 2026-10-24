'use strict';

function build(error) {
  const output = (error.proposal?.tests || []).map((test) => `${test.stdout || ''}\n${test.stderr || ''}`).join('\n');
  const patches = error.proposal?.failedPatchContents || [];
  const code = patches.map(({ content }) => content).join('\n');
  if (/paginate page [12] starts/i.test(output)) {
    return 'The independent oracle treats page as 1-based. Compute start = (page - 1) * pageSize, then return values.slice(start, start + pageSize). Page 1 must return the first pageSize items; page 2 must begin immediately after them. Do not use page * pageSize.';
  }
  if (/parsePort[\s\S]*?\d+\s*!==\s*null/i.test(output)) {
    return 'The independent oracle expects parsePort to return null for malformed strings, zero, and values above 65535. Do not call parseInt before validating the entire input: trim it, require /^\\d+$/.test(trimmed), then use Number(trimmed). Return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null. Never substitute a default port for invalid input.';
  }
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
