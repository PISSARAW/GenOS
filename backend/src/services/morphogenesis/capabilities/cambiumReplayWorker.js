'use strict';

const { parentPort } = require('worker_threads');
const { compare } = require('./cambiumDecision');

parentPort.once('message', (input) => {
  try { parentPort.postMessage({ result: compare(input) }); }
  catch (error) { parentPort.postMessage({ error: error.message }); }
});
