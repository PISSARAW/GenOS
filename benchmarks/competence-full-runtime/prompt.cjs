'use strict';

const rendering = require('../../backend/src/services/functionInduction/prompt');

function build(context) {
  return 'Software engineering experiment: infer typed numerical function programs from the public samples '
    + 'in your sealed bounded_function_induction method contract. Compute actual coefficients and check all '
    + 'observations. Return functionPrograms.rules and the evidence fields required by your worker kind. '
    + 'There are no file edits, external lookups, or private query answers to produce. '
    + 'Explicitly distinguish unknown functions with missing data from ambiguous continuations. '
    + 'Requested operator and epoch pairs: ' + JSON.stringify(context.requested);
}

module.exports = {build, publicSamples: rendering.publicSamples};
