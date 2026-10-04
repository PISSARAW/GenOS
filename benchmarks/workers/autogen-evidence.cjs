'use strict';

const { createHash } = require('node:crypto');

function digest(text) {
  return `agent://sha256:${createHash('sha256').update(text).digest('hex')}`;
}

function parseAnswer(rawOutput) {
  const trimmed = rawOutput.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}

function parseAssignments(rawOutput) {
  const parsed = parseAnswer(rawOutput);
  return Array.isArray(parsed) ? parsed : parsed?.assignments;
}

function scheduleOutput(assignments, parameters) {
  const jobs = new Map(parameters.jobs.map((job) => [job.id, job.duration]));
  if (!Array.isArray(assignments) || assignments.length !== parameters.machines) return null;
  const seen = new Set();
  const seenMachines = new Set();
  const machineIds = assignments.map((item) => item?.machine);
  const offset = machineIds.includes(0) ? 0 : 1;
  const output = [];
  for (const item of assignments) {
    if (!validMachine(item, seenMachines, { total: parameters.machines, offset })) return null;
    seenMachines.add(item.machine);
    let load = 0;
    for (const id of item.jobs) {
      if (!jobs.has(id) || seen.has(id)) return null;
      seen.add(id);
      load += jobs.get(id);
    }
    output.push({ machine: item.machine - offset, jobs: item.jobs, load });
  }
  if (seen.size !== jobs.size) return null;
  output.sort((left, right) => left.machine - right.machine);
  return { assignments: output, makespan: Math.max(...output.map((item) => item.load)) };
}

function validMachine(item, seenMachines, limits) {
  return Number.isInteger(item?.machine) && item.machine >= limits.offset
    && item.machine < limits.total + limits.offset
    && Array.isArray(item.jobs) && item.jobs.every((id) => typeof id === 'string')
    && !seenMachines.has(item.machine);
}

function subsetOutput(answer, parameters) {
  const indices = answer?.indices;
  if (!Array.isArray(indices) || !indices.length || new Set(indices).size !== indices.length
    || indices.some((index) => !Number.isSafeInteger(index) || index < 0 || index >= parameters.values.length)) return null;
  const sum = indices.reduce((total, index) => total + parameters.values[index], 0);
  return sum === parameters.target ? { found: true, indices, sum } : null;
}

function validatedOutput(testCase, rawOutput) {
  const parameters = testCase.methodContract.parameters;
  if (testCase.id === 'lpt-schedule') return scheduleOutput(parseAssignments(rawOutput), parameters);
  if (testCase.id === 'subset-sum') return subsetOutput(parseAnswer(rawOutput), parameters);
  return null;
}

function verifiedAutoGen(testCase, execution) {
  if (!['lpt-schedule', 'subset-sum'].includes(testCase.id)) return false;
  const provenance = execution.provenance;
  if (provenance?.agentFramework !== 'autogen-agentchat' || typeof provenance.rawOutput !== 'string'
    || execution.receipt?.id !== digest(provenance.rawOutput)) return false;
  let output;
  try { output = validatedOutput(testCase, provenance.rawOutput); } catch (_) { return false; }
  return output !== null && JSON.stringify(output) === JSON.stringify(execution.result?.output);
}

module.exports = { digest, parseAssignments, scheduleOutput, subsetOutput, validatedOutput, verifiedAutoGen };
