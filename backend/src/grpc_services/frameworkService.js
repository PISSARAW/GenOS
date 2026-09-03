module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Framework is alive via gRPC!" });
  }
};
