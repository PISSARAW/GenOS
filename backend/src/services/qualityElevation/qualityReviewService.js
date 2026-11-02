'use strict';
const { digest, freeze, fail } = require('./qualityContract');
const { defect, location, screenplayBody } = require('./qualityText');
const { validatedCall } = require('./qualityProtocol');
const { reviewSchema } = require('./qualitySchemas');
const { reviewPrompt } = require('./qualityReviewPrompt');
const issued = new WeakSet();
const CALIBRATION = Object.freeze([
  { id: 'absence', phase: 'artifact', criterion: 'enacted', text: 'INT. ARCHIVES - NUIT\nUne confrontation révèle la preuve et libère Inès. La scène est émouvante.', expected: 'fail' },
  { id: 'enacted', phase: 'artifact', criterion: 'enacted', text: 'INT. ARCHIVES - NUIT\nInès glisse la copie sous la vitre. Le gardien compare la signature au registre, déverrouille la porte et recule. Inès franchit le seuil.', expected: 'pass' },
  { id: 'shared_goal', phase: 'plan', criterion: 'character_actions', text: 'Alain et Vera veulent sauver l’équipage. Alain veut ouvrir immédiatement pour évacuer ; Vera veut maintenir la porte fermée car elle connaît le risque de contamination. Alain saisit la commande ; Vera bloque son accès. Leurs informations et choix diffèrent.', expected: 'pass' },
  { id: 'plan_summary', phase: 'plan', criterion: 'causal_chain', text: 'Règle : la serrure exige une signature vérifiée. Scène prévue : Inès apporte le registre ; le gardien compare la signature, puis ouvre. Conséquence prévue : Inès peut sortir. Ceci est un plan à développer, pas une scène finale.', expected: 'pass' }
]);
function parseObject(value) {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value;
  const text = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch (_) { /* Parsing is not permission to invent missing evidence. */ }
  throw fail('GQEL_REVIEW_INVALID', 'Expected a complete JSON object.');
}
function citations(evidence, text) {
  if (!Array.isArray(evidence)) throw fail('GQEL_REVIEW_INVALID', 'Evidence list missing.');
  return evidence.map(item => {
    const quote = typeof item === 'string' ? item : item?.quote;
    if (typeof quote !== 'string' || quote.trim().length < 8) throw fail('GQEL_REVIEW_INVALID', 'A substantive exact quotation is required.');
    // Only trimming the boundary is permitted. NEVER accept a shared subphrase.
    const trimmed = quote.trim(), unpunct = trimmed.replace(/[.,;:]+$/, '');
    const found = location(text, quote) || location(text, trimmed) || (unpunct.length >= 8 ? location(text, unpunct) : null);
    if (!found) throw fail('GQEL_REVIEW_UNGROUNDED', `Complete quotation absent from artifact: ${JSON.stringify(quote)}`);
    return found;
  });
}
function validateVerdict(check) {
  if (!check || !['pass', 'fail', 'unknown'].includes(check.verdict)) throw fail('GQEL_REVIEW_INVALID', 'Criterion verdict missing.');
  if (typeof check.reason !== 'string' || check.reason.trim().length < 10) throw fail('GQEL_REVIEW_INVALID', 'Reasoned assessment required.');
}
function validateRating(check, criterion) {
  if (criterion.kind !== 'soft') return null;
  if (check.verdict === 'unknown') return null;
  if (!Number.isInteger(check.rating) || check.rating < 0 || check.rating > 4) throw fail('GQEL_REVIEW_INVALID', 'Soft rating must be an integer from 0 to 4.');
  return check.rating;
}
function validateCheck(check, criterion, text) {
  validateVerdict(check);
  const evidence = citations(check.evidence, text);
  if (check.verdict !== 'unknown' && !evidence.length) throw fail('GQEL_REVIEW_UNGROUNDED', 'Decisive verdict requires a location.');
  return { criterionId: criterion.id, verdict: check.verdict, reason: check.reason, evidence, rating: validateRating(check, criterion) };
}
function validateReview(value, criteria, text) {
  const parsed = parseObject(value);
  if (!Array.isArray(parsed.checks) || parsed.checks.length !== criteria.length) throw fail('GQEL_REVIEW_INCOMPLETE', 'Every fixed criterion must be assessed exactly once.');
  const ids = parsed.checks.map(check => check.criterionId);
  if (new Set(ids).size !== ids.length) throw fail('GQEL_REVIEW_INVALID', 'Duplicate criterion.');
  return criteria.map(criterion => validateCheck(parsed.checks.find(check => check.criterionId === criterion.id), criterion, text));
}
function dependencyGroupCount(reviewers) {
  const clusters = [];
  for (const item of reviewers) {
    const related = clusters.filter(group => group.some(other => other.model === item.model || other.dependencyGroup === item.dependencyGroup));
    const merged = [item, ...related.flat()];
    for (const group of related) clusters.splice(clusters.indexOf(group), 1);
    clusters.push(merged);
  }
  return clusters.length;
}
function reviewerMetadata(reviewer) {
  if (!reviewer?.id || !reviewer.model || typeof reviewer.review !== 'function') throw fail('GQEL_REVIEWER_INVALID', 'Configured reviewer identity, model and callback required.');
  return { id: reviewer.id, model: reviewer.model, dependencyGroup: reviewer.dependencyGroup || reviewer.model, focus: reviewer.focus || 'general' };
}
function controlCriteria(sample) {
  const descriptions = {
    enacted: 'La sortie est montrée par des actions concrètes, pas seulement annoncée.',
    character_actions: 'Les informations, moyens ou risques conduisent à des décisions distinctes ; partager un objectif est autorisé.',
    causal_chain: 'Les règles et conséquences prévues forment une chaîne cohérente ; un plan peut résumer ses scènes.'
  };
  return [{ id: sample.criterion, kind: 'hard', description: descriptions[sample.criterion] }];
}
async function reviewedChecks(reviewer, context, input) {
  const request = { operation: input.operation, expectedModel: reviewer.model,
    responseSchema: reviewSchema(input.criteria), prompt: reviewPrompt(input.data) };
  return validatedCall({ ...context, callback: reviewer.review }, request,
    response => validateReview(response, input.criteria, input.text));
}
async function calibrateReviewer(reviewer, context) {
  const metadata = reviewerMetadata(reviewer), receipts = [];
  for (const sample of CALIBRATION) {
    const criteria = controlCriteria(sample);
    const checks = await reviewedChecks(reviewer, context, { operation: 'reviewer_control', criteria, text: sample.text,
      data: { mission: 'Contrôle borné du lecteur.', phase: sample.phase, criteria, artifact: sample.text } });
    receipts.push({ id: sample.id, artifactDigest: digest(sample.text), checks, passed: checks[0].verdict === sample.expected });
  }
  return freeze({ ...metadata, controlVersion: 'gqel-control-v2.1', passed: receipts.every(item => item.passed), receipts,
    scope: 'four_smoke_controls_not_general_calibration' });
}
async function runReview(reviewer, context) {
  const metadata = reviewerMetadata(reviewer);
  const checks = await reviewedChecks(reviewer, context, { operation: `review:${metadata.id}`, criteria: context.criteria, text: context.text,
    data: { mission: context.contract.mission, phase: context.phase || 'artifact', focus: metadata.focus,
      targetMinutes: context.contract.targetMinutes, criteria: context.criteria, artifact: context.text } });
  return freeze({ ...metadata, artifactDigest: context.artifactDigest, contractDigest: context.contract.digest,
    checks, method: 'fresh_context_grounded_review', issuedAt: new Date().toISOString() });
}
function checksFor(criterion, reviews) { return reviews.map(review => review.checks.find(check => check.criterionId === criterion.id)); }
function reviewDefects(criteria, reviews) {
  return criteria.flatMap(criterion => {
    const checks = checksFor(criterion, reviews);
    if (checks.length && checks.every(check => check.verdict === 'pass')) return [];
    const rejected = checks.filter(check => check.verdict !== 'pass');
    return [defect(`CRITERION_${criterion.id}`, rejected.map(check => check.reason).join('\n') || 'Critère non vérifié.',
      { stage: criterion.stage, section: criterion.id, severity: criterion.kind === 'hard' ? 'major' : 'minor',
        evidence: rejected.flatMap(check => check.evidence) })];
  });
}
function softScore(criteria, reviews) {
  const soft = criteria.filter(criterion => criterion.kind === 'soft');
  if (!soft.length || !reviews.length) return null;
  if (soft.some(criterion => checksFor(criterion, reviews).some(check => check.rating === null))) return null;
  const ratings = soft.map(criterion => Math.min(...checksFor(criterion, reviews).map(check => check.rating)));
  const anchors = [0, 25, 50, 80, 100];
  return ratings.reduce((sum, value) => sum + anchors[value], 0) / ratings.length;
}
function scoreDefect(score, input) {
  if (score === null || score >= input.contract.threshold) return [];
  const softIds = new Set(input.criteria.filter(item => item.kind === 'soft').map(item => item.id));
  const checks = input.reviews.flatMap(review => review.checks.filter(check => softIds.has(check.criterionId)));
  return [defect('CRAFT_BELOW_THRESHOLD', 'Qualité rédactionnelle sous le seuil. ' + checks.map(check => check.reason).join('\n'),
    { section: 'craft', severity: 'minor', evidence: checks.flatMap(check => check.evidence) })];
}
function citationScope(input) { return input.contract.profile === 'screenplay' && input.phase !== 'plan' ? 'screenplay_body' : 'full_artifact'; }
async function assessArtifact(context) {
  const contract = context.contract, scan = context.scan, content = context.content;
  const text = citationScope(context) === 'screenplay_body' ? screenplayBody(content) : content;
  const artifactDigest = digest(content), criteria = context.criteria || contract.criteria;
  const reviews = [];
  for (const reviewer of context.reviewers) {
    reviews.push(await runReview(reviewer, { ...context, contract, criteria, text, artifactDigest }));
  }
  const defects = [...scan.defects, ...reviewDefects(criteria, reviews)];
  const score = softScore(criteria, reviews);
  defects.push(...scoreDefect(score, { contract, criteria, reviews }));
  const passed = defects.length === 0 && (score === null || score >= contract.threshold);
  const evaluation = freeze({ schema: 'genos.gqel-assessment/v2', assessmentId: require('node:crypto').randomUUID(),
    contractDigest: contract.digest, artifactDigest, phase: context.phase || 'artifact', passed, score, overallScore: score, defects, reviews,
    metrics: scan.metrics, issuedAt: new Date().toISOString() });
  issued.add(evaluation);
  return evaluation;
}
function isIssuedAssessment(value) { return issued.has(value); }
module.exports = { parseObject, citations, validateReview, calibrateReviewer, assessArtifact, isIssuedAssessment,
  reviewerMetadata, dependencyGroupCount, CALIBRATION, reviewPrompt };
