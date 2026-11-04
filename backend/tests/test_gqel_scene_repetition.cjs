'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { inspectSceneRepetition, assertSceneNovelty } = require('../src/services/qualityElevation/qualitySceneRepetition');
const { digest } = require('../src/services/qualityElevation/qualityContract');
const FIRST = 'Je sais, mais je ne peux pas laisser cela se passer.';
const SECOND = "Nous devons fermer cette porte avant que les autres ne reviennent.";
const actions = [
  'La technicienne extrait la batterie froide et pose le câble contre le cuivre de la borne.',
  'Le pilote tire son gant troué et vérifie la longueur restante du câble de secours.',
  'Elle ouvre la trappe basse avec sa clé puis recueille les deux vis dans sa paume.',
  'Une étincelle éclaire le verre fendu et dévoile le trajet de la fuite sous le panneau.',
  'Il ferme le robinet rouge et attend que le manomètre cesse enfin de tourner.',
  'Elle débranche le relais du ventilateur pour alimenter le moteur auxiliaire du dernier verrou.',
  'Il rapproche le casque de la vitre et attend le signal convenu de sa partenaire.',
  'Elle place la batterie dans le logement libre et bloque son couvercle avec le câble.',
  'Le relais colle avec un bruit sec et la lumière rouge devient une veilleuse orange.',
  'Ils tirent ensemble sur le levier et regardent la porte revenir contre son joint.'
];
const loop = 'INT. ATELIER - NUIT\n' + (`ALAIN\n${FIRST}\nVERA\n${SECOND}\n`).repeat(30);
const novel = 'INT. ATELIER - NUIT\n' + actions.map((action, index) => `PERSONNAGE\n${action}\nNon.`).join('\n');
let count = 0;
function test(name, run) { run(); count++; console.log('PASS ' + name); }
function literalEvidence(text, result) {
  for (const defect of result.defects) {
    assert.equal(defect.stage, 'scene');
    assert.ok(defect.evidence.length > 0);
    for (const item of defect.evidence) assert.equal(text.slice(item.start, item.end), item.quote);
  }
}

test('dominant dialogue loop is refused with literal evidence and preserved input', () => {
  const result = inspectSceneRepetition(loop, { sceneId: 'S1' });
  assert.equal(result.passed, false);
  assert.equal(result.defects[0].code, 'SCENE_REPETITION_LOOP');
  assert.ok(result.metrics.repeatedFraction > 0.8);
  literalEvidence(loop, result);
  assert.throws(() => assertSceneNovelty(loop, { sceneId: 'S1' }), error => {
    assert.equal(error.code, 'GQEL_SCENE_REPETITIVE');
    assert.equal(error.repairable, true);
    assert.equal(error.repetition.artifactDigest, digest(loop));
    return true;
  });
});
test('repeated multi-sentence action paragraphs are refused', () => {
  const text = 'EXT. QUAI - JOUR\n' + (actions.slice(0, 3).join(' ') + '\n').repeat(12);
  const result = inspectSceneRepetition(text);
  assert.equal(result.passed, false);
  literalEvidence(text, result);
});
test('character cues, short refrains and fresh action are preserved byte for byte', () => {
  const text = '\n  ' + novel + '\n\t';
  assert.equal(assertSceneNovelty(text), text);
  assert.equal(inspectSceneRepetition(text).boundaries.semanticQualityCertified, false);
  assert.equal(inspectSceneRepetition(text).boundaries.acceptedForDelivery, false);
});
test('a repeated long warning with little dominance is allowed', () => {
  const text = 'INT. GARE - JOUR\n' + Array.from({ length: 40 }, (_, index) =>
    `ACTION\n${actions[index % actions.length].slice(0, -1)} au repère ${index}.\n`
      + (index % 5 === 0 ? 'VOIX\n' + SECOND + '\n' : '')).join('');
  const result = inspectSceneRepetition(text);
  assert.equal(result.passed, true);
  assert.ok(result.metrics.peakOccurrences >= 6);
  assert.ok(result.metrics.repeatedFraction < 0.2);
});
test('an exact normalized full scene body cannot fill another scene slot', () => {
  const previous = [{ id: 'S1', text: novel }], before = structuredClone(previous);
  const text = novel.replace('INT. ATELIER - NUIT', 'EXT. QUAI - JOUR');
  const result = inspectSceneRepetition(text, { sceneId: 'S2', previousScenes: previous });
  assert.equal(result.passed, false);
  assert.equal(result.defects[0].code, 'SCENE_BODY_DUPLICATED');
  assert.equal(result.defects[0].metrics.previousSceneId, 'S1');
  assert.equal(result.defects[0].metrics.previousSceneDigest, digest(novel));
  literalEvidence(text, result);
  assert.deepEqual(previous, before);
});
test('full scene copies made from many short replies are also refused', () => {
  const body = Array.from({ length: 20 }, (_, index) => `VOIX\nLe code est ${index}.`).join('\n');
  const previous = [{ id: 'S1', text: 'INT. COULOIR - JOUR\n' + body }];
  const result = inspectSceneRepetition('EXT. COULOIR - NUIT\n' + body, { sceneId: 'S2', previousScenes: previous });
  assert.equal(result.passed, false);
  assert.equal(result.defects[0].code, 'SCENE_BODY_DUPLICATED');
});
test('short whole-scene refrains stay under the duplicate-body threshold', () => {
  const body = 'VOIX\nPas encore.\nELLE\nReviens.';
  assert.equal(assertSceneNovelty('EXT. QUAI - JOUR\n' + body,
    { sceneId: 'S2', previousScenes: [{ id: 'S1', text: 'INT. GARE - NUIT\n' + body }] }), 'EXT. QUAI - JOUR\n' + body);
});
test('changed actor cues and changed endings are not certified as whole-body copies', () => {
  const previousScenes = [{ id: 'S1', text: novel }];
  assert.equal(inspectSceneRepetition(novel.replaceAll('PERSONNAGE', 'AUTRE'), { previousScenes }).passed, true);
  assert.equal(inspectSceneRepetition(novel + '\nElle coupe enfin le câble.', { previousScenes }).passed, true);
});
test('case, Markdown and whitespace variations do not hide a whole-body copy', () => {
  const changed = novel.toLowerCase().replaceAll('personnage', '**PERSONNAGE**').replaceAll('\n', '\r\n  ');
  assert.equal(inspectSceneRepetition(changed, { previousScenes: [{ id: 'S1', text: novel }] }).passed, false);
});
test('invalid previous scene context is rejected explicitly', () => {
  assert.throws(() => inspectSceneRepetition(novel, { previousScenes: {} }), { code: 'GQEL_SCENE_CONTEXT_INVALID' });
  assert.throws(() => inspectSceneRepetition(novel, { previousScenes: [{ id: 'S1' }] }), { code: 'GQEL_SCENE_CONTEXT_INVALID' });
});

if (process.env.GENOS_REPETITION_RAW_TURNS) {
  test('actual truncated response is a negative repetition probe, never an accepted scene', () => {
    const turns = JSON.parse(fs.readFileSync(process.env.GENOS_REPETITION_RAW_TURNS, 'utf8'));
    const raw = JSON.parse(turns.at(-1).response_json).text;
    const diagnosticText = raw.replaceAll('\\n', '\n');
    const result = inspectSceneRepetition(diagnosticText, { sceneId: 'S1' });
    assert.equal(result.passed, false);
    assert.equal(result.defects[0].code, 'SCENE_REPETITION_LOOP');
    literalEvidence(diagnosticText, result);
    console.log(JSON.stringify({ negativeOnly: true, metrics: result.metrics }));
  });
}
console.log(`Scene repetition guard: ${count}/${count} PASS. Structural diagnostics only; no artistic acceptance.`);
