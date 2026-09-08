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
    Promise.resolve()
      .then(async () => {
        const agentId = String(call.request?.agent_id || '').trim();
        if (!agentId) throw Object.assign(new Error('agent_id is required.'), { code: 3 });
        const db = await require('../db').getDatabase();
        const contract = await strategyContract.getLatestContract(db, agentId);
        if (!contract) throw Object.assign(new Error(`No strategy contract exists for agent '${agentId}'.`), { code: 5 });
        callback(null, { contract_json: JSON.stringify(contract.contract), contract_id: contract.id, version: contract.version, contract_hash: contract.contractHash });
      })
      .catch((err) => callback({ code: err.code || 13, message: err.message }));
  }
};
