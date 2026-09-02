module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Release is alive via gRPC!" });
  }
};
