'use strict';

const PASSES = [
  { name: 'remove_additive_identity', apply: removeAdditiveIdentity },
  { name: 'remove_multiplicative_identity', apply: removeMultiplicativeIdentity },
  { name: 'combine_adjacent_additions', apply: (program) => combineAdjacent(program, 'add') },
  { name: 'combine_adjacent_multiplications', apply: (program) => combineAdjacent(program, 'mul') },
  { name: 'annihilate_zero_multiplication', apply: annihilateZeroMultiplication }
];

function removeAdditiveIdentity(program) {
  return program.filter((operation) => !(operation.op === 'add' && operation.value === 0));
}

function removeMultiplicativeIdentity(program) {
  return program.filter((operation) => !(operation.op === 'mul' && operation.value === 1));
}

function combineAdjacent(program, operationName) {
  const output = [];
  for (const operation of program) {
    const previous = output.at(-1);
    if (previous?.op === operationName && operation.op === operationName) {
      previous.value = operationName === 'add'
        ? previous.value + operation.value : previous.value * operation.value;
    } else output.push({ ...operation });
  }
  return output;
}

function annihilateZeroMultiplication(program) {
  const index = program.findIndex((operation) => operation.op === 'mul' && operation.value === 0);
  return index > 0 ? program.slice(index).map((operation) => ({ ...operation })) : program;
}

function transformE04(input, verify) {
  let current = input;
  const passResults = [];
  const allowed = new Set(input.optimization_allowed || []);
  for (const pass of PASSES) {
    const before = current.program;
    const after = allowed.has(pass.name) ? pass.apply(before) : before;
    const candidate = { ...current, program: after };
    const invariantPreserved = JSON.stringify(verify(current)) === JSON.stringify(verify(candidate));
    if (!invariantPreserved) throw new Error(`E04 invariant failed after ${pass.name}`);
    passResults.push({ name: pass.name, applied: JSON.stringify(before) !== JSON.stringify(after),
      operation_count_before: before.length, operation_count_after: after.length });
    current = candidate;
  }
  return { input: current, passes: passResults, all_invariants_preserved: true };
}

module.exports = { transformE04 };
