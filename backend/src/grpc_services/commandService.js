const genosCli = require('../services/genosCli');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Command is alive via gRPC!" }),

  ExecuteCommand: async (call, callback) => {
    try {
      const { command, args } = call.request || {};
      const fullCmd = [command, ...(args || [])].join(' ');
      const res = await genosCli.runCommand(fullCmd);
      callback(null, {
        exit_code: res.exitCode || 0,
        stdout: res.stdout || '',
        stderr: res.stderr || ''
      });
    } catch (err) {
      callback(null, { exit_code: 1, stdout: '', stderr: err.message });
    }
  }
};
