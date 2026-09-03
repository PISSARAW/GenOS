module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Deploy is alive via gRPC!" });
  }
};
