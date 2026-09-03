module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service ProductProof is alive via gRPC!" });
  }
};
