'use strict';
const oracle = require('./oracle.cjs');

process.on('disconnect', () => process.exit(0));
process.on('message', message => {
  try {
    if (message?.type !== 'evaluate' || !Number.isSafeInteger(message.id)) throw Error('INVALID_REQUEST');
    const result = oracle.answer(message.input);
    process.send({ type: 'result', id: message.id, result });
  } catch (error) {
    process.send({ type: 'error', id: message?.id, error: error.message });
  }
});
process.send({ type: 'ready' });
