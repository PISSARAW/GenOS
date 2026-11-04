'use strict';
const mission = 'Implement and export increment(x), returning x + 1 for every integer input.';
const criterion = 'code_contract';
const CALIBRATION = Object.freeze([
  {id: 'code_absent', phase: 'artifact', mission, criterion,
    text: '// TODO implement increment(x) to return x + 1.\nmodule.exports = {};', expected: 'fail'},
  {id: 'code_direct', phase: 'artifact', mission, criterion,
    text: 'function increment(x) { return x + 1; }\nmodule.exports = { increment };', expected: 'pass'},
  {id: 'code_wrong_operator', phase: 'artifact', mission, criterion,
    text: 'function increment(x) { return x - 1; }\nmodule.exports = { increment };', expected: 'fail'},
  {id: 'code_local_variable', phase: 'artifact', mission, criterion,
    text: 'function increment(x) { const next = x + 1; return next; }\nmodule.exports = { increment };', expected: 'pass'}
]);
const DESCRIPTION = 'For this calibration snippet only, determine whether the code implements and exports increment(x) returning x + 1 for every integer input. A TODO is not an implementation. Reason from this bounded expression. This reader control is not an executed-test receipt for a production artifact.';
module.exports = {CALIBRATION, DESCRIPTION};
