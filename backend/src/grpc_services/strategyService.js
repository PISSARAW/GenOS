const strategyExecution = require('../services/strategyExecutionService');
const strategyContract = require('../services/strategyContractService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Strategy is alive via gRPC!" }),

  ExecuteStrategy: async (call, callback) => {
    try {
      const { strategy_name, context_json } = call.request || {};
      const ctx = context_json ? JSON.parse(context_json) : {};
      const result = await strategyExecution.executeStrategyPipeline(strategy_name || 'tree-search', ctx);
      callback(null, {
        success: result.success !== false,
        output_json: JSON.stringify(result),
        execution_run_id: result.executionRunId || `run-${Date.now()}`
      });
    } catch (err) {
      callback(null, { success: false, output_json: JSON.stringify({ error: err.message }), execution_run_id: '' });
    }
  },

  GetContract: (call, callback) => {
    try {
      const contract = strategyContract.getStrategyContract(call.request?.strategy_name || 'tree-search');
      callback(null, { contract_json: JSON.stringify(contract || {}) });
    } catch (err) {
      callback(null, { contract_json: '{}' });
    }
  }
};
