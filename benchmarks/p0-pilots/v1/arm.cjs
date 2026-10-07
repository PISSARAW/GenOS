'use strict';

const { generate } = require('./candidate.cjs');
const { basePrompt, revisionPrompt, branchPrompt } = require('./prompts.cjs');

function seedFor(seed, caseId) {
  return seed + [...caseId].reduce((value, char) => value + char.charCodeAt(0), 0);
}

function select(arm, attempts) {
  if (['genos', 'tool-assisted'].includes(arm)) return attempts.findIndex(row => row.check?.passed);
  return attempts.length - 1;
}

async function runArm(spec) {
  const { task, arm, pilot, protocol, context } = spec;
  const budget = protocol.pilots[pilot];
  const base = basePrompt(pilot, task, spec.examples);
  const attempts = [];
  for (let index = 0; index < budget.callsPerCase; index++) {
    const prompt = promptFor({ ...spec, base, attempts, index });
    const response = Date.now() < context.caseDeadlineAt
      ? await generate({ protocol, budget, prompt, seed: seedFor(spec.seed, task.id) + index })
      : { error: 'Case deadline reached', requestSkipped: true, prompt };
    const branchId = task.id + '-' + arm + '-' + index;
    let check;
    if (pilot !== 'memory') {
      check = response.candidate
        ? await require('./' + pilot + '-probe.cjs').check(task, response.candidate,
          { ...context, genos: ['genos', 'no-evidence-gate'].includes(arm), branchId,
            timeoutMs: Math.max(1, Math.min(protocol.toolTimeoutMs, context.caseDeadlineAt - Date.now())) })
        : { passed: false, feedback: response.error, executions: [] };
    }
    attempts.push({ ...response, check, branchId });
  }
  const chosen = pilot === 'memory' ? 0 : select(arm, attempts);
  return { caseId: task.id, pilot, arm, chosen, selected: chosen < 0 ? null : attempts[chosen].candidate,
    attempts, callCount: attempts.filter(row => !row.requestSkipped).length,
    checkCount: attempts.filter(row => row.candidate && row.check).length };
}

function promptFor(spec) {
  if (spec.pilot === 'memory') return spec.base + '\nHistorical observations:\n' + spec.memory.blocks[spec.arm];
  if (!spec.index || ['genos', 'no-evidence-gate'].includes(spec.arm)) return branchPrompt(spec.base, spec.pilot, spec.index);
  return revisionPrompt({ base: branchPrompt(spec.base, spec.pilot, 0), previous: spec.attempts[0],
    feedback: spec.arm === 'tool-assisted' ? spec.attempts[0].check.feedback : undefined });
}

module.exports = { runArm, select, seedFor };
