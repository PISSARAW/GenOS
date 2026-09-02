module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Memory is alive via gRPC!" });
  }
};
