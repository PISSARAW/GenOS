module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Secret is alive via gRPC!" });
  }
};
