const compliance = require('../services/complianceService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Compliance is alive via gRPC!" }),

  CheckCompliance: (call, callback) => {
    const { workspace_id, rule_id } = call.request || {};
    const res = compliance.checkWorkspaceCompliance(workspace_id, rule_id);
    callback(null, {
      compliant: res.compliant !== false,
      violations: res.violations || []
    });
  },

  GetAuditReport: (call, callback) => {
    const report = compliance.generateAuditReport();
    callback(null, {
      report_json: JSON.stringify(report),
      total_checks: report.totalChecks || 10
    });
  }
};
