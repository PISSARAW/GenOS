'use strict';
const { digest } = require('./qualityContract');
function textOf(value) {
  if (typeof value === 'string') return value;
  if (typeof value?.candidate === 'string') return value.candidate;
  if (typeof value?.code === 'string') return value.code;
  return '';
}
function cleanLine(value) { return value.replace(/^\s*#{1,6}\s*/, '').replace(/\*\*/g, '').trim(); }
function isHeading(line) { return /^(?:\d+[.\s]+)?(?:INT\.?|EXT\.?|INT\.?\/EXT\.?)\s*[-.\s]/i.test(cleanLine(line)); }
function isEnd(line) { return /^#{1,6}\s*(?:conclusion|note|analyse|fiches?|synopsis|prémisse)/i.test(line); }
function screenplayBody(text) {
  const lines = text.split(/\r?\n/), start = lines.findIndex(isHeading);
  if (start < 0) return '';
  const tail = lines.slice(start), end = tail.findIndex((line, index) => index > 0 && isEnd(line));
  return tail.slice(0, end < 0 ? undefined : end).join('\n');
}
function scenesOf(text) {
  const scenes = [];
  for (const line of screenplayBody(text).split(/\r?\n/)) {
    if (isHeading(line)) scenes.push({ id: `S${scenes.length + 1}`, heading: cleanLine(line), lines: [] });
    else if (scenes.length) scenes[scenes.length - 1].lines.push(line);
  }
  return scenes.map(scene => ({ id: scene.id, heading: scene.heading, text: scene.lines.join('\n').trim() }));
}
function wordCount(text) { return (text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []).length; }
function location(text, quote) {
  const start = text.indexOf(quote);
  return start < 0 ? null : { start, end: start + quote.length, quote };
}
function defect(code, message, options = {}) {
  return { code, severity: options.severity || 'major', section: options.section || 'artifact',
    stage: options.stage || 'draft', message, evidence: options.evidence || [] };
}
function inspectScreenplay(text, contract = {}) {
  const body = screenplayBody(text), scenes = scenesOf(text), defects = [];
  if (!scenes.length) defects.push(defect('SCREENPLAY_BODY_MISSING', 'Continuité en scènes absente.', { stage: 'plan', severity: 'blocker' }));
  if (scenes.length < (contract.minSceneCount || 1)) defects.push(defect('SCENE_COVERAGE_MISSING', 'Nombre de scènes inférieur au contrat explicite.', { stage: 'plan' }));
  if (wordCount(body) < (contract.minBodyWords || 0)) defects.push(defect('DELIVERABLE_INCOMPLETE', 'Volume de continuité inférieur au minimum explicitement convenu.', { stage: 'scene' }));
  for (const scene of scenes) {
    if (!scene.text) defects.push(defect('EMPTY_SCENE', `Scène vide : ${scene.id}.`, { section: scene.id, stage: 'scene' }));
  }
  const cues = [...body.matchAll(/(?:la scène est intense|une confrontation[^.\n]*dévoile|après que le sas a été fermé|fait des découvertes)/gi)]
    .map(match => ({ code: 'SUMMARIZED_ACTION_SUSPECTED', evidence: location(text, match[0]), requiresSemanticReview: true }));
  return { defects, metrics: { bodyWords: wordCount(body), sceneCount: scenes.length,
    claimedDurationVerified: false, suspectedSummaries: cues }, body, scenes };
}
function structuralResult(domain, text, inspected) {
  return { domain, artifactDigest: digest(text), score: null, overallScore: null, passed: false, valid: false,
    structuralPassed: inspected.defects.length === 0, semanticStatus: 'not_evaluated',
    defects: inspected.defects, metrics: inspected.metrics, evaluatedAt: new Date().toISOString() };
}
module.exports = { textOf, cleanLine, isHeading, screenplayBody, scenesOf, wordCount, location, defect, inspectScreenplay, structuralResult };
