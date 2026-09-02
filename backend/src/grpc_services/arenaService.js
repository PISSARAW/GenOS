module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Arena is alive via gRPC!" });
  }
};
