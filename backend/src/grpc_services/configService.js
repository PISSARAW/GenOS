module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Config is alive via gRPC!" });
  }
};
