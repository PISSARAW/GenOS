'use strict';

const { getDatabase } = require('../db');

function publicComposition(result) {
  const matrix = result.matrix;
  const output = { ...result };
  if (matrix) output.matrix = { matrixId: matrix.matrixId, version: matrix.version };
  return output;
}

async function composeBiologicalMode(args = {}) {
  try {
    const db = await getDatabase();
    const result = await require('./biologicalTopologyService').composeMode({
      db,
      orchestratorId: args.orchestrator_id,
      mode: args.mode,
      mission: args.mission,
      options: args.options || {}
    });
    return { configured: true, success: true, status: 'topology_composed', ...publicComposition(result) };
  } catch (error) {
    return { configured: true, success: false, status: 'tool_error', error: error.message };
  }
}

async function operateTopologySession(args = {}) {
  try {
    const db = await getDatabase();
    const result = await require('./topologySessionTools').applyTopologyOperation(db, args);
    return { configured: true, success: true, status: 'topology_session_updated', ...result };
  } catch (error) {
    return { configured: true, success: false, status: 'tool_error', error: error.message, code: error.code || null };
  }
}

module.exports = { composeBiologicalMode, operateTopologySession };
