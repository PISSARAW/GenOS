module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Plugin is alive via gRPC!" });
  }
};
