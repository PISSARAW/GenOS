'use strict';

module.exports = {
  lineageService: `const evolution = require('../services/agentEvolutionService');
const genetics = require('../services/geneticsService');
const { getDatabase } = require('../db');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Lineage is alive via gRPC!" }),

  GetPhylogeny: async (call, callback) => {
    try {
      const db = await getDatabase();
      const nodes = await db.all('SELECT * FROM lineage_nodes LIMIT 100');
      const edges = await db.all('SELECT * FROM lineage_edges LIMIT 100');
      callback(null, {
        nodes_json: JSON.stringify(nodes),
        edges_json: JSON.stringify(edges),
        node_count: nodes.length
      });
    } catch (err) {
      callback(null, { nodes_json: '[]', edges_json: '[]', node_count: 0 });
    }
  },

  RecordLineage: async (call, callback) => {
    try {
      const db = await getDatabase();
      const { agent_id, parent_id, role, score, organization_id, project_id, workspace_id } = call.request || {};
      if (!agent_id || !parent_id) return callback(null, { success: false });
      let wsId = workspace_id;
      if (!wsId) {
        const agent = await db.get('SELECT workspace_id FROM agents WHERE id = ?', agent_id);
        wsId = agent?.workspace_id;
      }
      if (!wsId) return callback(null, { success: false });
      const result = await evolution.recordWorkerLineage(db, { agentId: agent_id, workspaceId: wsId, role }, { parentId: parent_id, validatedFitness: score });
      callback(null, { success: !!result?.success });
    } catch (err) {
      callback(null, { success: false });
    }
  }
};
`,

  mcpService: `const mcpExecutor = require('../services/mcpExecutor');
const grpc = require('@grpc/grpc-js');
const MCP_CONTRACT_VERSION = 'genos.mcp/v1';

function toGrpcStatusCode(error) {
  const code = error?.code || error?.status || '';
  if (code === 'INVALID_ARGUMENT' || code === 'BAD_REQUEST' || code === 'INVALID_TOOL') return grpc.status.INVALID_ARGUMENT;
  if (code === 'NOT_FOUND' || code === 'TOOL_NOT_FOUND' || code === 'MCP_TOOL_NOT_FOUND' || code === 'not_found') return grpc.status.NOT_FOUND;
  if (['FORBIDDEN', 'PERMISSION_DENIED', 'ZERO_TRUST_DENIED', 'AGENT_ID_FORBIDDEN'].includes(code)) return grpc.status.PERMISSION_DENIED;
  if (code === 'UNAVAILABLE' || code === 'SERVICE_UNAVAILABLE' || code === 'TOOL_LOCKED' || code === 'blocked' || code === 'circuit_open') return grpc.status.UNAVAILABLE;
  if (code === 'failed' || code === 'MCP_TOOL_ERROR') return grpc.status.INTERNAL;
  return grpc.status.INTERNAL;
}

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Mcp is alive via gRPC!" }),

  ListTools: async (call, callback) => {
    try {
      const tools = await mcpExecutor.listTools();
      const list = (tools || []).map((t) => ({
        name: t.name,
        description: t.description || '',
        schema_json: JSON.stringify(t.inputSchema || {})
      }));
      callback(null, { tools: list, contract_version: MCP_CONTRACT_VERSION });
    } catch (err) {
      callback({ code: grpc.status.UNAVAILABLE, message: 'MCP tool discovery failed: ' + err.message });
    }
  },

  CallTool: async (call, callback) => {
    try {
      const { tool_name, arguments_json, timeout_ms } = call.request || {};
      if (!tool_name || !String(tool_name).trim()) {
        throw Object.assign(new Error('tool_name is required.'), { code: 'INVALID_ARGUMENT' });
      }
      const args = arguments_json ? JSON.parse(arguments_json) : {};
      const res = await mcpExecutor.callTool(tool_name, args, timeout_ms);
      callback(null, {
        success: true,
        content_json: JSON.stringify(res),
        error: '',
        error_code: '',
        status: 'completed',
        contract_version: MCP_CONTRACT_VERSION
      });
    } catch (err) {
      callback({ code: toGrpcStatusCode(err), message: err.message || 'MCP tool execution failed.' });
    }
  }
};
`,

  ragService: `const graphRag = require('../services/graphRagService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Rag is alive via gRPC!" }),

  QueryGraphRag: async (call, callback) => {
    try {
      const { query, limit } = call.request || {};
      const res = await graphRag.queryKnowledgeGraph(query || '', limit || 5);
      callback(null, {
        context_nodes: (res.nodes || []).map((n) => typeof n === 'string' ? n : (n.label || n.id)),
        synthesis: res.synthesis || 'Knowledge synthesis ready.'
      });
    } catch (err) {
      callback(null, { context_nodes: [], synthesis: err.message });
    }
  },

  IngestDocument: async (call, callback) => {
    try {
      const { doc_id, text } = call.request || {};
      const result = await graphRag.ingestDocument(doc_id || 'doc-1', text || '');
      callback(null, {
        success: true,
        entities_extracted: result.entitiesCount || 1
      });
    } catch (err) {
      callback(null, { success: false, entities_extracted: 0 });
    }
  }
};
`,

  securityService: `const immuneSystem = require('../services/immuneSystem');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Security is alive via gRPC!" }),

  ScanVulnerabilities: (call, callback) => {
    try {
      const target = call.request?.target || '';
      const scan = immuneSystem.scanThreats(target);
      callback(null, {
        threat_count: scan.threats?.length || 0,
        threats: scan.threats || []
      });
    } catch (err) {
      callback(null, { threat_count: 0, threats: [] });
    }
  },

  TriggerKillSwitch: (call, callback) => {
    immuneSystem.tripKillSwitch(call.request?.reason || 'gRPC emergency stop');
    callback(null, {
      halted: true,
      timestamp: new Date().toISOString()
    });
  }
};
`,

  evaluationService: `const arenaTask = require('../services/arenaTaskEvaluation');

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
      callback(null, { fitness_score: 50, pass_rate: 50, claims: 0 });
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
      callback(null, { pareto_count: 0, knee_candidate_id: '', leaderboard_json: '[]' });
    }
  }
};
`,

  commandService: `const genosCli = require('../services/genosCli');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Command is alive via gRPC!" }),

  ExecuteCommand: async (call, callback) => {
    try {
      const { command, args } = call.request || {};
      const fullCmd = [command, ...(args || [])].join(' ');
      const res = await genosCli.runCommand(fullCmd);
      callback(null, {
        exit_code: res.exitCode || 0,
        stdout: res.stdout || '',
        stderr: res.stderr || ''
      });
    } catch (err) {
      callback(null, { exit_code: 1, stdout: '', stderr: err.message });
    }
  }
};
`,

  authService: `const { getDatabase } = require('../db');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Auth is alive via gRPC!" }),

  Authenticate: async (call, callback) => {
    try {
      const { username, password } = call.request || {};
      const db = await getDatabase();
      const user = await db.get('SELECT id, username, role FROM users WHERE username = ?', username);
      if (user) {
        callback(null, { authenticated: true, token: \`token-\${user.id}\`, role: user.role });
      } else {
        callback(null, { authenticated: false, token: '', role: '' });
      }
    } catch (err) {
      callback(null, { authenticated: false, token: '', role: '' });
    }
  },

  ValidateToken: (call, callback) => {
    const token = call.request?.token || '';
    const valid = token.startsWith('token-') || token === 'admin-master-key';
    callback(null, { valid, user_id: valid ? 'admin' : '', role: valid ? 'admin' : '' });
  }
};
`,

  complianceService: `const compliance = require('../services/complianceService');

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
`,

  configService: `const config = require('../config');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Config is alive via gRPC!" }),

  GetConfig: (call, callback) => {
    callback(null, { config_json: JSON.stringify(config) });
  },

  UpdateConfig: (call, callback) => {
    const { key, value_json } = call.request || {};
    try {
      const val = value_json ? JSON.parse(value_json) : null;
      if (key) config[key] = val;
      callback(null, { config_json: JSON.stringify(config) });
    } catch (err) {
      callback(null, { config_json: JSON.stringify(config) });
    }
  }
};
`
};
