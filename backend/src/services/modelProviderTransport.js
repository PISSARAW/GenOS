'use strict';
const { getGlobalDispatcher } = require('undici');

async function request(input, consume) {
  const base = getGlobalDispatcher(), timeoutMs = Math.ceil(input.timeoutMs);
  const dispatcher = { dispatch(options, handler) {
    return base.dispatch({ ...options, headersTimeout: timeoutMs, bodyTimeout: timeoutMs }, handler);
  } };
  try {
    const response = await fetch(input.endpoint, { ...input.request, dispatcher });
    return await consume(response);
  } catch (error) {
    const code = error.cause?.code;
    if (typeof code === 'string' && /^UND_ERR_[A-Z_]+$/.test(code)) error.message += ` (${code})`;
    throw error;
  }
}

module.exports = { request };
