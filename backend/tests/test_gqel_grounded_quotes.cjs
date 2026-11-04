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
const check = { checks: [{ criterionId: criterion.id, verdict: 'pass', reason: 'Une conséquence observable est décrite.',
  evidence: [{ quote: candidates[1] }], rating: null }] };
const validate = new Ajv({ strict: false }).compile(reviewSchema([criterion], artifact));
assert.equal(validate(check), true);
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
      assert.ok(data.quoteCandidates.every(quote => delivered.includes(quote)));
      return metered({ checks: data.criteria.map(c => ({ criterionId: c.id,
        verdict: c.id === 'brief_coverage' ? 'fail' : 'pass', rating: c.kind === 'soft' ? 4 : null,
        reason: 'Fixture hors sujet : jardin au lieu du sauvetage orbital commandé.',
        evidence: [{ quote: data.quoteCandidates[1] }] })) });
    } }] });
  assert.equal(result.promoted, false);
  assert.ok(result.bestVersion.defects.some(d => d.code === 'CRITERION_brief_coverage'));
  console.log('PASS real brief is available but non-citable; an off-topic fixture cannot pass its hard criterion (synthetic review).');
}
offTopic().catch(error => { console.error(error); process.exitCode = 1; });
