module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Sso is alive via gRPC!" });
  }
};
