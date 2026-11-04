'use strict';
const SECTION_CRITERION = 'screenplay_sections_complete';
function invalid(message) { return Object.assign(new Error(message), { code: 'GQEL_INVALID_CONTRACT' }); }
function sectionsCriterion() {
  return { id: SECTION_CRITERION, kind: 'hard', stage: 'draft',
    description: 'Le titre, la logline, les profils avec objectif et secret de chaque personnage explicitement demandé et la note dramaturgique sont présents, substantiels et cohérents avec les scènes et le brief.' };
}
function characterNames(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) throw invalid('Between one and twelve character names are required.');
  for (const name of value) {
    if (typeof name !== 'string' || name !== name.trim() || !/^[\p{L}\p{M}][\p{L}\p{M}\p{N} .'’\-]{0,59}$/u.test(name)) {
      throw invalid('Character names must be bounded single-line names.');
    }
  }
  if (new Set(value.map(name => name.normalize('NFC').toLowerCase())).size !== value.length) throw invalid('Character names must be unique.');
  return [...value];
}
function screenplayOptions(value, profile) {
  if (value === undefined) return undefined;
  if (profile !== 'screenplay' || !value || Array.isArray(value) || typeof value !== 'object'
    || Object.keys(value).length !== 1 || !Object.hasOwn(value, 'characterNames')) {
    throw invalid('screenplaySections requires a screenplay and an explicit characterNames object.');
  }
  return { characterNames: characterNames(value.characterNames) };
}
function verifySections(contract) {
  if (!Object.hasOwn(contract, 'screenplaySections')) return;
  if (contract.screenplaySections === undefined) throw invalid('Explicit screenplaySections cannot be undefined.');
  screenplayOptions(contract.screenplaySections, contract.profile);
  if (!Array.isArray(contract.criteria)) throw invalid('The sections criterion is required.');
  const matches = contract.criteria.filter(item => item.id === SECTION_CRITERION);
  const expected = sectionsCriterion(), actual = matches[0];
  if (matches.length !== 1 || Object.keys(actual).length !== Object.keys(expected).length
    || Object.entries(expected).some(([key, value]) => actual[key] !== value)) {
    throw invalid('The canonical hard draft screenplay_sections_complete criterion cannot be weakened.');
  }
}
module.exports = { SECTION_CRITERION, screenplayOptions, sectionsCriterion, verifySections };
