module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Incident is alive via gRPC!" });
  }
};
