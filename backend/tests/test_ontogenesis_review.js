'use strict';

const assert = require('assert');
const review = require('../src/services/ontogenesis/reviewPolicy');
const { defaultConfig, validateProjectConfig } = require('../src/services/ontogenesis/configSchema');

// Classification de réversibilité.
assert.strictEqual(review.classifyAction({ scope: 'edit' }), 'reversible');
assert.strictEqual(review.classifyAction({ scope: 'test' }), 'reversible');
assert.strictEqual(review.classifyAction({ scope: 'commit' }), 'irreversible');
assert.strictEqual(review.classifyAction({ scope: 'push' }), 'external');
assert.strictEqual(review.classifyAction({ scope: 'merge' }), 'external');

// Les commits locaux explicitement autorisés passent ; l'externe reste refusé.
const config = defaultConfig();
assert.deepStrictEqual(review.reviewAction(config, { scope: 'edit', branch: 'codex/ontogenesis', path: 'a.js' }).verdict, 'proceed');
assert.deepStrictEqual(review.reviewAction(config, { scope: 'commit', branch: 'codex/ontogenesis' }).verdict, 'proceed');
assert.deepStrictEqual(review.reviewAction(config, { scope: 'push', branch: 'codex/ontogenesis' }).verdict, 'denied');

// Hors périmètre → approbation, pas exécution.
const outside = review.reviewAction(config, { scope: 'edit', branch: 'main', path: 'a.js' });
assert.deepStrictEqual(outside, { verdict: 'ask_first', reason: 'branche-hors-perimetre', reversibility: 'reversible' });

// Règle la plus spécifique gagne ; les 4 niveaux s'appliquent.
const ruled = defaultConfig();
ruled.authority.rules = [
  { match: { scope: 'test' }, policy: 'ask_first' },
  { match: { scope: 'test', branch: 'codex/ontogenesis' }, policy: 'allow' },
  { match: { scope: 'edit', pathPrefix: 'docs/' }, policy: 'hand_off' }
];
assert.strictEqual(review.reviewAction(ruled, { scope: 'test', branch: 'codex/ontogenesis' }).verdict, 'proceed');
assert.strictEqual(review.reviewAction(ruled, { scope: 'test', branch: 'autre' }).verdict, 'ask_first');
assert.strictEqual(review.reviewAction(ruled, { scope: 'edit', branch: 'codex/ontogenesis', path: 'docs/a.md' }).verdict, 'handoff');
const onRequest = defaultConfig();
onRequest.authority.rules = [{ match: { scope: 'commit' }, policy: 'on_request' }];
assert.strictEqual(review.reviewAction(onRequest, { scope: 'commit', branch: 'codex/ontogenesis' }).verdict, 'proceed_if_requested');

// Schéma : règles validées, politique inconnue rejetée.
assert.strictEqual(validateProjectConfig({}).ok, true);
assert.ok(validateProjectConfig({ authority: { branches: [], paths: [], rules: [{ policy: 'nimporte' }] } }).errors.includes('authority.regle-politique-inconnue'));

console.log('ontogenesis review checks passed.');
