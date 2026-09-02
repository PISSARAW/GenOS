module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Lineage is alive via gRPC!" });
  }
};
