'use strict';

module.exports = {
  arenaService: `const arena = require('../services/arenaService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Arena is alive via gRPC!" }),

  RunTournament: async (call, callback) => {
    try {
      let spec = {};
      if (call.request?.problem_spec_json) {
        spec = JSON.parse(call.request.problem_spec_json);
      }
      const result = await arena.runTournament(spec);
      callback(null, {
        success: true,
        winner: result.bestSolver?.name || 'mcts_solver',
        leaderboard_json: JSON.stringify(result.leaderboard || [])
      });
    } catch (err) {
      callback(null, { success: false, winner: '', leaderboard_json: JSON.stringify({ error: err.message }) });
    }
  },

  CalculatePareto: (call, callback) => {
    try {
      const candidates = call.request?.candidates_json ? JSON.parse(call.request.candidates_json) : [];
      const result = arena.calculateParetoFront(candidates);
      callback(null, {
        pareto_count: result.paretoFrontCount || 0,
        pareto_front_json: JSON.stringify(result.paretoFront || []),
        knee_point_json: JSON.stringify(result.kneePointRecommendation || {})
      });
    } catch (err) {
      callback(null, { pareto_count: 0, pareto_front_json: '[]', knee_point_json: '{}' });
    }
  },

  GetLeaderboard: (call, callback) => {
    const solvers = Object.entries(arena.SOLVER_PROFILES).map(([key, p]) => ({
      key,
      name: p.name,
      elo: p.baseElo
    }));
    callback(null, { solvers });
  }
};
`,

  memoryService: `const vectorMemory = require('../services/vectorMemoryService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Memory is alive via gRPC!" }),

  StoreMemory: async (call, callback) => {
    try {
      const { id, content, embedding } = call.request || {};
      await vectorMemory.recordExperience({
        id: id || \`exp-\${Date.now()}\`,
        content: content || '',
        vector: embedding || []
      });
      callback(null, { success: true });
    } catch (err) {
      callback(null, { success: false });
    }
  },

  SearchMemory: async (call, callback) => {
    try {
      const { text, vector, limit } = call.request || {};
      const query = (vector && vector.length > 0) ? vector : (text || '');
      const searchRes = await vectorMemory.searchMemory('grpc-client', query, limit || 5);
      const results = (searchRes.allScoredExperiences || []).map((e) => ({
        id: e.id || 'mem-1',
        content: e.content || e.title || '',
        embedding: e.vector || []
      }));
      callback(null, { results });
    } catch (err) {
      callback(null, { results: [] });
    }
  },

  CherryPickGoldenPath: (call, callback) => {
    try {
      const turns = (call.request?.turns_json || []).map((t) => typeof t === 'string' ? JSON.parse(t) : t);
      const res = vectorMemory.cherryPickGoldenPath(turns);
      callback(null, {
        golden_path_json: JSON.stringify(res.goldenPathSteps || res.goldenPath || []),
        noise_reduction_pct: res.noiseReductionPercent || 0
      });
    } catch (err) {
      callback(null, { golden_path_json: '[]', noise_reduction_pct: 0 });
    }
  }
};
`,

  swarmService: `const swarmMetrics = require('../services/swarmMetricsService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Swarm is alive via gRPC!" }),

  GetSwarmMetrics: (call, callback) => {
    try {
      const metrics = swarmMetrics.getSwarmMetrics();
      callback(null, {
        entropy: metrics.entropy || 0,
        normalized_entropy: metrics.normalizedEntropy || 0,
        state: metrics.state || 'IDLE',
        agent_count: metrics.agentCount || 0
      });
    } catch (err) {
      callback(null, { entropy: 0, normalized_entropy: 0, state: 'ERROR', agent_count: 0 });
    }
  },

  GetSwarmTopology: (call, callback) => {
    try {
      const topo = swarmMetrics.buildSwarmTopology();
      callback(null, {
        node_ids: (topo.nodes || []).map((n) => n.id),
        topology_json: JSON.stringify(topo)
      });
    } catch (err) {
      callback(null, { node_ids: [], topology_json: '{}' });
    }
  }
};
`,

  resilienceService: `const resilience = require('../services/resilienceService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Resilience is alive via gRPC!" }),

  TriggerApoptosis: async (call, callback) => {
    try {
      const { agent_id, reason } = call.request || {};
      const report = await resilience.generateApoptosisReport(agent_id || 'system', reason || 'manual');
      callback(null, {
        triggered: true,
        autopsy_report_json: JSON.stringify(report)
      });
    } catch (err) {
      callback(null, { triggered: false, autopsy_report_json: JSON.stringify({ error: err.message }) });
    }
  },

  FreezeState: async (call, callback) => {
    try {
      const { agent_id, state_json } = call.request || {};
      const state = state_json ? JSON.parse(state_json) : {};
      const snap = await resilience.freezeAgentState(agent_id || 'system', state);
      callback(null, {
        snapshot_id: snap.snapshotId || 'snap-1',
        frozen: snap.success !== false
      });
    } catch (err) {
      callback(null, { snapshot_id: '', frozen: false });
    }
  },

  ThawState: async (call, callback) => {
    try {
      const { snapshot_id } = call.request || {};
      const thawed = await resilience.thawAgentState(snapshot_id || 'snap-1');
      callback(null, {
        agent_id: thawed.agentId || '',
        restored_state_json: JSON.stringify(thawed.state || {})
      });
    } catch (err) {
      callback(null, { agent_id: '', restored_state_json: '{}' });
    }
  }
};
`,

  rustBridgeService: `const genosCli = require('../services/genosCli');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service RustBridge is alive via gRPC!" }),

  InvokeRustCli: async (call, callback) => {
    try {
      const { command, args } = call.request || {};
      const cmdLine = [command, ...(args || [])].join(' ');
      const result = await genosCli.runCommand(cmdLine);
      callback(null, {
        exit_code: result.exitCode || 0,
        stdout: result.stdout || '',
        stderr: result.stderr || ''
      });
    } catch (err) {
      callback(null, { exit_code: 1, stdout: '', stderr: err.message });
    }
  },

  CheckBridgeHealth: (call, callback) => {
    const binPath = genosCli.resolveGenosBin();
    callback(null, {
      healthy: !!binPath,
      binary_path: binPath || 'not_found',
      version: 'GenOS v3.0.0-rust'
    });
  }
};
`,

  strategyService: `const strategyExecution = require('../services/strategyExecutionService');
const strategyContract = require('../services/strategyContractService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Strategy is alive via gRPC!" }),

  ExecuteStrategy: async (call, callback) => {
    try {
      const { strategy_name, context_json } = call.request || {};
      const ctx = context_json ? JSON.parse(context_json) : {};
      const result = await strategyExecution.executeStrategyPipeline(strategy_name || 'tree-search', ctx);
      callback(null, {
        success: result.success !== false,
        output_json: JSON.stringify(result),
        execution_run_id: result.executionRunId || \`run-\${Date.now()}\`
      });
    } catch (err) {
      callback(null, { success: false, output_json: JSON.stringify({ error: err.message }), execution_run_id: '' });
    }
  },

  GetContract: (call, callback) => {
    try {
      const contract = strategyContract.getStrategyContract(call.request?.strategy_name || 'tree-search');
      callback(null, { contract_json: JSON.stringify(contract || {}) });
    } catch (err) {
      callback(null, { contract_json: '{}' });
    }
  }
};
`,

  telemetryService: `const telemetry = require('../services/telemetryObserver');
const swarmMetrics = require('../services/swarmMetricsService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Telemetry is alive via gRPC!" }),

  EmitEvent: (call, callback) => {
    try {
      const event = call.request || {};
      let payload = {};
      if (event.payload_json) {
        payload = JSON.parse(event.payload_json);
      }
      telemetry.emitEvent({
        agentId: event.agent_id || 'system',
        eventType: event.event_type || 'TELEMETRY_INGEST',
        action: event.action || 'OBSERVE',
        detail: event.detail || '',
        severity: event.severity || 'info',
        status: event.status || 'active',
        payload
      });
      callback(null, { success: true });
    } catch (err) {
      callback(null, { success: false });
    }
  },

  GetSwarmMetrics: (call, callback) => {
    try {
      const m = swarmMetrics.getSwarmMetrics();
      callback(null, { entropy: m.entropy || 0, state: m.state || 'IDLE' });
    } catch (err) {
      callback(null, { entropy: 0, state: 'ERROR' });
    }
  }
};
`,

  workspaceService: `const workspaceLifecycle = require('../services/agentWorkspaceLifecycleService');
const workspaceStore = require('../services/workspaceSnapshotStore');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Workspace is alive via gRPC!" }),

  ProvisionWorkspace: async (call, callback) => {
    try {
      const { workspace_id } = call.request || {};
      const root = await workspaceLifecycle.provisionWorkspace(workspace_id || 'ws-default');
      callback(null, { workspace_root: root || process.cwd() });
    } catch (err) {
      callback(null, { workspace_root: process.cwd() });
    }
  },

  CleanWorkspace: async (call, callback) => {
    try {
      const { workspace_id } = call.request || {};
      await workspaceLifecycle.cleanupWorkspace(workspace_id || 'ws-default');
      callback(null, { success: true });
    } catch (err) {
      callback(null, { success: false });
    }
  },

  GetDiff: async (call, callback) => {
    try {
      const { workspace_id, base_ref, target_ref } = call.request || {};
      const diff = await workspaceStore.computeWorkspaceDiff(workspace_id, base_ref, target_ref);
      callback(null, {
        diff_text: diff.patch || 'no diff',
        files_changed: diff.filesChanged?.length || 0
      });
    } catch (err) {
      callback(null, { diff_text: '', files_changed: 0 });
    }
  }
};
`
};
