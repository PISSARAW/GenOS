module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Swarm is alive via gRPC!" });
  }
};
