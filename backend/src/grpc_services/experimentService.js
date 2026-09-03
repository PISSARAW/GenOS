module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Experiment is alive via gRPC!" });
  }
};
