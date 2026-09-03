module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Rag is alive via gRPC!" });
  }
};
