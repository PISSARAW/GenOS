'use strict';

function examplesFor(tasks) {
  return tasks.filter(task => task.split === 'train').map(task => ({
    statement: task.description || task.formalStatement || task.prompt, solution: task.exampleSolution
  }));
}

function basePrompt(pilot, task, examples) {
  const intro = `You are taking a bounded ${pilot} pilot. Return only one JSON object, no markdown.\nTraining examples: ${JSON.stringify(examples)}\n`;
  if (pilot === 'code') return intro + 'Return {"expression":"..."} to replace the buggy return expression in function solve(a,b,c). ' +
    'Allowed syntax: numeric literals, a b c, arithmetic and comparison operators, && || !, parentheses, ternary, and Math.abs/min/max/floor/ceil/round. ' +
    `No statements, strings, declarations or other calls. Task: ${JSON.stringify(task)}`;
  if (pilot === 'reasoning') return intro + 'Return {"proof":"by ..."} with only the proof body for core Lean 4.34.0. ' +
    'No imports, sorry, admit, declarations, IO, native_decide or commands. ' +
    `The fixed theorem is benchmark_target : ${task.formalStatement}. Use a compact proof. No theorem header.`;
  return intro + task.prompt;
}

function revisionPrompt(spec) {
  const previous = JSON.stringify(spec.previous.candidate || spec.previous.error);
  const feedback = spec.feedback === undefined
    ? 'Reconsider your first answer independently against the task; no checker feedback is available.'
    : `Public checker feedback only: ${spec.feedback}`;
  return spec.base + `\nFirst answer: ${previous}\n${feedback}\nReturn a complete revised JSON answer.`;
}

function branchPrompt(base, pilot, index) {
  const methods = pilot === 'code'
    ? ['Derive the numeric expression directly from the specification.', 'Derive an alternative expression by checking boundaries, ties, zero and negative values when relevant.']
    : ['Prefer a compact proof using core theorems when applicable.', 'Use an alternative proof with explicit introductions and constructors when applicable.'];
  return base + '\nMethod: ' + methods[index];
}

module.exports = { basePrompt, revisionPrompt, branchPrompt, examplesFor };
