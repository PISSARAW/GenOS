const arenaTask = require('../services/arenaTaskEvaluation');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Evaluation is alive via gRPC!" }),

  EvaluateDossier: (call, callback) => {
    try {
      const { worker_id, evidence_report_json } = call.request || {};
      const rep = evidence_report_json ? JSON.parse(evidence_report_json) : {};
      const cand = arenaTask.dossierToCandidate({ workerId: worker_id, evidenceReport: rep });
      callback(null, {
        fitness_score: cand.fitnessScore || 50,
        pass_rate: cand.adversarialPassRate || 50,
        claims: cand.claimsCount || 0
      });
    } catch (err) {
      callback({ code: 3, message: `Invalid dossier evaluation: ${err.message}` });
    }
  },

  CalculateParetoFront: (call, callback) => {
    try {
      const dossiers = (call.request?.dossiers_json || []).map((d) => typeof d === 'string' ? JSON.parse(d) : d);
      const res = arenaTask.evaluateDossiersPareto(dossiers);
      callback(null, {
        pareto_count: res.paretoFrontCount || 0,
        knee_candidate_id: res.kneePoint?.candidateId || '',
        leaderboard_json: JSON.stringify(res.leaderboard || [])
      });
    } catch (err) {
      callback({ code: 3, message: `Invalid Pareto evaluation: ${err.message}` });
    }
  }
};
