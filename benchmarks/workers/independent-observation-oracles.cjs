'use strict';

const { createHash } = require('node:crypto');

function receiptMatches({ testCase, execution, content, key, canonicalize = false }) {
  const payload = { methodContract: testCase.methodContract, content };
  const serialized = canonicalize ? canonical(payload) : JSON.stringify(payload);
  const expectedId = `solver://sha256:${createHash('sha256').update(serialized).digest('hex')}`;
  return execution.receipt?.id === expectedId && execution.result?.[key]?.id === expectedId;
}

function verifyScout(testCase, execution) {
  const result = execution.result;
  const { sources, terms } = testCase.methodContract.parameters;
  const expected = sources.flatMap((source) => terms.flatMap((term) => {
    const offset = source.text.indexOf(term);
    return offset < 0 ? [] : [{ sourceRef: source.sourceRef, term, offset }];
  }));
  if (!Array.isArray(result?.observations) || result.observations.length !== expected.length) return false;
  const observationsMatch = result.observations.every((item, index) =>
    scoutObservationMatches(item, expected[index]));
  const refs = sources.map((source) => source.sourceRef);
  const content = { observations: result.observations, scannedSources: result.scannedSources,
    termCount: result.termCount };
  return observationsMatch && JSON.stringify(result.scannedSources) === JSON.stringify(refs)
    && result.termCount === terms.length && receiptMatches({ testCase, execution, content,
      key: 'scoutReceipt', canonicalize: true });
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
    && receiptMatches({ testCase, execution, content, key: 'forensicReceipt', canonicalize: true });
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

function procedureReceipt(testCase, execution) {
  const method = testCase.methodContract;
  const output = execution.result?.output;
  if (!output || !method) return false;
  const inputDigest = createHash('sha256').update(JSON.stringify({
    methodId: method.methodId, parameters: method.parameters
  })).digest('hex');
  const resultDigest = createHash('sha256').update(JSON.stringify({
    methodId: method.methodId, inputDigest, output
  })).digest('hex');
  const receipt = execution.receipt;
  return receipt?.methodId === method.methodId
    && receipt.inputDigest === `sha256:${inputDigest}`
    && receipt.id === `solver://sha256:${resultDigest}`
    && execution.result.receipt?.id === receipt.id
    && JSON.stringify(receipt.result) === JSON.stringify(output);
}

function subsetPossibilities(values, target) {
  if (values.length > 20) return null;
  const reachable = new Set();
  for (let mask = 0; mask < 2 ** values.length; mask += 1) {
    let total = 0;
    values.forEach((value, index) => { if (mask & (2 ** index)) total += value; });
    if (total <= target) reachable.add(total);
  }
  return reachable;
}

function verifySubset(testCase, execution) {
  const { values, target } = testCase.methodContract.parameters;
  const reachable = subsetPossibilities(values, target);
  const output = execution.result?.output;
  if (!reachable || !output || !procedureReceipt(testCase, execution)) return false;
  const found = reachable.has(target);
  if (output.found !== found || output.reachableCount !== reachable.size) return false;
  if (!found) return output.indices === null && output.sum === null;
  return validIndices(output.indices, values)
    && output.indices.reduce((sum, index) => sum + values[index], 0) === target
    && output.sum === target;
}

function expectedLpt(jobs, machines) {
  const queues = Array.from({ length: machines }, (_, machine) => ({ machine, jobs: [], load: 0 }));
  const ordered = [...jobs].sort((a, b) => b.duration - a.duration || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const job of ordered) {
    const least = Math.min(...queues.map((queue) => queue.load));
    const selected = queues.find((queue) => queue.load === least);
    selected.jobs.push(job.id);
    selected.load += job.duration;
  }
  return { assignments: queues, makespan: Math.max(...queues.map((queue) => queue.load)) };
}

function verifyLpt(testCase, execution) {
  const { jobs, machines } = testCase.methodContract.parameters;
  const output = execution.result?.output;
  if (!output || !procedureReceipt(testCase, execution)) return false;
  const expected = expectedLpt(jobs, machines);
  return JSON.stringify(output) === JSON.stringify(expected);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

module.exports = { verifyScout, verifyForensic, verifyTeaching, verifySubset, verifyLpt };
