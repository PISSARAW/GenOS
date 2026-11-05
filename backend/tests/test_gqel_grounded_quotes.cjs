'use strict';
const assert = require('node:assert/strict');
const Ajv = require('ajv');
const { quoteCandidates } = require('../src/services/qualityElevation/qualityQuoteCandidates');
const { reviewSchema, comparisonSchema } = require('../src/services/qualityElevation/qualitySchemas');
const { validateReview } = require('../src/services/qualityElevation/qualityReviewService');
const artifact = 'INT. ATELIER - JOUR\nNora verrouille la vanne. Le témoin devient vert.\n' + 'Un geste précis change la situation. '.repeat(30);
const criterion = { id: 'causal_chain', kind: 'hard', description: 'Vérifier la conséquence.' };
const candidates = quoteCandidates(artifact);
assert.ok(candidates.length > 3);
assert.ok(candidates.every(quote => quote.length >= 8 && quote.length <= 160 && artifact.includes(quote)));
assert.ok(candidates.includes('Nora verrouille la vanne.'), 'A complete source sentence must be selectable without copying adjacent sentences.');
const planText = JSON.stringify({ rules: ['La porte exige une signature vérifiée.'], scenes: [{ decision: 'Nora ferme la vanne.' }] });
assert.ok(quoteCandidates(planText).includes('La porte exige une signature vérifiée.'), 'Plan string values must be selectable without JSON field boundaries.');
const escapedPlan = JSON.stringify({ decision: 'Nora dit "fermez" puis recule.\nLa porte se ferme.' });
assert.ok(quoteCandidates(escapedPlan).every(quote => escapedPlan.includes(quote)), 'JSON escapes must retain their exact source representation.');
const check = { checks: [{ criterionId: criterion.id, verdict: 'pass', reason: 'Une conséquence observable est décrite.',
  evidence: [{ quote: candidates[1] }], rating: null }] };
const validate = new Ajv({ strict: false }).compile(reviewSchema([criterion], artifact));
assert.equal(validate(check), true);
const indexed = { checks: [{ ...check.checks[0], evidence: [{ quoteId: 1 }] }] };
assert.equal(validate(indexed), true);
assert.equal(validateReview(indexed, [criterion], artifact)[0].evidence[0].quote, candidates[1]);
const nativeValidate = new Ajv({ strict: false }).compile(reviewSchema([criterion], artifact, { indexedQuotes: true }));
assert.equal(nativeValidate(indexed), true);
assert.equal(nativeValidate(check), false, 'Native index transport must not resend the full quotation enum or accept literal text.');
assert.ok(Buffer.byteLength(JSON.stringify(reviewSchema([criterion], artifact, { indexedQuotes: true }))) < Buffer.byteLength(JSON.stringify(reviewSchema([criterion], artifact))));
indexed.checks[0].evidence = [{ quoteId: candidates.length }];
assert.equal(validate(indexed), false);
assert.throws(() => validateReview(indexed, [criterion], artifact), { code: 'GQEL_REVIEW_UNGROUNDED' });
indexed.checks[0].evidence = [{ quoteId: 1, quote: candidates[1] }];
assert.equal(validate(indexed), false);
assert.throws(() => validateReview(indexed, [criterion], artifact), { code: 'GQEL_REVIEW_INVALID' });
check.checks[0].evidence[0].quote = 'Le but de la mission est de récupérer un objet inconnu.';
assert.equal(validate(check), false, 'Native output grammar cannot select an invented quotation.');
assert.throws(() => validateReview(check, [criterion], artifact), { code: 'GQEL_REVIEW_UNGROUNDED' });
check.checks[0].verdict = 'unknown'; check.checks[0].evidence = [];
assert.equal(validate(check), true);
assert.equal(validateReview(check, [criterion], artifact)[0].verdict, 'unknown');
const comparison = new Ajv({ strict: false }).compile(comparisonSchema({ A: artifact, B: 'EXT. PORT - JOUR\nNora abandonne la vanne.' }));
const value = { preferred: 'B', reason: 'Préférence synthétique sans revendication artistique.', evidence: {
  A: { quote: candidates[1] }, B: { quote: 'Nora abandonne la vanne.' } } };
assert.equal(comparison(value), true);
value.evidence.B.quote = candidates[1];
assert.equal(comparison(value), false, 'The quote for each label is bound to that label, not the other artifact.');
function sharedQuoteRegression() {
  const longArtifact = Array.from({ length: 100 }, (_, i) => `Scène ${i} : Nora ferme la vanne ${i} et vérifie le témoin avant de reculer. `).join('\n');
  const criteria = Array.from({ length: 11 }, (_, i) => ({ id: `criterion_${i}`, kind: i ? 'hard' : 'soft' }));
  const schema = reviewSchema(criteria, longArtifact), expanded = JSON.parse(JSON.stringify(schema));
  for (const variant of expanded.properties.checks.items.oneOf) variant.properties.evidence.items = schema.$defs.sourceQuote;
  delete expanded.$defs;
  const ajv = new Ajv({ strict: false }), compactCheck = ajv.compile(schema), expandedCheck = ajv.compile(expanded);
  const valid = { checks: criteria.map(c => ({ criterionId: c.id, verdict: 'pass', reason: 'Un geste matériel est visible.',
    evidence: [{ quote: quoteCandidates(longArtifact)[0] }], rating: c.kind === 'soft' ? 4 : null })) };
  const mutate = change => { const candidate = JSON.parse(JSON.stringify(valid)); change(candidate.checks[0]); return candidate; };
  const cases = [valid, mutate(c => { c.verdict = 'unknown'; c.rating = null; c.evidence = []; }),
    mutate(c => { c.evidence = []; }), mutate(c => { c.evidence[0].quote = 'Une citation inventée et absente.'; }),
    mutate(c => { c.rating = 5; }), mutate(c => { c.extra = true; }), mutate(c => { c.criterionId = 'absent'; })];
  assert.deepEqual(cases.map(c => compactCheck(c)), [true, true, false, false, false, false, false]);
  assert.deepEqual(cases.map(c => compactCheck(c)), cases.map(c => expandedCheck(c)), 'Factoring preserves the expanded grammar.');
  assert.ok(Buffer.byteLength(JSON.stringify(schema)) < Buffer.byteLength(JSON.stringify(expanded)) / 5,
    'Full-text citations must be encoded once rather than twice per criterion.');
}
sharedQuoteRegression();
console.log('PASS grounded quote schemas: full-text locations, invented text, unknown verdict and label separation.');
async function offTopic() {
  const { compileQualityContract, executeElevationLoop } = require('../src/services/qualityElevation/qualityElevationService');
  const brief = 'Écrire une scène de sauvetage dans une station orbitale, avec deux officiers.';
  const delivered = 'INT. JARDIN - JOUR\nNora arrose les tomates. La terre absorbe l’eau et les feuilles se redressent.';
  const contract = compileQualityContract({ domain: 'generic', mission: brief, policy: 'fast',
    requireCalibration: false, maxIterations: 1 });
  const metered = content => ({ content, usage: { inputTokens: 10, outputTokens: 20 }, finishReason: 'stop', model: 'synthetic:review' });
  const result = await executeElevationLoop({ contract, generator: async () => metered(delivered), reviewers: [{
    id: 'reader', model: 'synthetic:review', review: async request => {
      const data = JSON.parse(request.prompt.slice(request.prompt.indexOf('\n') + 1));
      assert.equal(data.brief, brief, 'The complete real brief must reach the independent reader.');
      assert.ok(Object.values(data.quoteCandidates).every(quote => delivered.includes(quote)));
      return metered({ checks: data.criteria.map(c => ({ criterionId: c.id,
        verdict: c.id === 'brief_coverage' ? 'fail' : 'pass', rating: c.kind === 'soft' ? 4 : null,
        reason: 'Fixture hors sujet : jardin au lieu du sauvetage orbital commandé.',
        evidence: [{ quote: data.quoteCandidates[1] }] })) });
    } }] });
  assert.equal(result.promoted, false);
  assert.ok(result.bestVersion.defects.some(d => d.code === 'CRITERION_brief_coverage'));
  await codeQuoteTransport(compileQualityContract);
  console.log('PASS real brief is available but non-citable; an off-topic fixture cannot pass its hard criterion (synthetic review).');
}
async function codeQuoteTransport(compileQualityContract) {
  const content = 'function add(left, right) { return left + right; }';
  const contract = compileQualityContract({ domain: 'code', mission: 'Implement addition.', policy: 'fast', requireCalibration: false });
  await require('../src/services/qualityElevation/qualityReviewService').assessArtifact({ contract, content,
    scan: { defects: [], metrics: {} }, invoke: async (callback, request) => callback(request),
    reviewers: [{ id: 'code-reader', model: 'synthetic:code-review', review: async request => {
      assert.ok(request.prompt.includes('"evidence":[{"quote":"..."}]'));
      const response = { checks: contract.criteria.map(c => ({ criterionId: c.id, verdict: 'pass',
        reason: 'The supplied function adds its two operands.', evidence: [{ quote: content }], rating: c.kind === 'soft' ? 4 : null })) };
      assert.equal(new Ajv({ strict: false }).compile(request.responseSchema)(response), true,
        'The existing native code prompt must retain its matching literal-quote grammar.');
      return response;
    } }] });
}
offTopic().catch(error => { console.error(error); process.exitCode = 1; });
