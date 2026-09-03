module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service ControlPlane is alive via gRPC!" });
  }
};
