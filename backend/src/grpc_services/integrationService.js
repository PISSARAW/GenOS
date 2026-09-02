module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Integration is alive via gRPC!" });
  }
};
