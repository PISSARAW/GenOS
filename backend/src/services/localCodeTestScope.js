'use strict';

function changedPaths(before, after) {
  const previous = new Map(before.map(file => [file.path, file]));
  const current = new Map(after.map(file => [file.path, file]));
  return [...new Set([...previous.keys(), ...current.keys()])].filter(relative => {
    const left = previous.get(relative);
    const right = current.get(relative);
    return !left || !right || left.hash !== right.hash || left.mode !== right.mode;
  });
}

function assertScope(input) {
  const permitted = new Set(input.patches.map(patch => patch.path.replace(/\\/g, '/')));
  const rejected = changedPaths(input.before, input.after).filter(relative => !permitted.has(relative));
  if (!rejected.length) return;
  throw Object.assign(new Error(`Capsule tests changed files outside the patch scope: ${rejected.join(', ')}`), {
    code: 'WORKER_TEST_SCOPE_VIOLATION', changedPaths: rejected
  });
}

async function enforce(input) {
  try { assertScope(input); }
  catch (error) {
    await input.restore();
    throw Object.assign(error, { tests: input.tests, testExecutionReceipt: input.testExecutionReceipt });
  }
}

module.exports = { changedPaths, assertScope, enforce };
