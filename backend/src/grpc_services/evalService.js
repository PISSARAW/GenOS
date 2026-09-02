module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Eval is alive via gRPC!" });
  }
};
