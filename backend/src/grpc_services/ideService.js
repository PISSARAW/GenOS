module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Ide is alive via gRPC!" });
  }
};
