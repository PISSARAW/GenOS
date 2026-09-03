module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Registry is alive via gRPC!" });
  }
};
