const proofService = require('../services/safeDebuggingProofService');
const grpc = require('@grpc/grpc-js');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service ProductProof is alive via gRPC!" }),

  GenerateProof: async (call, callback) => {
    try {
      const { feature_id, execution_id } = call.request || {};
      const proof = await proofService.generateProof(feature_id, execution_id);
      callback(null, {
        proof_hash: proof.hash,
        claims_json: JSON.stringify(proof.claims || [])
      });
    } catch (err) {
      callback({ code: grpc.status.FAILED_PRECONDITION, message: err.message });
    }
  },

  VerifyProof: async (call, callback) => {
    try {
      const latest = await proofService.readLatest();
      const verified = latest.available && proofService.verifyProof(call.request?.proof_hash, latest.evidence);
      callback(null, { verified, explanation: verified ? 'Proof verified.' : 'Invalid proof.' });
    } catch (err) {
      callback({ code: grpc.status.FAILED_PRECONDITION, message: err.message });
    }
  }
};
