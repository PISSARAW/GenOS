const genosCli = require('../services/genosCli');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service RustBridge is alive via gRPC!" }),

  InvokeRustCli: async (call, callback) => {
    try {
      const { command, args } = call.request || {};
      const cmdLine = [command, ...(args || [])].join(' ');
      const result = await genosCli.runCommand(cmdLine);
      callback(null, {
        exit_code: result.exitCode || 0,
        stdout: result.stdout || '',
        stderr: result.stderr || ''
      });
    } catch (err) {
      callback(null, { exit_code: 1, stdout: '', stderr: err.message });
    }
  },

  CheckBridgeHealth: (call, callback) => {
    const binPath = genosCli.resolveGenosBin();
    callback(null, {
      healthy: !!binPath,
      binary_path: binPath || 'not_found',
      version: 'GenOS v3.0.0-rust'
    });
  }
};
