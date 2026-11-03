'use strict';

const NUMBER = 'For numbers show each signed multiplication and addition. Return a NUMBER in answer.';
const TEXT = `For text track the character order including every repeated letter and digit, and state the complete result of each operation.
Return a STRING in answer. For composition the entire previous result, including prefix and suffix digits, enters the next operation.`;

function instruction(family) {
  return family === 'number' ? NUMBER : TEXT;
}

function message(plan) {
  const numeric = typeof plan.literal.value === 'number';
  const lines = ['Original ' + (numeric ? 'number' : 'text') + ': ' + JSON.stringify(plan.literal.value)];
  if (!numeric) {
    lines.push('Original characters with positions in FORWARD order: ' + plan.literal.characters
      .map((character,index) => index + ':' + JSON.stringify(character)).join(' '));
    lines.push('Original character count: ' + plan.literal.characters.length);
  }
  for (const [index, step] of plan.steps.entries()) lines.push('Operation ' + (index + 1) + ': ' + operation(step.rule));
  return lines.join('\n');
}

function operation(rule) {
  if (!rule) return 'UNKNOWN OPERATION. Definition is missing.';
  if (rule.kind === 'affine') return 'Multiply the current number by (' + rule.a + '), then add (' + rule.b + ').';
  return (rule.reverse ? 'Reverse EVERY current character, including digits.' : 'Keep current characters in their original order.')
    + (rule.upper ? ' Then uppercase every letter.' : ' Preserve letter case.')
    + ' Then add prefix ' + JSON.stringify(rule.prefix) + ' and suffix ' + JSON.stringify(rule.suffix)
    + ' around the entire result exactly once.';
}

module.exports = { instruction, message };
