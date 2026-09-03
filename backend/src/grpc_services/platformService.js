module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Platform is alive via gRPC!" });
  }
};
