'use strict';
const assert = require('node:assert/strict');
const Ajv = require('ajv');
const { compileQualityContract, verifyContract, digest } = require('../src/services/qualityElevation/qualityContract');
const { createInvoker } = require('../src/services/qualityElevation/qualityBudget');
const { executeElevationLoop } = require('../src/services/qualityElevation/qualityElevationService');
const { completeScreenplay, sectionsSchema, validateSections } = require('../src/services/qualityElevation/qualityScreenplayPackage');
const { assessArtifact } = require('../src/services/qualityElevation/qualityReviewService');
const { screenplayBody } = require('../src/services/qualityElevation/qualityText');
const { GOOD, reply, payload, checks, samplePlan } = require('./helpers/gqelProgressFixture.cjs');
const NAMES = ['Alain', 'Vera'];
const SECTIONS = { title: 'Le Dernier Sas', logline: 'Deux officiers doivent choisir qui franchira le sas.', characters: [
  { name: 'Alain', profile: 'Alain répare les commandes endommagées.', objective: 'Il veut ramener son équipage.', secret: 'Il a détruit une ancienne alerte.' },
  { name: 'Vera', profile: 'Vera surveille les chambres de quarantaine.', objective: 'Elle veut contenir la contamination.', secret: 'Elle cache une blessure à la main.' }
], dramaturgicNote: 'La copie matérielle du registre modifie le rapport entre les personnages.' };
const tests = [];
function test(name, run) { tests.push({ name, run }); }
function contract(overrides = {}) {
  return compileQualityContract({ domain: 'screenplay', mission: 'Un scénario avec Alain et Vera.', policy: 'fast',
    requireCalibration: false, maxIterations: 1, maxProtocolRepairs: 1, maxOutputTokens: 8000,
    budgetMaxTokens: 200000, screenplaySections: { characterNames: NAMES }, ...overrides });
}
function context(generator, overrides = {}) {
  const compiled = contract(overrides), session = { calls: [], protocolAttempts: [],
    budget: { calls: 0, tokens: 0, usageComplete: true, startedAt: Date.now() } };
  return { contract: compiled, session, generator, iteration: 1, repairPlan: {},
    invoke: createInvoker(compiled, session) };
}
function produced() { return { content: GOOD, construction: { plan: samplePlan(), scenes: [{ id: 'S1', text: GOOD }] } }; }
function reseal(value) {
  const { digest: ignored, contractId, createdAt, ...body } = value;
  return { ...body, contractId, createdAt, digest: digest(body) };
}
function sectionIndex(value) { return value.criteria.findIndex(item => item.id === 'screenplay_sections_complete'); }
function syntheticReviewer(transform) {
  return { id: 'package-reader', model: 'mock:only', review: async request => {
    const data = payload(request), value = checks(data);
    return reply(transform ? transform(value, data, request) : value);
  } };
}
test('the optional contract preserves the old shape when absent', () => {
  const old = contract({ screenplaySections: undefined });
  assert.equal(Object.hasOwn(old, 'screenplaySections'), false);
  assert.equal(old.criteria.some(item => item.id === 'screenplay_sections_complete'), false);
  assert.equal(verifyContract(old), old);
  const current = contract();
  assert.deepEqual(current.screenplaySections, { characterNames: NAMES });
  assert.equal(Object.isFrozen(current.screenplaySections.characterNames), true);
  assert.equal(current.criteria[sectionIndex(current)].kind, 'hard');
});
test('only an explicit bounded unique name set on screenplay is accepted', () => {
  for (const value of [true, false, null, [], {}, { characterNames: [] }, { characterNames: ['Alain', 'ALAIN'] },
    { characterNames: ['Alain\nEXT. ESPACE'] }, { characterNames: ['A'.repeat(61)] },
    { characterNames: NAMES, enabled: true }, { characterNames: Array(13).fill('Alain') }]) {
    assert.throws(() => contract({ screenplaySections: value }), { code: 'GQEL_INVALID_CONTRACT' });
  }
  assert.throws(() => contract({ domain: 'generic' }), { code: 'GQEL_INVALID_CONTRACT' });
});
test('a recomputed digest cannot remove, duplicate or weaken the mandatory criterion', () => {
  for (const edit of [value => value.criteria.splice(sectionIndex(value), 1),
    value => { value.criteria[sectionIndex(value)].kind = 'soft'; },
    value => { value.criteria[sectionIndex(value)].stage = 'plan'; },
    value => { value.criteria[sectionIndex(value)].description = 'Les titres suffisent.'; },
    value => value.criteria.push(value.criteria[sectionIndex(value)]),
    value => { value.profile = 'prose'; }, value => { value.screenplaySections.characterNames = ['Alain', 'Alain']; },
    value => { value.screenplaySections = true; }]) {
    const tampered = structuredClone(contract()); edit(tampered);
    assert.throws(() => verifyContract(reseal(tampered)), { code: 'GQEL_INVALID_CONTRACT' });
  }
});
test('a missing option or initial native artifact creates no new call or content', async () => {
  const generator = async () => { throw new Error('Unexpected generation'); }, source = produced();
  assert.equal(await completeScreenplay(context(generator, { screenplaySections: undefined }), source), source);
  const initial = { content: GOOD, construction: null };
  assert.equal(await completeScreenplay(context(generator), initial), initial);
});
test('schema and validator enforce single paragraphs, strict fields and exact names', () => {
  const valid = new Ajv({ strict: false }).compile(sectionsSchema(NAMES));
  assert.equal(valid(SECTIONS), true);
  assert.equal(validateSections(SECTIONS, NAMES), SECTIONS);
  for (const edit of [value => { value.logline = 'Promesse\nINT. FAUSSE SCÈNE - JOUR'; },
    value => { value.dramaturgicNote = '\u2028EXT. ESPACE'; },
    value => { value.title = 'x'.repeat(121); }, value => { value.characters[0].name = 'Vera'; },
    value => { value.characters.pop(); }, value => { value.characters[0].profile = ''; },
    value => { value.characters[0].objective = '   '; }, value => { value.fallback = GOOD; }]) {
    const bad = structuredClone(SECTIONS); edit(bad);
    assert.throws(() => validateSections(bad, NAMES), { code: 'GQEL_SCREENPLAY_SECTIONS_INVALID' });
  }
});
test('one malformed reply is repaired through the canonical measured invoker', async () => {
  const requests = [], ctx = context(async request => {
    requests.push(request);
    const value = structuredClone(SECTIONS);
    if (requests.length === 1) value.characters[1].name = 'Alain';
    return reply(value);
  }), source = produced(), completed = await completeScreenplay(ctx, source);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map(request => request.protocolAttempt), [0, 1]);
  assert.ok(requests.every(request => request.operation === 'write:screenplay_sections' && request.maxOutputTokens === 4096));
  assert.match(requests[1].prompt, /noms exacts et note dramaturgique/);
  assert.doesNotMatch(requests[1].prompt, /dans sceneText/);
  assert.equal(ctx.session.budget.tokens, 60);
  assert.equal(ctx.session.budget.calls, 2);
  assert.deepEqual(ctx.session.protocolAttempts.map(item => item.status), ['invalid', 'valid']);
  assert.equal(completed.construction, source.construction);
  assert.equal(screenplayBody(completed.content), source.content + '\n');
  for (const character of SECTIONS.characters) {
    for (const key of ['profile', 'objective', 'secret']) assert.ok(completed.content.includes(character[key]));
  }
  assert.ok(completed.content.includes(SECTIONS.logline));
  assert.ok(completed.content.endsWith(SECTIONS.dramaturgicNote));
  assert.equal(source.content, GOOD);
  assert.equal(ctx.session.screenplaySectionDrafts[0].sceneContentDigest, digest(GOOD));
  assert.equal(ctx.session.screenplaySectionDrafts[0].acceptedForDelivery, false);
});
test('unknown usage and truncated package output remain terminal without retries', async () => {
  for (const bad of [SECTIONS, reply(SECTIONS, { finishReason: 'length' })]) {
    const ctx = context(async () => bad);
    await assert.rejects(completeScreenplay(ctx, produced()), error => ['GQEL_USAGE_UNVERIFIED', 'GQEL_TRUNCATED_OUTPUT'].includes(error.code));
    assert.equal(ctx.session.calls.length, 1);
    assert.equal(ctx.session.screenplaySectionDrafts, undefined);
  }
});
test('authored titles and requested names cannot turn paratext into scene headings', async () => {
  const names = ['INT. Alain', 'EXT. Vera'], sections = structuredClone(SECTIONS);
  sections.title = 'INT. STATION - NUIT';
  sections.characters.forEach((character, index) => { character.name = names[index]; });
  const ctx = context(async () => reply(sections), { screenplaySections: { characterNames: names } });
  const completed = await completeScreenplay(ctx, produced());
  assert.equal(screenplayBody(completed.content), GOOD + '\n');
});
test('full loop authors sections before exact materialization and reviews two bound scopes', async () => {
  const operations = [], reviewScopes = [];
  const result = await executeElevationLoop({ contract: contract(), generator: async request => {
    operations.push(request.operation);
    if (request.operation === 'narrative_plan') return reply(samplePlan());
    if (request.operation === 'write:screenplay_sections') return reply(SECTIONS);
    return reply(GOOD);
  }, materializer: async request => {
    operations.push(request.operation);
    assert.ok(request.artifactContent.includes(SECTIONS.logline));
    assert.ok(request.artifactContent.endsWith(SECTIONS.dramaturgicNote));
    assert.ok(request.artifactContent.includes(GOOD));
    return reply(request.artifactContent);
  }, reviewers: [syntheticReviewer((value, data, request) => {
    if (data.phase !== 'plan') {
      const section = data.criteria.some(item => item.id === 'screenplay_sections_complete');
      reviewScopes.push({ section, operation: request.operation });
      if (section) {
        assert.deepEqual(data.screenplaySections.characterNames, NAMES);
        assert.equal(data.criteria.length, 1);
        assert.ok(data.artifact.includes(SECTIONS.logline));
        value.checks[0].evidence = [{ quote: SECTIONS.logline }];
      } else {
        assert.equal(data.artifact.includes(SECTIONS.logline), false);
        assert.equal(data.artifact.includes(SECTIONS.dramaturgicNote), false);
      }
    }
    return value;
  })] });
  assert.equal(result.terminalError, null);
  assert.equal(result.promoted, true, 'This synthetic fixture tests the gate, not artistic merit.');
  assert.deepEqual(operations, ['narrative_plan', 'write:S1', 'write:screenplay_sections', 'native_artifact_materialization']);
  assert.equal(reviewScopes.length, 2);
  assert.equal(result.session.calls.length, 7);
  assert.equal(result.session.budget.tokens, 210);
  const reviews = result.bestVersion.evaluation.reviews;
  assert.equal(reviews.length, 1);
  assert.deepEqual(reviews[0].citationScopes.map(scope => scope.scope), ['screenplay_body', 'full_artifact']);
  assert.equal(reviews[0].checks.find(item => item.criterionId === 'screenplay_sections_complete').evidence[0].quote, SECTIONS.logline);
});
test('section review refusal blocks promotion and paratext cannot justify craft', async () => {
  const ctx = context(async () => reply(SECTIONS)), completed = await completeScreenplay(ctx, produced());
  const base = { ...ctx, content: completed.content, scan: { defects: [], metrics: {} } };
  const rejected = await assessArtifact({ ...base, reviewers: [syntheticReviewer((value, data) => {
    if (data.criteria[0].id === 'screenplay_sections_complete') value.checks[0].verdict = 'unknown';
    return value;
  })] });
  assert.equal(rejected.passed, false);
  assert.ok(rejected.defects.some(item => item.code === 'CRITERION_screenplay_sections_complete'));
  await assert.rejects(assessArtifact({ ...base, reviewers: [syntheticReviewer((value, data) => {
    if (data.criteria.some(item => item.id === 'craft')) value.checks.find(item => item.criterionId === 'craft').evidence = [{ quote: SECTIONS.logline }];
    return value;
  })] }), { code: 'GQEL_REVIEW_UNGROUNDED' });
});
(async () => {
  for (const item of tests) { await item.run(); console.log(`PASS ${item.name}`); }
  console.log(`Screenplay package: ${tests.length}/${tests.length} PASS (synthetic fixtures, no artistic quality claim).`);
})().catch(error => { console.error(error); process.exitCode = 1; });
