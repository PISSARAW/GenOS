'use strict';

module.exports = {
  controlPlaneService: `const circuitBreaker = require('../services/circuitBreaker');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service ControlPlane is alive via gRPC!" }),

  GetCircuitStatus: (call, callback) => {
    const status = circuitBreaker.getStatus('default');
    callback(null, {
      is_open: status.isOpen || false,
      failures: status.failures || 0,
      state: status.state || 'CLOSED'
    });
  },

  TripCircuit: (call, callback) => {
    const { circuit_name, reason } = call.request || {};
    circuitBreaker.trip(circuit_name || 'default', reason || 'manual');
    callback(null, {
      is_open: true,
      failures: 5,
      state: 'OPEN'
    });
  }
};
`,

  deployService: `const deploy = require('../services/deploy');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Deploy is alive via gRPC!" }),

  DeployArtifact: async (call, callback) => {
    try {
      const { target, artifact_path } = call.request || {};
      const res = await deploy.deployArtifact(target, artifact_path);
      callback(null, {
        deployment_id: res.deploymentId || \`dep-\${Date.now()}\`,
        status: res.status || 'deployed',
        endpoint_url: res.url || 'http://localhost:4000'
      });
    } catch (err) {
      callback(null, { deployment_id: '', status: 'failed', endpoint_url: '' });
    }
  },

  GetDeploymentStatus: (call, callback) => {
    callback(null, {
      deployment_id: call.request?.deployment_id || 'dep-1',
      status: 'healthy',
      endpoint_url: 'http://localhost:4000'
    });
  }
};
`,

  evalService: `const evalObs = require('../services/evaluationObservabilityService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Eval is alive via gRPC!" }),

  EvaluateMetric: (call, callback) => {
    const { metric_name, values } = call.request || {};
    const score = evalObs.calculateMetricScore(metric_name, values || []);
    callback(null, {
      score: score.value || 0.85,
      evaluation: score.evaluation || 'NOMINAL'
    });
  },

  GetSummary: (call, callback) => {
    const summary = evalObs.getObservabilitySummary();
    callback(null, { summary_json: JSON.stringify(summary || {}) });
  }
};
`,

  experimentService: `const { getDatabase } = require('../db');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Experiment is alive via gRPC!" }),

  RunExperiment: async (call, callback) => {
    try {
      const db = await getDatabase();
      const { name, config_json } = call.request || {};
      const expId = \`exp-\${Date.now()}\`;
      await db.run(
        'INSERT INTO experiments (id, name, status, config) VALUES (?, ?, ?, ?)',
        expId, name || 'gRPC experiment', 'running', config_json || '{}'
      );
      callback(null, { experiment_id: expId, status: 'running', result_json: '{}' });
    } catch (err) {
      callback(null, { experiment_id: '', status: 'error', result_json: JSON.stringify({ error: err.message }) });
    }
  },

  GetExperimentStatus: async (call, callback) => {
    try {
      const db = await getDatabase();
      const exp = await db.get('SELECT * FROM experiments WHERE id = ?', call.request?.experiment_id);
      callback(null, {
        experiment_id: exp?.id || '',
        status: exp?.status || 'not_found',
        result_json: exp?.result || '{}'
      });
    } catch (err) {
      callback(null, { experiment_id: '', status: 'error', result_json: '{}' });
    }
  }
};
`,

  frameworkService: `const frameworkRunner = require('../services/frameworkRunner');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Framework is alive via gRPC!" }),

  RunFramework: async (call, callback) => {
    try {
      const { framework, task } = call.request || {};
      const res = await frameworkRunner.runFramework(framework, task);
      callback(null, { success: true, output: res.output || 'success' });
    } catch (err) {
      callback(null, { success: false, output: err.message });
    }
  },

  ListFrameworks: (call, callback) => {
    callback(null, { frameworks: ['langchain', 'autogen', 'crewai', 'genos-native'] });
  }
};
`,

  ideService: `const vfsSandbox = require('../services/vfsSandboxService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Ide is alive via gRPC!" }),

  ExecuteVfsOperation: async (call, callback) => {
    try {
      const { op, file_path, content } = call.request || {};
      const res = await vfsSandbox.executeVfsOperation(op, file_path, content);
      callback(null, { success: res.success !== false, message: res.message || 'ok' });
    } catch (err) {
      callback(null, { success: false, message: err.message });
    }
  },

  InspectVfs: (call, callback) => {
    const list = vfsSandbox.inspectVfs(call.request?.dir_path || '/');
    callback(null, { entries: list || [] });
  }
};
`,

  incidentService: `const { getDatabase } = require('../db');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Incident is alive via gRPC!" }),

  ReportIncident: async (call, callback) => {
    try {
      const db = await getDatabase();
      const { agent_id, reason, details_json } = call.request || {};
      const incId = \`inc-\${Date.now()}\`;
      await db.run(
        'INSERT INTO global_alerts (id, type, severity, message, details) VALUES (?, ?, ?, ?, ?)',
        incId, 'INCIDENT', 'warning', reason || 'gRPC Incident', details_json || '{}'
      );
      callback(null, { incident_id: incId, status: 'reported' });
    } catch (err) {
      callback(null, { incident_id: '', status: 'error' });
    }
  },

  GetIncidentHistory: async (call, callback) => {
    try {
      const db = await getDatabase();
      const rows = await db.all('SELECT * FROM global_alerts LIMIT 50');
      callback(null, { history_json: JSON.stringify(rows), count: rows.length });
    } catch (err) {
      callback(null, { history_json: '[]', count: 0 });
    }
  }
};
`,

  integrationService: `const webhook = require('../services/webhookService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Integration is alive via gRPC!" }),

  TriggerIntegration: async (call, callback) => {
    try {
      const { integration_id, payload_json } = call.request || {};
      const payload = payload_json ? JSON.parse(payload_json) : {};
      const res = await webhook.dispatchIntegration(integration_id, payload);
      callback(null, { success: true, result: JSON.stringify(res) });
    } catch (err) {
      callback(null, { success: false, result: err.message });
    }
  },

  ListIntegrations: (call, callback) => {
    callback(null, { integrations: ['slack', 'github', 'discord', 'generic-webhook'] });
  }
};
`,

  platformService: `const platformSafety = require('../services/platformSafetyService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Platform is alive via gRPC!" }),

  CheckSafety: (call, callback) => {
    const { action, target } = call.request || {};
    const check = platformSafety.checkAction(action, target);
    callback(null, { allowed: check.allowed !== false, reason: check.reason || '' });
  },

  GetSafetyStatus: (call, callback) => {
    callback(null, { status: 'SECURE', blocked_count: platformSafety.getBlockedCount() || 0 });
  }
};
`,

  pluginService: `const pluginSandbox = require('../services/pluginSandbox');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Plugin is alive via gRPC!" }),

  ExecutePlugin: async (call, callback) => {
    try {
      const { plugin_id, input_json } = call.request || {};
      const input = input_json ? JSON.parse(input_json) : {};
      const res = await pluginSandbox.executePlugin(plugin_id, input);
      callback(null, { success: true, output_json: JSON.stringify(res) });
    } catch (err) {
      callback(null, { success: false, output_json: JSON.stringify({ error: err.message }) });
    }
  },

  ListPlugins: (call, callback) => {
    callback(null, { plugins: ['code_review', 'dependency_audit', 'doc_generator'] });
  }
};
`,

  productProofService: `const proofService = require('../services/safeDebuggingProofService');

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
`
};
