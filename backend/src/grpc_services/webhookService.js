module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Webhook is alive via gRPC!" });
  }
};
