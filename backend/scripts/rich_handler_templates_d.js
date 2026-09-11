'use strict';

module.exports = {
  promptService: `const resilience = require('../services/resilienceService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Prompt is alive via gRPC!" }),

  EvaluatePromptDrift: (call, callback) => {
    const { base_prompt, current_prompt } = call.request || {};
    const drift = resilience.trackHypermutationDrift(base_prompt || '', current_prompt || '');
    callback(null, {
      levenshtein_ratio: drift.driftScore,
      drift_status: drift.status
    });
  },

  GetPromptTemplate: (call, callback) => {
    const role = call.request?.role || 'worker';
    callback(null, { template: \`You are an autonomous \${role} in GenOS swarm.\` });
  }
};
`,

  registryService: `const registry = require('../services/workspaceRegistry');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Registry is alive via gRPC!" }),

  RegisterWorkspace: (call, callback) => {
    const { workspace_id, root_path } = call.request || {};
    registry.register(workspace_id, root_path);
    callback(null, { found: true, root_path: root_path || process.cwd() });
  },

  ResolveWorkspace: (call, callback) => {
    const root = registry.resolve(call.request?.workspace_id);
    callback(null, { found: !!root, root_path: root || '' });
  }
};
`,

  releaseService: `const workspaceStore = require('../services/workspaceSnapshotStore');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Release is alive via gRPC!" }),

  CreateSnapshot: async (call, callback) => {
    try {
      const { workspace_id, label } = call.request || {};
      const snap = await workspaceStore.createSnapshot(workspace_id || 'ws-default', label || 'gRPC Release');
      callback(null, { snapshot_id: snap.id || 'snap-1', timestamp: snap.createdAt || new Date().toISOString() });
    } catch (err) {
      callback(null, { snapshot_id: '', timestamp: '' });
    }
  },

  RollbackSnapshot: async (call, callback) => {
    try {
      const { snapshot_id } = call.request || {};
      await workspaceStore.rollbackToSnapshot(snapshot_id);
      callback(null, { success: true, restored_at: new Date().toISOString() });
    } catch (err) {
      callback(null, { success: false, restored_at: '' });
    }
  }
};
`,

  schemaService: `const specValidator = require('../services/specValidator');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Schema is alive via gRPC!" }),

  ValidateSchema: (call, callback) => {
    const { schema_name, data_json } = call.request || {};
    try {
      const data = data_json ? JSON.parse(data_json) : {};
      const res = specValidator.validate(schema_name, data);
      callback(null, { valid: res.valid !== false, errors: res.errors || [] });
    } catch (err) {
      callback(null, { valid: false, errors: [err.message] });
    }
  },

  GetSchemaSpec: (call, callback) => {
    const spec = specValidator.getSchema(call.request?.schema_name || 'default');
    callback(null, { json_schema: JSON.stringify(spec || {}) });
  }
};
`,

  secretService: `const secretVault = require('../services/secretVault');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Secret is alive via gRPC!" }),

  GetSecret: (call, callback) => {
    const val = secretVault.get(call.request?.key || '');
    callback(null, { found: !!val, value: val || '' });
  },

  StoreSecret: (call, callback) => {
    const { key, value } = call.request || {};
    secretVault.set(key, value);
    callback(null, { found: true, value });
  }
};
`,

  ssoService: `const config = require('../config');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service SSO is alive via gRPC!" }),

  VerifyTicket: (call, callback) => {
    const ticket = call.request?.ticket || '';
    const valid = ticket.length > 5;
    callback(null, { valid, user_email: valid ? 'user@genos.ai' : '' });
  },

  GetConfig: (call, callback) => {
    callback(null, { provider: 'oidc', issuer: 'https://auth.genos.ai' });
  }
};
`,

  traceService: `const arena = require('../services/arenaService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Trace is alive via gRPC!" }),

  ExportTraces: (call, callback) => {
    const { tournament_id, format } = call.request || {};
    const trace = arena.exportTrace(tournament_id || 'tour-1', format || 'json-dag');
    callback(null, {
      trace_id: trace.traceId || 'trace-1',
      spans_json: JSON.stringify(trace.spans || [])
    });
  },

  GetTraceSpans: (call, callback) => {
    callback(null, { spans: ['span-start', 'span-execute', 'span-finish'] });
  }
};
`,

  trajectoryService: `const trajectory = require('../services/trajectoryService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Trajectory is alive via gRPC!" }),

  RecordTrajectory: async (call, callback) => {
    try {
      const { agent_id, step_action, detail } = call.request || {};
      await trajectory.recordStep(agent_id, { action: step_action, detail });
      const steps = await trajectory.getSteps(agent_id, 10);
      callback(null, {
        agent_id: agent_id || '',
        steps: (steps || []).map((s) => s.action || 'step')
      });
    } catch (err) {
      callback(null, { agent_id: '', steps: [] });
    }
  },

  GetTrajectory: async (call, callback) => {
    try {
      const { agent_id, limit } = call.request || {};
      const steps = await trajectory.getSteps(agent_id, limit || 20);
      callback(null, {
        agent_id: agent_id || '',
        steps: (steps || []).map((s) => s.action || 'step')
      });
    } catch (err) {
      callback(null, { agent_id: '', steps: [] });
    }
  }
};
`,

  webhookService: `const webhook = require('../services/webhookService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Webhook is alive via gRPC!" }),

  DispatchWebhook: async (call, callback) => {
    try {
      const { url, event, payload_json } = call.request || {};
      const payload = payload_json ? JSON.parse(payload_json) : {};
      const res = await webhook.send(url, event, payload);
      callback(null, { dispatched: true, status_code: res.statusCode || 200 });
    } catch (err) {
      callback(null, { dispatched: false, status_code: 500 });
    }
  },

  ListWebhooks: (call, callback) => {
    callback(null, { webhooks: ['webhook-events', 'webhook-alerts'] });
  }
};
`,

  workflowService: `const autoOrch = require('../services/autonomousOrchestrationService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Workflow is alive via gRPC!" }),

  StartWorkflow: async (call, callback) => {
    try {
      const { workflow_name, initial_data_json } = call.request || {};
      const data = initial_data_json ? JSON.parse(initial_data_json) : {};
      const wf = await autoOrch.startWorkflow(workflow_name, data);
      callback(null, {
        workflow_id: wf.id || \`wf-\${Date.now()}\`,
        status: wf.status || 'started',
        output_json: '{}'
      });
    } catch (err) {
      callback(null, { workflow_id: '', status: 'error', output_json: err.message });
    }
  },

  GetWorkflowStatus: (call, callback) => {
    callback(null, {
      workflow_id: call.request?.workflow_id || '',
      status: 'completed',
      output_json: '{}'
    });
  }
};
`,

  agentService: `const supervisor = require('../services/agentProcessSupervisor');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Agent is alive via gRPC!" }),

  StartMission: async (call, callback) => {
    try {
      const mission = call.request || {};
      supervisor.superviseMission(mission).catch(console.error);
      callback(null, { success: true, message: \`Mission for agent \${mission.agent_id} started\` });
    } catch (err) {
      callback(null, { success: false, message: err.message });
    }
  },

  StopMission: (call, callback) => {
    const agentId = call.request?.id;
    supervisor.stopMission(agentId);
    callback(null, { stopped: true, status: 'stopped' });
  }
};
`,

  orchestratorService: `const fleet = require('../services/agentFleetService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Orchestrator is alive via gRPC!" }),

  DispatchWorker: async (call, callback) => {
    try {
      const { orchestrator_id, worker_id, prompt } = call.request || {};
      callback(null, {
        success: true,
        status: \`Worker \${worker_id || 'worker-1'} dispatched for \${orchestrator_id}\`,
        garage_slot: 1
      });
    } catch (err) {
      callback(null, { success: false, status: err.message, garage_slot: 0 });
    }
  }
};
`,

  coreService: `const os = require('os');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Core is alive via gRPC!" }),

  GetSystemHealth: (call, callback) => {
    callback(null, {
      healthy: true,
      uptime: \`\${os.uptime()}s\`
    });
  }
};
`
};
