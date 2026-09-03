module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Evaluation is alive via gRPC!" });
  }
};
