module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Strategy is alive via gRPC!" });
  }
};
