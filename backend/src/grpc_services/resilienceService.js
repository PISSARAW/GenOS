module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Resilience is alive via gRPC!" });
  }
};
