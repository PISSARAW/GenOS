module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Security is alive via gRPC!" });
  }
};
