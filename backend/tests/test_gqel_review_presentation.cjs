'use strict';
const assert = require('node:assert/strict');
const { compactReview, sourceView } = require('../src/services/qualityElevation/qualityReviewPresentation');
const { quoteCandidates } = require('../src/services/qualityElevation/qualityQuoteCandidates');
const { reviewSchema } = require('../src/services/qualityElevation/qualitySchemas');
const { validateReview } = require('../src/services/qualityElevation/qualityReviewService');
const { digest } = require('../src/services/qualityElevation/qualityContract');

function restored(view) {
  const escaped = view.markerPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return view.text.replace(new RegExp(escaped + '\\d+\\]', 'g'), '');
}
for (const source of ['  ALAIN\nUne décision concrète change la situation.\r\nVERA\nJe vérifie la porte.\n',
  'Une donnée [q17] appartient au texte. Émoji : 🌍.\n\nLa porte se ferme.']) {
  const quotes = quoteCandidates(source), view = sourceView(source, quotes);
  assert.equal(restored(view), source, 'Every original character and newline must survive the presentation.');
  assert.equal(Buffer.from(restored(view)).equals(Buffer.from(source)), true);
}
assert.throws(() => sourceView('Une source complète.', ['Une invention absente.']), { code: 'GQEL_REVIEW_UNGROUNDED' });
const artifact = Array.from({ length: 160 }, (_, i) => `Ligne ${i} : Alain ferme la vanne ${i} puis vérifie le témoin avant de reculer.`).join('\n');
const criteria = [{ id: 'causal_chain', kind: 'hard' }], quotes = quoteCandidates(artifact);
const data = { artifact, quoteCandidates: Object.fromEntries(quotes.map((quote, id) => [id, quote])), quoteSelection: 'index',
  criteria, brief: 'Contrôler les gestes et leurs conséquences.', focus: 'Ne pas changer la grille.' };
const request = { operation: 'review:test', prompt: 'Review only these data.\n' + JSON.stringify(data),
  responseSchema: reviewSchema(criteria, artifact, { indexedQuotes: true }) };
const next = compactReview(request), compact = JSON.parse(next.prompt.slice(next.prompt.indexOf('\n') + 1));
assert.equal(next.responseSchema, request.responseSchema);
assert.equal(compact.citationTextDigest, digest(artifact));
assert.deepEqual(compact.criteria, data.criteria);
assert.equal(compact.brief, data.brief);
assert.equal(compact.focus, data.focus);
assert.equal(restored({ text: compact.artifact, markerPrefix: compact.quotePresentation.markerPrefix }), artifact);
assert.equal(Object.hasOwn(compact, 'quoteCandidates'), false);
assert.ok(Buffer.byteLength(next.prompt) < Buffer.byteLength(request.prompt) * 0.75, 'A large source must not be sent twice.');
const check = { checks: [{ criterionId: 'causal_chain', verdict: 'pass', reason: 'Un geste produit une conséquence observable.', evidence: [{ quoteId: 17 }], rating: null }] };
assert.equal(validateReview(check, criteria, artifact)[0].evidence[0].quote, quotes[17]);
const small = { ...request, prompt: 'Review only data.\n' + JSON.stringify({ ...data, artifact: 'Un petit texte.', quoteCandidates: { 0: 'Un petit texte.' } }) };
assert.equal(compactReview(small), small);
assert.equal(compactReview({ ...request, operation: 'write:S1' }).prompt, request.prompt);
async function budgetProof() {
  const { compileQualityContract } = require('../src/services/qualityElevation/qualityContract');
  const { createInvoker } = require('../src/services/qualityElevation/qualityBudget');
  const contract = compileQualityContract({ mission: 'Review the complete source.', domain: 'generic', policy: 'fast',
    maxOutputTokens: 100, budgetMaxTokens: Buffer.byteLength(next.prompt + JSON.stringify(next.responseSchema), 'utf8') + 100 });
  const session = () => ({ calls: [], budget: { calls: 0, tokens: 0, usageComplete: true, startedAt: Date.now() } });
  let invoked = 0;
  const callback = async seen => { invoked++; assert.equal(seen.prompt, next.prompt);
    return { content: check, usage: { inputTokens: 20, outputTokens: 20 }, finishReason: 'stop', model: 'synthetic:reader' }; };
  const refused = session();
  await assert.rejects(createInvoker(contract, refused)(callback, request), { code: 'GQEL_TOKEN_BUDGET' });
  assert.equal(invoked, 0);
  const accepted = session();
  await createInvoker(contract, accepted, compactReview)(callback, request);
  assert.equal(invoked, 1);
  assert.equal(accepted.budget.tokens, 40);
  assert.equal(accepted.budget.usageComplete, true);
  console.log('Native compact review: byte-exact source, bounded IDs, unchanged rubric and budget guard PASS (synthetic transport fixture).');
}
budgetProof().catch(error => { console.error(error); process.exitCode = 1; });
