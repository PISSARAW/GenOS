const genosCli = require('../services/genosCli');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Command is alive via gRPC!" }),

  ExecuteCommand: async (call, callback) => {
    try {
      const { command, args } = call.request || {};
      const commandName = String(command || '').trim();
      if (!commandName || commandName === 'genos' || commandName.includes(' ') || commandName.includes('\\') || commandName.includes('/')) {
        return callback(null, { exit_code: 2, success: false, status: 'invalid_command', stdout: '', stderr: 'command must be one native GenOS subcommand.' });
      }
      const res = await genosCli.runGenos([commandName, ...(Array.isArray(args) ? args.map(String) : [])]);
      callback(null, {
        exit_code: res.exitCode ?? (res.ok ? 0 : 1),
        success: res.ok === true,
        status: res.ok ? 'completed' : (res.code || 'failed'),
        stdout: res.stdout || '',
        stderr: res.stderr || res.error || ''
      });
    } catch (err) {
      callback(null, { exit_code: 1, success: false, status: 'failed', stdout: '', stderr: err.message });
    }
  }
};
