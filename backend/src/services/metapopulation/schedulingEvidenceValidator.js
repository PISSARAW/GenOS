'use strict';

function taskDurations(mission) {
  const matches = [...String(mission || '').matchAll(/\b([A-Z])\s*(?:=|:)\s*(\d+)\b/g)];
  return new Map(matches.map((match) => [match[1], Number(match[2])]));
}

function machineAssignments(answer, jobs) {
  const source = String(answer || '');
  const headers = [...source.matchAll(/\bMachine\s*(\d+)\s*(?:->|:)/gi)];
  return headers.map((header, index) => {
    const start = header.index + header[0].length;
    const end = headers[index + 1]?.index ?? source.length;
    const section = source.slice(start, end).split(/[\n;.]/, 1)[0];
    return {
      machine: Number(header[1]),
      tasks: [...section.matchAll(/\b([A-Z])\b/g)].map((task) => task[1]).filter((task) => jobs.has(task)),
      durations: [...section.matchAll(/\b([A-Z])\s*\(\s*(\d+)\s*\)/g)].map((task) => [task[1], Number(task[2])])
    };
  });
}

function optimalMakespan(jobs) {
  const values = [...jobs.values()];
  const total = values.reduce((sum, value) => sum + value, 0);
  let optimum = total;
  for (let mask = 0; mask < 2 ** values.length; mask += 1) {
    const load = values.reduce((sum, value, index) => sum + ((mask >> index) & 1 ? value : 0), 0);
    optimum = Math.min(optimum, Math.max(load, total - load));
  }
  return optimum;
}

function lptMakespan(jobs) {
  const loads = [0, 0];
  for (const duration of [...jobs.values()].sort((left, right) => right - left)) {
    const target = loads[0] <= loads[1] ? 0 : 1;
    loads[target] += duration;
  }
  return Math.max(...loads);
}

function localSearchIsStable(assignments, jobs, current) {
  const taskOwners = new Map();
  assignments.forEach((machine, index) => machine.tasks.forEach((task) => taskOwners.set(task, index)));
  const loads = assignments.map((machine) => machine.tasks.reduce((sum, task) => sum + jobs.get(task), 0));
  return movesDoNotImprove(taskOwners, { loads, jobs, current })
    && swapsDoNotImprove(taskOwners, { loads, jobs, current });
}

function movesDoNotImprove(taskOwners, { loads, jobs, current }) {
  for (const [task, owner] of taskOwners) {
    if (moveMakespan(task, owner, { loads, jobs }) < current) return false;
  }
  return true;
}

function moveMakespan(task, owner, { loads, jobs }) {
  const moved = loads.map((load) => load);
  moved[owner] -= jobs.get(task);
  moved[1 - owner] += jobs.get(task);
  return Math.max(...moved);
}

function swapsDoNotImprove(taskOwners, { loads, jobs, current }) {
  const entries = [...taskOwners];
  for (let left = 0; left < entries.length; left += 1) {
    for (let right = left + 1; right < entries.length; right += 1) {
      if (swapMakespan(entries[left], entries[right], { loads, jobs }) < current) return false;
    }
  }
  return true;
}

function swapMakespan(leftEntry, rightEntry, { loads, jobs }) {
  const [left, owner] = leftEntry;
  const [right, otherOwner] = rightEntry;
  if (owner === otherOwner) return Infinity;
  const swapped = loads.map((load) => load);
  swapped[owner] += jobs.get(right) - jobs.get(left);
  swapped[otherOwner] += jobs.get(left) - jobs.get(right);
  return Math.max(...swapped);
}

function validateSchedulingResult({ mission, answer, method }) {
  if (!/makespan/i.test(String(mission || ''))) return null;
  return validationReport(buildSchedulingFacts(mission, answer, method));
}

function buildSchedulingFacts(mission, answer, method) {
  const jobs = taskDurations(mission);
  const assignments = machineAssignments(answer, jobs);
  const makespan = assignmentMakespan(assignments, jobs);
  return { jobs, assignments, makespan, answer, mission, method };
}

function assignmentMakespan(assignments, jobs) {
  const loads = assignments.map((machine) => machine.tasks.reduce((sum, task) => sum + jobs.get(task), 0));
  return Math.max(0, ...loads);
}

function validationReport(facts) {
  const reasons = collectValidationReasons(facts);
  return { applicable: true, valid: reasons.length === 0, computedMakespan: facts.makespan, reasons };
}

function collectValidationReasons(facts) {
  const reasons = [];
  addReason(reasons, !hasFullAssignment(facts), 'each task must appear exactly once across at least two machines');
  addReason(reasons, !durationsMatch(facts), 'a reported task duration conflicts with the mission input');
  addReason(reasons, !reportedMakespanMatches(facts), `reported makespan must equal the computed load maximum (${facts.makespan})`);
  addReason(reasons, !dynamicMethodIsOptimal(facts), `dynamic programming must attain the exact optimum (${optimalMakespan(facts.jobs)})`);
  addReason(reasons, !lptMethodMatches(facts), `LPT must attain its computed makespan (${lptMakespan(facts.jobs)})`);
  addReason(reasons, !localMethodIsStable(facts), 'a one-task move or two-task swap still improves the makespan');
  return reasons;
}

function hasFullAssignment(facts) {
  const assigned = facts.assignments.flatMap((machine) => machine.tasks);
  return facts.jobs.size > 0 && facts.assignments.length >= 2
    && assigned.length === facts.jobs.size && new Set(assigned).size === facts.jobs.size;
}

function durationsMatch({ assignments, jobs }) {
  return assignments.every((machine) => machine.durations.every(([task, duration]) => jobs.get(task) === duration));
}

function reportedMakespanMatches({ answer, makespan }) {
  const claim = String(answer || '').match(/makespan[^\d]{0,30}(\d+)/i);
  return Boolean(claim) && Number(claim[1]) === makespan;
}

function dynamicMethodIsOptimal({ method, makespan, jobs }) {
  const dynamic = /programmation dynamique|dynamic programming|subset.sum/i.test(String(method || ''));
  return !dynamic || makespan === optimalMakespan(jobs);
}

function lptMethodMatches({ mission, method, makespan, jobs }) {
  const lpt = /\bLPT\b|longest processing time/i.test(String(mission || ''));
  const greedy = /gloutonne|greedy/i.test(String(method || ''));
  return !(lpt && greedy) || makespan === lptMakespan(jobs);
}

function localMethodIsStable({ method, assignments, jobs, makespan }) {
  const local = /recherche locale|local search/i.test(String(method || ''));
  return !local || localSearchIsStable(assignments, jobs, makespan);
}

function addReason(reasons, failed, message) {
  if (failed) reasons.push(message);
}

module.exports = { validateSchedulingResult };
