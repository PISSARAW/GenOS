module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Prompt is alive via gRPC!" });
  }
};
