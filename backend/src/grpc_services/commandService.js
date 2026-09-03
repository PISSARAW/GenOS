module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Command is alive via gRPC!" });
  }
};
