module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Telemetry is alive via gRPC!" });
  }
};
