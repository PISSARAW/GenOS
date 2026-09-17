'use strict';

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function confidence(value) {
  if (value === undefined || value === null) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    throw new Error('confidence must be a number between 0 and 1.');
  }
  return number;
}

function base(concept, args) {
  return {
    concept,
    status: 'interpretive',
    revisable: true,
    confidence: confidence(args.confidence),
    provenance: { source: 'provided_artwork_and_context', philosophicalStatus: 'interpretive' }
  };
}

function proposeInterpretations(args = {}) {
  const subject = object(args.subject || args.work || args.artwork);
  const readings = list(args.readings).map((reading) => object(reading));
  return {
    ...base('interpretation.artistic', args),
    subject,
    readings,
    constructionMode: args.constructionMode || 'evidence_guided',
    activeReadingCount: readings.length,
    conclusion: readings.length ? 'multiple_revisable_readings' : 'no_reading_proposed',
    evidenceRequired: readings.length ? [] : ['interpretive_reading']
  };
}

function separateEvidence(args = {}) {
  const subject = object(args.subject || args.work || args.artwork);
  const intra = list(args.intraArtistic || subject.intraArtistic);
  const extra = list(args.extraArtistic || subject.extraArtistic);
  return {
    ...base('interpretation.intra-extra-artistic', args),
    intraArtistic: intra,
    extraArtistic: extra,
    intraCount: intra.length,
    extraCount: extra.length,
    balance: intra.length && extra.length ? 'mixed' : intra.length ? 'intra_only' : extra.length ? 'extra_only' : 'none',
    warning: 'Les données extra-artistiques contextualisent une lecture ; elles ne la démontrent pas.'
  };
}

function trackIndeterminacy(args = {}) {
  const alternatives = list(args.alternatives);
  const unresolved = list(args.unresolved || args.ambiguities);
  return {
    ...base('interpretation.indeterminacy', args),
    alternatives,
    unresolved,
    degree: alternatives.length > 1 || unresolved.length ? 'open' : 'undetermined',
    preservesPlurality: true,
    conclusion: 'no_unique_interpretation_inferred',
    evidenceRequired: ['counter_readings_or_ambiguities']
  };
}

function analyzeAuthor(args = {}) {
  const author = object(args.author || args.creator);
  const intention = args.intention || author.intention || null;
  return {
    ...base('interpretation.author', args),
    author: author.name || author,
    intention: intention ? { value: intention, status: 'attributed_hypothesis' } : null,
    biography: list(author.biography || args.biography),
    works: list(author.works || args.works),
    authorFunction: 'contextual_source_not_final_interpretive_authority',
    evidenceRequired: intention ? [] : ['authorial_statement_or_reliable_context']
  };
}

function analyzeDeathOfAuthor(args = {}) {
  const readings = list(args.readings);
  return {
    ...base('interpretation.death-of-author', args),
    authorialIntent: args.authorialIntent || null,
    readerConstructions: readings,
    authorialIntentRequired: false,
    meaningStatus: readings.length ? 'reader_constructed_and_revisable' : 'open',
    theorists: ['Roland Barthes', 'Michel Foucault'],
    evidenceRequired: readings.length ? [] : ['reader_or_cultural_reading']
  };
}

function analyzeIntertextuality(args = {}) {
  const references = list(args.references || args.allusions);
  const relations = list(args.relations);
  return {
    ...base('interpretation.intertextuality', args),
    references,
    relations,
    relationTypes: [...new Set(relations.map((relation) => relation.type).filter(Boolean))],
    status: references.length || relations.length ? 'interpretive' : 'underdetermined',
    theorist: 'Julia Kristeva',
    evidenceRequired: references.length || relations.length ? [] : ['textual_or_cultural_relation']
  };
}

function analyzeEmbodiedMeaning(args = {}) {
  const meaning = args.meaning || null;
  return {
    ...base('interpretation.embodied-meaning', args),
    meaning,
    embodiment: args.embodiment || null,
    medium: args.medium || null,
    status: meaning ? 'interpretive' : 'underdetermined',
    theorist: 'Arthur Danto',
    evidenceRequired: meaning ? [] : ['artwork_meaning_and_embodied_form']
  };
}

function analyzeConstruction(args = {}) {
  const steps = list(args.steps);
  return {
    ...base('interpretation.construction', args),
    steps,
    construction: args.construction || null,
    status: steps.length || args.construction ? 'interpretive' : 'underdetermined',
    evidenceRequired: steps.length || args.construction ? [] : ['interpretive_method']
  };
}

function analyzeReference(args = {}) {
  const references = list(args.references);
  return {
    ...base('interpretation.reference', args),
    references,
    representation: args.representation || null,
    status: references.length ? 'interpretive' : 'underdetermined',
    evidenceRequired: references.length ? [] : ['referential_observation']
  };
}

module.exports = {
  proposeInterpretations,
  separateEvidence,
  trackIndeterminacy,
  analyzeAuthor,
  analyzeDeathOfAuthor,
  analyzeIntertextuality,
  analyzeEmbodiedMeaning,
  analyzeConstruction,
  analyzeReference
};
