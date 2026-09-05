const os = require('os');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Core is alive via gRPC!" }),

  GetSystemHealth: (call, callback) => {
    callback(null, {
      healthy: true,
      uptime: `${os.uptime()}s`
    });
  }
};
