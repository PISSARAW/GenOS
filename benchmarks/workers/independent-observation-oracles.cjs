'use strict';

const { createHash } = require('node:crypto');

function digest(value) {
  return `solver://sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function receiptMatches({ testCase, execution, content, key }) {
  const expectedId = digest({ methodContract: testCase.methodContract, content });
  return execution.receipt?.id === expectedId && execution.result?.[key]?.id === expectedId;
}

function verifyScout(testCase, execution) {
  const result = execution.result;
  const { sources, terms } = testCase.methodContract.parameters;
  const expected = sources.flatMap((source) => terms.flatMap((term) => {
    const offset = source.text.toLocaleLowerCase('en').indexOf(term.toLocaleLowerCase('en'));
    return offset < 0 ? [] : [{ sourceRef: source.sourceRef, term, offset }];
  }));
  if (!Array.isArray(result?.observations) || result.observations.length !== expected.length) return false;
  const observationsMatch = result.observations.every((item, index) =>
    scoutObservationMatches(item, expected[index]));
  const refs = sources.map((source) => source.sourceRef);
  const content = { observations: result.observations, scannedSources: result.scannedSources,
    termCount: result.termCount };
  return observationsMatch && JSON.stringify(result.scannedSources) === JSON.stringify(refs)
    && result.termCount === terms.length && receiptMatches({ testCase, execution, content, key: 'scoutReceipt' });
}

function scoutObservationMatches(item, expected) {
  return item.offset === expected.offset && item.term === expected.term
    && item.sourceRefs?.length === 1 && item.sourceRefs[0] === expected.sourceRef
    && item.confidence === 1 && item.observation === `Literal '${expected.term}' found at offset ${expected.offset}.`
    && Array.isArray(item.uncertainties) && item.uncertainties.length > 0;
}

function verifyForensic(testCase, execution) {
  const result = execution.result;
  const events = testCase.methodContract.parameters.events;
  const byId = new Map(events.map((event) => [event.id, event]));
  const expected = events.filter((event) => event.causedBy).map((event) => ({
    from: event.causedBy.eventId, to: event.id, relation: 'declared_cause',
    evidence: [byId.get(event.causedBy.eventId)?.sourceRef, event.sourceRef, event.causedBy.receiptRef]
  }));
  const unlinked = events.filter((event) => !event.causedBy).map((event) => event.id);
  if (JSON.stringify(result?.causalChain) !== JSON.stringify(expected)) return false;
  if (JSON.stringify(result.unlinkedEvents) !== JSON.stringify(unlinked)) return false;
  const refs = [...new Set(expected.flatMap((item) => item.evidence))];
  if (JSON.stringify(result.evidence) !== JSON.stringify(refs)) return false;
  const content = { causalChain: result.causalChain, evidence: result.evidence,
    unlinkedEvents: result.unlinkedEvents, interpretation: result.interpretation };
  return result.interpretation?.includes('unverified')
    && receiptMatches({ testCase, execution, content, key: 'forensicReceipt' });
}

function validIndices(indices, values) {
  return Array.isArray(indices) && new Set(indices).size === indices.length
    && indices.every((index) => Number.isSafeInteger(index) && index >= 0 && index < values.length);
}

function verifyTeaching(testCase, execution) {
  const result = execution.result;
  const { procedure, learnerIndices, prerequisites } = testCase.methodContract.parameters;
  const { values, target } = procedure.parameters;
  const valid = validIndices(learnerIndices, values);
  const sum = valid ? learnerIndices.reduce((total, index) => total + values[index], 0) : null;
  if (!validTeachingExample(result?.demonstration, values, target)) return false;
  if (!validTransfer(result?.transferCheck, { valid, sum, target, learnerIndices })) return false;
  if (!validTeachingPacket(result, prerequisites)) return false;
  const content = { prerequisites: result.prerequisites, steps: result.steps,
    evidence: result.evidence, demonstration: result.demonstration,
    transferCheck: result.transferCheck, procedureReceipt: result.procedureReceipt };
  return receiptMatches({ testCase, execution, content, key: 'teachingReceipt' });
}

function validTeachingExample(example, values, target) {
  return validIndices(example?.indices, values)
    && example.indices.reduce((total, index) => total + values[index], 0) === target;
}

function validTransfer(check, expected) {
  return check?.passed === (expected.valid && expected.sum === expected.target)
    && check.learnerSum === expected.sum && check.target === expected.target
    && check.validIndices === expected.valid
    && JSON.stringify(check.learnerIndices) === JSON.stringify(expected.learnerIndices);
}

function validTeachingPacket(result, prerequisites) {
  return JSON.stringify(result.prerequisites) === JSON.stringify(prerequisites)
    && Array.isArray(result.steps) && result.steps.length > 0
    && result.steps.every((step) => typeof step === 'string' && Boolean(step.trim()))
    && result.evidence?.[0] === result.procedureReceipt?.id;
}

module.exports = { verifyScout, verifyForensic, verifyTeaching };
