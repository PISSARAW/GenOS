module.exports = {
  Ping: (call, callback) => {
    callback(null, { status: "Service Mcp is alive via gRPC!" });
  }
};
