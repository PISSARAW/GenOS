'use strict';

const { createHash } = require('node:crypto');

function digest(text) {
  return `agent://sha256:${createHash('sha256').update(text).digest('hex')}`;
}

function parseAssignments(rawOutput) {
  const trimmed = rawOutput.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const parsed = JSON.parse(fenced ? fenced[1] : trimmed);
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

function verifiedAutoGen(testCase, execution) {
  if (testCase.id !== 'lpt-schedule') return false;
  const provenance = execution.provenance;
  if (provenance?.agentFramework !== 'autogen-agentchat' || typeof provenance.rawOutput !== 'string'
    || execution.receipt?.id !== digest(provenance.rawOutput)) return false;
  let parsed;
  try { parsed = parseAssignments(provenance.rawOutput); } catch (_) { return false; }
  const output = scheduleOutput(parsed, testCase.methodContract.parameters);
  return output !== null && JSON.stringify(output) === JSON.stringify(execution.result?.output);
}

module.exports = { digest, parseAssignments, scheduleOutput, verifiedAutoGen };
