/**
 * Lot 3 : Primitives d'Évolution (mutate, breed, select, pareto, speciation).
 *
 * Delegation shim: implementations live in the sibling modules
 * (evolutionMutate / evolutionBreed / evolutionSelection / evolutionSpeciation)
 * so every file stays within the quality gate (<= 400 lines, complexity <= 10).
 * Exports are identical to the historical monolith.
 */
const { mutate, mutateSingle } = require('./evolutionMutate');
const { breed } = require('./evolutionBreed');
const { select, paretoSelect } = require('./evolutionSelection');
const { speciation, plasmidDivergence, stagnationCheck } = require('./evolutionSpeciation');

module.exports = {
  mutate,
  mutateSingle,
  stagnationCheck,
  breed,
  select,
  paretoSelect,
  speciation,
  plasmidDivergence
};
