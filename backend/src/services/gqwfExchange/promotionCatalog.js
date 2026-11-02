'use strict';

const catalog = require('../gqwf/catalog');

async function guardedMutation(options) {
  await options.assertSafeCas();
  let result;
  let mutationError;
  try { result = await options.run(); }
  catch (error) { mutationError = error; }
  await options.assertSafeCas();
  try { await catalog.checkpointMetadata(options.db, { workspaceId: options.workspaceId }); }
  catch (error) {
    if (!mutationError) throw error;
    mutationError.cause = error;
  }
  await options.assertSafeCas();
  if (mutationError) throw mutationError;
  return result;
}

module.exports = { guardedMutation };
