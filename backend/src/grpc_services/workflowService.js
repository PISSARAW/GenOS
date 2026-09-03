module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Workflow is alive via gRPC!" });
  }
};
