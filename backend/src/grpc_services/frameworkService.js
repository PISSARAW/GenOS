const frameworkRunner = require('../services/frameworkRunner');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Framework is alive via gRPC!" }),

  RunFramework: async (call, callback) => {
    try {
      const { framework, task } = call.request || {};
      const res = await frameworkRunner.runFramework(framework, task);
      callback(null, { success: true, output: res.output || 'success' });
    } catch (err) {
      callback(null, { success: false, output: err.message });
    }
  },

  ListFrameworks: (call, callback) => {
    callback(null, { frameworks: ['langchain', 'autogen', 'crewai', 'genos-native'] });
  }
};
