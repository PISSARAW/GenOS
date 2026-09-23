'use strict';

const { analyzeSpeechAct } = require('../philosophy/speechActService');

function propositionOf(report, input) {
  if (input.proposition) return input.proposition;
  if (report.locution && report.locution.proposition) return report.locution.proposition;
  return report.utterance;
}

function compileCommissive(report, input) {
  return {
    artifactKind: 'Commitment',
    artifact: { debtor: input.speaker, creditor: input.addressee || null, pledge: propositionOf(report, input), deadline: input.deadline || null }
  };
}

function compileQuestion(report, input) {
  return {
    artifactKind: 'AssumptionSet',
    artifact: { seeks: propositionOf(report, input), from: input.addressee || null, openQuestion: report.utterance }
  };
}

function compileAssertive(report, input) {
  return {
    artifactKind: 'AssumptionSet',
    artifact: { claims: [propositionOf(report, input)], assertedBy: input.speaker, status: 'pending_grounding' }
  };
}

function compileDirective(report, input) {
  return {
    artifactKind: 'Commitment',
    artifact: { requester: input.speaker, requested: input.addressee || null, task: propositionOf(report, input), status: 'awaiting_acceptance' }
  };
}

function compileDeclarative(report, input) {
  return {
    artifactKind: 'ContractPatch',
    artifact: { declaredBy: input.speaker, change: propositionOf(report, input), scope: input.domain || null }
  };
}

function compileExpressive(report, input) {
  return { artifactKind: null, artifact: { acknowledged: true, by: input.speaker } };
}

const FORCE_COMPILERS = {
  commissive: compileCommissive,
  question: compileQuestion,
  assertive: compileAssertive,
  directive: compileDirective,
  declarative: compileDeclarative,
  expressive: compileExpressive
};

function compileFromReport(report, input) {
  const compile = FORCE_COMPILERS[report.illocution.force];
  if (!compile) {
    return { force: report.illocution.force, artifactKind: null, artifact: null, felicitous: report.felicity.satisfied };
  }
  const compiled = compile(report, input);
  return {
    force: report.illocution.force,
    artifactKind: compiled.artifactKind, artifact: compiled.artifact,
    felicitous: report.felicity.satisfied
  };
}

function compileSpeechAct(input) {
  const report = analyzeSpeechAct({
    utterance: input.utterance, speaker: input.speaker, addressee: input.addressee,
    force: input.force, proposition: input.proposition
  });
  const compiled = compileFromReport(report, input);
  return Object.assign({ report }, compiled);
}

module.exports = { FORCE_COMPILERS, compileSpeechAct, compileFromReport };
