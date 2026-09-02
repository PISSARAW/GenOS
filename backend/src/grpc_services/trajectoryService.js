module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Trajectory is alive via gRPC!" });
  }
};
