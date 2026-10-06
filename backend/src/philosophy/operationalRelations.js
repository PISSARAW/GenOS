'use strict';

const DISTINCTIONS = [
  ['core.agent', 'ontology.person-other'], ['core.self', 'ontology.identity-change'],
  ['core.genome', 'core.trait'], ['core.history', 'core.lineage'],
  ['ontology.possible-worlds', 'logic.possible-worlds'],
  ['ontology.contingency-necessity', 'logic.modal'],
  ['school.stoicism', 'lens.stoicism'], ['school.epicureanism', 'lens.epicureanism'],
  ['school.whitehead', 'lens.whitehead'], ['school.whitehead', 'process.actuality-potentiality'],
  ['school.deleuze', 'lens.deleuze'], ['school.deleuze', 'process.deleuze-difference'],
  ['school.badiou', 'process.badiou-event'], ['school.sartre', 'process.sartrean-existence'],
  ['school.bergsonism', 'time.duration'], ['time.newtonian', 'school.newtonianism'],
  ['metaphysics.qualia', 'core.self'], ['metaphysics.mind-body', 'metaphysics.cartesian-pineal'],
  ['epistemology.truth', 'truth.correspondence'], ['epistemology.knowledge', 'epistemology.belief'],
  ['epistemology.gettier-problem', 'epistemology.gettierized-knowledge'],
  ['method.abduction', 'method.inference-best-explanation'],
  ['science.falsification-demarcation', 'epistemology.falsification'],
  ['ethics.social-contract', 'politics.social-contract'],
  ['ethics.utilitarianism', 'lens.utilitarianism'], ['ethics.virtue-ethics', 'lens.virtue-ethics'],
  ['ethics.rawlsian-justice', 'ethics.distributive-justice'],
  ['interpretation.artistic', 'interpretation.esthetic-experience'],
  ['art.fictionalism', 'mathematics.fictionalism'], ['art.formalism', 'music.formalism'],
  ['art.formalism', 'mathematics.formalism'], ['school.platonism', 'mathematics.platonism'],
  ['logic.intuitionistic', 'mathematics.intuitionism'],
  ['mathematics.proof', 'mathematics.proof-theory'],
  ['mathematics.structuralism', 'mathematics.ante-rem-structuralism'],
  ['mathematics.structuralism', 'mathematics.in-re-structuralism'],
  ['mathematics.structuralism', 'mathematics.post-rem-structuralism'],
];
const TENSIONS = [
  ['truth.pragmatist', 'truth.correspondence'], ['truth.coherence', 'truth.correspondence'],
  ['school.empiricism', 'school.rationalism'], ['metaphysics.dualism', 'metaphysics.material-monism'],
  ['metaphysics.panpsychism', 'metaphysics.eliminativism'],
  ['ethics.utilitarianism', 'ethics.deontology'], ['ethics.rawlsian-justice', 'ethics.libertarianism'],
  ['ethics.precautionary-principle', 'causality.free-will'],
  ['politics.liberty-authority', 'politics.security-liberty-surveillance'],
  ['politics.separation-of-powers', 'school.deleuze'],
  ['art.formalism', 'art.expressionism'], ['interpretation.author', 'interpretation.death-of-author'],
  ['mathematics.platonism', 'mathematics.nominalism'],
  ['mathematics.formalism', 'mathematics.intuitionism'],
  ['mathematics.ante-rem-structuralism', 'mathematics.post-rem-structuralism'],
];

function neighbors(id, pairs) {
  return pairs.filter((pair) => pair.includes(id)).map((pair) => pair.find((other) => other !== id));
}

function relationsFor(id) {
  return { distinguishedFrom: neighbors(id, DISTINCTIONS), tensionsWith: neighbors(id, TENSIONS),
    status: 'operational-design-relations-not-historical-proof' };
}

module.exports = { relationsFor, DISTINCTIONS, TENSIONS };
