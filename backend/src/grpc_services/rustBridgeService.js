module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service RustBridge is alive via gRPC!" });
  }
};
