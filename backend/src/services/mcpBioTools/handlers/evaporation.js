const strategyExecutionAdapter = require('../../strategyExecutionAdapter');

async function handleEvaporation(args, strategyAdapter) {
  const adapter = (strategyAdapter && typeof strategyAdapter.executePrimitive === 'function')
    ? strategyAdapter
    : strategyExecutionAdapter;
  const res = await adapter.executePrimitive('evaporation', args || {});
  return {
    configured: true,
    success: res.success !== false,
    status: res.success ? 'completed' : 'tool_error',
    transport: 'local',
    output: JSON.stringify(res)
  };
}

function handleEvaporationError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.message };
}

module.exports = { handleEvaporation, handleEvaporationError };
