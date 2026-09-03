module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Workspace is alive via gRPC!" });
  }
};
