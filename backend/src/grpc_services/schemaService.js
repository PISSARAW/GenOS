module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Schema is alive via gRPC!" });
  }
};
