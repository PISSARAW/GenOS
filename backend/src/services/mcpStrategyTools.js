/**
 * GenOS MCP Strategy Tools — Direct execution bridge for 78 strategies & 97 primitives.
 */
const strategyExecutionAdapter = require('./strategyExecutionAdapter');

function isStrategyTool(toolName) {
  if (!toolName || typeof toolName !== 'string') return false;
  return (
    toolName.startsWith('genos_strat_') ||
    toolName === 'genos_execute_primitive' ||
    toolName === 'genos_execute_strategy_pipeline'
  );
}

async function executeStrategyTool(toolName, args = {}) {
  if (!isStrategyTool(toolName)) return null;

  try {
    if (toolName.startsWith('genos_strat_')) {
      const primitive = toolName.slice('genos_strat_'.length);
      const res = await strategyExecutionAdapter.executePrimitive(primitive, args);
      const ok = res && res.success !== false;
      return {
        configured: true,
        success: ok,
        status: ok ? 'completed' : 'tool_error',
        transport: 'strategy_primitive',
        output: res
      };
    }

    if (toolName === 'genos_execute_primitive') {
      const primitive = args.primitive || args.primitive_name || args.name || '';
      const context = args.context || args;
      const res = await strategyExecutionAdapter.executePrimitive(primitive, context);
      const ok = res && res.success !== false;
      return {
        configured: true,
        success: ok,
        status: ok ? 'completed' : 'tool_error',
        transport: 'strategy_primitive',
        output: res
      };
    }

    if (toolName === 'genos_execute_strategy_pipeline') {
      const primitives = args.primitives || args.pipeline || [];
      const context = args.context || args;
      const res = await strategyExecutionAdapter.executePipelineWithFeedback(primitives, context);
      const ok = res && res.success !== false;
      return {
        configured: true,
        success: ok,
        status: ok ? 'completed' : 'tool_error',
        transport: 'strategy_primitive',
        output: res
      };
    }
  } catch (err) {
    return {
      configured: true,
      success: false,
      status: 'tool_error',
      transport: 'strategy_primitive',
      output: { success: false, error: err.message }
    };
  }

  return null;
}

module.exports = {
  isStrategyTool,
  executeStrategyTool
};
