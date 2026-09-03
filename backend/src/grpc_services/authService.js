module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Auth is alive via gRPC!" });
  }
};
