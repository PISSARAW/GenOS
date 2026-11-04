'use strict';
const { fail } = require('./qualityContract');
const { parseObject } = require('./qualityReviewService');
const { isHeading } = require('./qualityText');
const LINE_BREAK = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
function invalid(message) { return fail('GQEL_SCENE_INVALID', message); }
function validateLine(line, maximum) {
  if (typeof line !== 'string' || !line.trim() || [...line].length > maximum) throw invalid('Every authored line must be non-empty and within its character limit.');
  if (LINE_BREAK.test(line) || isHeading(line) || /^\s*#{1,6}/u.test(line)) throw invalid('A body line cannot inject a newline or another heading.');
}
function validateLines(value, budget) {
  if (Object.keys(value).length !== 1 || !Array.isArray(value.lines)
    || value.lines.length < 1 || value.lines.length > budget.maxLines) throw invalid('Exactly one bounded lines array is required.');
  for (const line of value.lines) validateLine(line, budget.maxLineCharacters);
  return value.lines;
}
function sceneReply(raw, input) {
  const candidate = typeof raw === 'string' && raw.trim().startsWith('{') ? parseObject(raw) : raw;
  if (!candidate || typeof candidate !== 'object' || !Object.hasOwn(candidate, 'lines')) return raw;
  const heading = input.scene.heading;
  if (typeof heading !== 'string' || LINE_BREAK.test(heading) || !isHeading(heading)) throw invalid('The planned heading must be one complete single-line scene heading.');
  const lines = validateLines(candidate, input.budget);
  return JSON.stringify({ sceneText: heading + '\n' + lines.join('\n') });
}
module.exports = { sceneReply };
