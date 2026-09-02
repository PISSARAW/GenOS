module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Compliance is alive via gRPC!" });
  }
};
