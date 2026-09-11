const proofService = require('../services/safeDebuggingProofService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service ProductProof is alive via gRPC!" }),

  GenerateProof: async (call, callback) => {
    try {
      const { feature_id, execution_id } = call.request || {};
      const proof = await proofService.generateProof(feature_id, execution_id);
      callback(null, {
        proof_hash: proof.hash || 'hash-001',
        claims_json: JSON.stringify(proof.claims || [])
      });
    } catch (err) {
      callback(null, { proof_hash: '', claims_json: '[]' });
    }
  },

  VerifyProof: (call, callback) => {
    const verified = proofService.verifyProof(call.request?.proof_hash);
    callback(null, { verified: !!verified, explanation: verified ? 'Proof verified.' : 'Invalid proof.' });
  }
};
