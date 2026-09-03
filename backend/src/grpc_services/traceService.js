module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Trace is alive via gRPC!" });
  }
};
