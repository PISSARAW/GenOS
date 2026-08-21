import http from 'http';

export async function runPart2(api, apiRequest, assert, MILITARY_OVERRIDE_TOKEN, useToastStore) {
  // Section 9: Incidents, Alerts & Replay
  console.log('\n--- 9. Incidents, Global Alerts & Forensic Replay ---');
  try {
    const alerts = await api.getAlerts();
    assert(Array.isArray(alerts) && alerts.length > 0, `api.getAlerts() returned alerts array (count: ${alerts.length})`);

    const incidents = await api.getIncidents();
    assert(Array.isArray(incidents) && incidents.length > 0, `api.getIncidents() returned incidents log (count: ${incidents.length})`);

    const replayRes = await api.replayIncident({ incidentId: 'inc-001', stepSpeed: 50 });
    assert(replayRes.success === true || replayRes.totalSteps !== undefined, 'api.replayIncident() executed forensic replay trace');

    const killTaskRes = await api.killTask('alt-001');
    assert(killTaskRes.success === true, 'api.killTask() canceled task execution and marked resolved');
  } catch (err) {
    assert(false, 'Incidents & Alerts Section Exception', err.message);
  }

  // Section 10: Security Posture, Emergency Kill Switch & Halt
  console.log('\n--- 10. Security Posture & Emergency Kill Switch ---');
  try {
    const initialSec = await api.getSecurityStatus();
    assert(initialSec.securityPosture !== undefined, 'api.getSecurityStatus() returned security posture metrics');

    const triggerKill = await api.triggerKillSwitch('E2E Challenger Automated Safety Test');
    assert(triggerKill.success === true && (triggerKill.result?.isHalted === true || triggerKill.message !== undefined), 'api.triggerKillSwitch() successfully engaged emergency kill switch');

    const haltedSec = await api.getSecurityStatus();
    assert(haltedSec.securityPosture.isHalted === true, 'Security status confirms system is in HALTED state');

    const resetKill = await api.resetKillSwitch();
    assert(resetKill.success === true && (resetKill.result?.isHalted === false || resetKill.message !== undefined), 'api.resetKillSwitch() successfully disengaged kill switch and resumed runtime');

    const haltRes = await api.haltAll();
    assert(haltRes.success === true, 'api.haltAll() broadcasted global halt command');

    // Reset kill switch again so subsequent sections operate normally
    await api.resetKillSwitch();
  } catch (err) {
    assert(false, 'Security Section Exception', err.message);
  }

  // Section 11: Telemetry, Status, Dashboard & Achievements
  console.log('\n--- 11. Telemetry, Status, Dashboard & Achievements ---');
  try {
    const status = await api.getStatus();
    assert(status.status === 'online' || status.activeAgentsCount !== undefined, `api.getStatus() returned system runtime status (status: ${status.status}, activeAgents: ${status.activeAgentsCount})`);

    const health = await api.getHealth();
    assert(health.status === 'ok' || health.version !== undefined, `api.getHealth() confirmed database & service connectivity (version: ${health.version})`);

    const dashboard = await api.getDashboard();
    assert(dashboard.stats !== undefined && Array.isArray(dashboard.heatmap) && dashboard.heatmap.length === 364, 'api.getDashboard() returned complete stats & 364-day heatmap array');

    const achievements = await api.getAchievements();
    assert(Array.isArray(achievements) && achievements.length > 0, `api.getAchievements() returned agent achievements (count: ${achievements.length})`);

    const telemetryEvents = await api.getTelemetryEvents(20);
    assert(Array.isArray(telemetryEvents.events) && telemetryEvents.events.length > 0, `api.getTelemetryEvents(20) returned ${telemetryEvents.events.length} telemetry records`);
  } catch (err) {
    assert(false, 'Telemetry & Dashboard Section Exception', err.message);
  }

  // Section 12: Terminal & Command Palette
  console.log('\n--- 12. Terminal & Command Palette ---');
  try {
    const termHelp = await api.sendTerminalCommand('help');
    assert(termHelp.output && termHelp.output.toLowerCase().includes('commands'), 'api.sendTerminalCommand("help") returned command index');

    const termStatus = await api.sendTerminalCommand('status');
    assert(termStatus.output && termStatus.output.includes('SYSTEM OK'), 'api.sendTerminalCommand("status") confirmed operational state');

    const cmdRes = await api.sendCommand('inspect_state', { target: 'all' });
    assert(cmdRes.success === true, 'api.sendCommand("inspect_state") executed command action');
  } catch (err) {
    assert(false, 'Terminal Section Exception', err.message);
  }

  // Section 13: Experiments Lab & Wave Simulation
  console.log('\n--- 13. Experiments Lab & Wave Simulation ---');
  try {
    const experiments = await api.listExperiments();
    assert(Array.isArray(experiments) && experiments.length > 0, `api.listExperiments() returned ${experiments.length} experiments`);

    const launchExp = await api.launchExperiment({
      title: 'E2E Challenger Chaos Wave Experiment',
      type: 'scientific_experiment',
      chaosLevel: 50
    });
    assert(launchExp.success === true && launchExp.experimentId !== undefined, `api.launchExperiment() launched experiment ${launchExp.experimentId}`);

    const analysis = await api.getExperimentAnalysis();
    assert(analysis !== undefined && analysis.title !== undefined, 'api.getExperimentAnalysis() returned statistical telemetry analysis');

    const thoughts = await api.getExperimentThoughts();
    assert(Array.isArray(thoughts) && thoughts.length > 0, `api.getExperimentThoughts() returned cognitive thought stream (count: ${thoughts.length})`);

    const coevolution = await api.getExperimentCoevolution();
    assert(coevolution.redTeam !== undefined && coevolution.blueTeam !== undefined, 'api.getExperimentCoevolution() returned Red vs Blue arena state');

    const wavePoint = await api.getWavePoint();
    assert(typeof wavePoint.successRate === 'number' && typeof wavePoint.stressLevel === 'number', `api.getWavePoint() generated dynamic point (successRate: ${wavePoint.successRate}%, stressLevel: ${wavePoint.stressLevel})`);
  } catch (err) {
    assert(false, 'Experiments Section Exception', err.message);
  }

  // Section 14: 7 Innovation Engine Endpoints & Client Handlers
  console.log('\n--- 14. 7 Innovation Engine Endpoints & Client Handlers ---');
  try {
    // 14.1 Arena Multi-Solver Tournament & Pareto Frontier
    const arenaTourney = await api.getSolverTournament();
    assert(arenaTourney !== undefined, 'api.getSolverTournament() retrieved tournament records');
    
    // Direct Arena Endpoints (PROJECT.md contract)
    const directArenaTourney = await apiRequest('/api/arena/tournament');
    assert(directArenaTourney.tournamentId !== undefined && Array.isArray(directArenaTourney.leaderboard), `GET /api/arena/tournament returned active tournament (${directArenaTourney.tournamentId})`);

    const directArenaRun = await apiRequest('/api/arena/run', { method: 'POST', body: { problemSpec: { id: 'prob-refactor-01', title: 'Refactor AST Parser', difficulty: 1.2 }, solvers: ['mcts_solver', 'react_solver'], rounds: 3 } });
    assert(directArenaRun.topSolver !== undefined && Array.isArray(directArenaRun.leaderboard), `POST /api/arena/run completed tournament run (Top Solver: ${directArenaRun.topSolver?.solverName}, ELO: ${directArenaRun.topSolver?.eloRating})`);

    const paretoDirect = await apiRequest('/api/arena/pareto');
    assert(Array.isArray(paretoDirect.paretoFront), `GET /api/arena/pareto returned ${paretoDirect.paretoFront.length} Pareto optimal points`);

    const pareto = await api.getParetoFrontier('CodeRefactor');
    assert(pareto !== undefined, 'api.getParetoFrontier() computed Pareto points via wave-point');

    const crossPol = await api.crossPollinateHeuristics({ sourceSolver: 'Alpha', targetSolver: 'Beta', gene: 'AST-Pruning' });
    assert(crossPol.success === true, 'api.crossPollinateHeuristics() recorded gene crossover decision');

    // 14.2 MCP Sandbox & Dynamic JSON Schema
    const dryRunDirect = await apiRequest('/api/tools/dry-run', { method: 'POST', body: { toolName: 'genos_inspect', args: { path: 'src/main.tsx' } } });
    assert(dryRunDirect.dryRun === true && dryRunDirect.blastRadiusScore !== undefined, `POST /api/tools/dry-run executed VFS sandbox dry run simulation (Blast Radius: ${dryRunDirect.blastRadiusScore})`);

    const schemaRes = await apiRequest('/api/tools/genos_inspect/schema');
    assert(schemaRes.title === 'genos_inspect' && schemaRes.properties !== undefined, 'GET /api/tools/:name/schema returned dynamic JSON schema');

    const metricsRes = await apiRequest('/api/tools/metrics');
    assert(Array.isArray(metricsRes.tools) && metricsRes.count > 0, `GET /api/tools/metrics returned micro-telemetry metrics (${metricsRes.count} tools measured)`);

    const dryRun = await api.dryRunMcpTool('genos_inspect', { path: 'src/main.tsx' });
    assert(dryRun.success === true, 'api.dryRunMcpTool() executed VFS sandbox dry run');

    // 14.3 Swarm Entropy, Cognitive Drift & Topology
    const swarmMetrics = await apiRequest('/api/swarm/metrics');
    assert(swarmMetrics.normalizedEntropy !== undefined || swarmMetrics.rawEntropy !== undefined, `GET /api/swarm/metrics returned normalized entropy: ${swarmMetrics.normalizedEntropy}`);

    const swarmTopo = await apiRequest('/api/swarm/topology');
    assert(Array.isArray(swarmTopo.nodes) && Array.isArray(swarmTopo.edges), `GET /api/swarm/topology returned live graph with ${swarmTopo.nodes.length} nodes & ${swarmTopo.edges.length} edges`);

    const topo = await api.getSwarmTopology();
    assert(topo.nodes && topo.edges, 'api.getSwarmTopology() retrieved DAG topology');

    const entropy = await api.getEntropyMetrics('agent-orchestrator');
    assert(entropy !== undefined, 'api.getEntropyMetrics() retrieved cognitive drift metrics');

    // 14.4 Biology & Resilience (Apoptosis & Cryptobiosis)
    const apoptosisRes = await apiRequest('/api/resilience/apoptosis', { method: 'POST', body: { agentId: 'agent-solver-old', reason: 'Subtask completed' } });
    assert(apoptosisRes.reportId !== undefined && (apoptosisRes.apoptosisExecuted !== undefined || apoptosisRes.status === 'Apoptosis'), 'POST /api/resilience/apoptosis performed clean agent apoptosis autopsy');

    const freezeDirect = await apiRequest('/api/resilience/cryptobiosis/freeze', { method: 'POST', body: { reason: 'Emergency swarm hibernation' } });
    assert(freezeDirect.success === true && freezeDirect.snapshotId !== undefined, `POST /api/resilience/cryptobiosis/freeze serialized swarm into cryptobiotic state (${freezeDirect.snapshotId})`);

    const thawDirect = await apiRequest('/api/resilience/cryptobiosis/thaw', { method: 'POST', body: { snapshotId: freezeDirect.snapshotId } });
    assert(thawDirect.success === true, 'POST /api/resilience/cryptobiosis/thaw restored swarm state seamlessly');

    const freeze = await api.freezeCryptobiosis('ws-genos-core');
    assert(freeze.success === true, 'api.freezeCryptobiosis() serialized swarm state into .cryo snapshot');

    const resume = await api.resumeCryptobiosis('ws-genos-core', 1);
    assert(resume.success === true, 'api.resumeCryptobiosis() restored state from cryptobiotic hibernation');

    // 14.5 Genetics & Genome Crossover Synthesizer
    const phylogeny = await apiRequest('/api/genome/phylogeny');
    assert(Array.isArray(phylogeny.nodes) && phylogeny.nodes.length > 0, `GET /api/genome/phylogeny returned ${phylogeny.nodes.length} phylogenetic lineage branches`);

    const alleles = await apiRequest('/api/genome/alleles');
    assert(Array.isArray(alleles.geneFrequencyMatrix), `GET /api/genome/alleles returned ${alleles.geneFrequencyMatrix.length} genetic allele traits`);

    // Test genetic crossover with full genome objects
    const crossoverDirect = await apiRequest('/api/genome/crossover', {
      method: 'POST',
      body: {
        parentA: { name: 'Lead Architect', genes: { role: 'Lead Architect', strategy: 'MCTS Search', tools: ['genos_inspect', 'genos_create'], temp: 0.2, topP: 0.9 } },
        parentB: { name: 'Security Auditor', genes: { role: 'Security Auditor', strategy: 'Reflexion', tools: ['genos_adversarial_review', 'genos_diff'], temp: 0.1, topP: 0.8 } },
        options: { strategy: 'uniform', mutationRate: 0.05 }
      }
    });
    assert(crossoverDirect.childId !== undefined && crossoverDirect.childGenes !== undefined, `POST /api/genome/crossover synthesized hybrid child DNA (${crossoverDirect.childId})`);

    const phylo = await api.getPhylogeneticTree();
    assert(phylo.nodes !== undefined, 'api.getPhylogeneticTree() returned phylogenetic tree');

    const crossover = await api.synthesizeCrossover({ parentA: 'agent-1', parentB: 'agent-2', strategy: 'Two-Point', mutationRate: 8 });
    assert(crossover.status === 'synthesized' || crossover.success === true, 'api.synthesizeCrossover() synthesized new genetic combination');

    // 14.6 Memory Vector Search, Golden Path & Counterfactual Replay
    const vectorSearch = await apiRequest('/api/memory/search', { method: 'POST', body: { query: 'modular backend refactor', limit: 5 } });
    assert(Array.isArray(vectorSearch.allScoredExperiences), `POST /api/memory/search returned ${vectorSearch.allScoredExperiences.length} hybrid vector memory matches`);

    const goldenPath = await apiRequest('/api/memory/cherry-pick', { method: 'POST', body: { rawTurns: [] } });
    assert(goldenPath.goldenPathSteps !== undefined, `POST /api/memory/cherry-pick synthesized golden path trajectory (${goldenPath.prunedStepCount} pruned steps)`);

    const counterfactual = await apiRequest('/api/memory/counterfactual', { method: 'POST', body: { stepIndex: 2 } });
    assert(counterfactual.comparison !== undefined, 'POST /api/memory/counterfactual executed What-If simulation');

    const memResults = await api.searchMemoryVector('refactor');
    assert(Array.isArray(memResults), `api.searchMemoryVector() returned ${memResults.length} matching trajectories`);

    const cherryPick = await api.cherryPickGoldenPath({ trajectoryIds: ['traj-001'], label: 'Validated Golden Trajectory' });
    assert(cherryPick.success === true, 'api.cherryPickGoldenPath() compiled golden path decision');

    const counterfac = await api.reconstructCounterfactual({ incidentId: 'inc-001' });
    assert(counterfac.success === true, 'api.reconstructCounterfactual() performed counterfactual replay');

    // 14.7 Workspace Multi-branch Timeline Diff, Causal Bisection & Atomic Rollback
    const workspaceDiff = await apiRequest('/api/workspaces/diff?base=main&target=feature/modular-backend');
    assert(workspaceDiff.totalFilesChanged !== undefined && Array.isArray(workspaceDiff.diffEntries), `GET /api/workspaces/diff computed multi-branch timeline diff (${workspaceDiff.totalFilesChanged} files changed)`);

    const causalBisect = await apiRequest('/api/workspaces/bisect', { method: 'POST', body: { snapshots: [{ step: 1, hash: 'snap-001', healthy: true }, { step: 2, hash: 'snap-002', healthy: true }, { step: 3, hash: 'snap-003', healthy: false }] } });
    assert(causalBisect.culpritReport !== undefined && causalBisect.culpritReport.stepNumber === 3, `POST /api/workspaces/bisect executed O(log N) causal bisection (Culprit Step: ${causalBisect.culpritReport?.stepNumber})`);

    const atomicRollback = await apiRequest('/api/workspaces/rollback', { method: 'POST', body: { workspaceId: 'ws-genos-core', culpritReport: causalBisect.culpritReport } });
    assert(atomicRollback.success === true && atomicRollback.rolledBackCulpritStep !== undefined, `POST /api/workspaces/rollback completed atomic invariant rollback (Rolled back step #${atomicRollback.rolledBackCulpritStep})`);

    const bisection = await api.runCausalBisection('ws-genos-core', 'npm test');
    assert(bisection.workspaceId === 'ws-genos-core' && bisection.culpritSnapshot !== undefined, `api.runCausalBisection() calculated O(log N) bisection steps: ${bisection.bisectionSteps}`);

    const previewRoll = await api.previewAtomicRollback('ws-genos-core', 1);
    assert(previewRoll.workspaceId === 'ws-genos-core' && previewRoll.reversePatch !== undefined, 'api.previewAtomicRollback() generated reverse patch preview');

    const applyRoll = await api.applyAtomicRollback('ws-genos-core', 1);
    assert(applyRoll.success === true, 'api.applyAtomicRollback() completed atomic rollback to snapshot');

  } catch (err) {
    assert(false, 'Innovation Modules Section Exception', err.message);
  }

  // Section 15: Real-time SSE Telemetry Stream Verification
  console.log('\n--- 15. Real-time SSE Telemetry Stream Verification ---');
  await new Promise((resolve) => {
    const sseReq = http.request({
      hostname: 'localhost',
      port: 4000,
      path: '/api/telemetry',
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'X-CSRF-Token': 'csrf-e2e-challenger-2-token',
        'Authorization': `Bearer ${MILITARY_OVERRIDE_TOKEN}`
      }
    }, (res) => {
      assert(res.statusCode === 200, `GET /api/telemetry SSE connected with HTTP 200`);
      assert(res.headers['content-type']?.includes('text/event-stream'), `SSE Content-Type header confirmed: ${res.headers['content-type']}`);

      let receivedData = '';
      res.on('data', (chunk) => {
        receivedData += chunk.toString();
        if (receivedData.includes('data:')) {
          assert(true, `SSE Stream actively emitting live event frames: "${receivedData.trim().slice(0, 80)}..."`);
          res.destroy();
          resolve();
        }
      });

      setTimeout(async () => {
        try {
          await api.sendTerminalCommand('ping');
        } catch {}
      }, 200);

      setTimeout(() => {
        if (!receivedData.includes('data:')) {
          assert(false, 'SSE Stream timed out waiting for event chunk');
        }
        res.destroy();
        resolve();
      }, 2000);
    });

    sseReq.on('error', (err) => {
      assert(false, 'SSE Stream request failed', err.message);
      resolve();
    });
    sseReq.end();
  });

  // Section 16: UI Toast Notification & Error Resilience Harness
  console.log('\n--- 16. UI Toast Store & Error Resilience Harness ---');
  try {
    const toastStore = useToastStore.getState();
    assert(Array.isArray(toastStore.toasts) && toastStore.toasts.length === 0, 'Initial Toast Store is empty');

    // Test showToast for all 4 notification types
    toastStore.showToast('info', 'System Notice', 'All engines operational');
    toastStore.showToast('success', 'Deployment Successful', 'Agent worker-3 deployed to sandbox');
    toastStore.showToast('warning', 'High Memory Usage', 'Swarm memory consumption at 82%');
    toastStore.showToast('error', 'Execution Halted', 'Circuit breaker tripped on tool genos_destroy');

    const stateAfter4 = useToastStore.getState();
    assert(stateAfter4.toasts.length === 4, `Toast Store recorded 4 active notifications (actual: ${stateAfter4.toasts.length})`);
    assert(stateAfter4.toasts.some(t => t.type === 'error' && t.title === 'Execution Halted'), 'Error toast correctly structured in store');

    // Test Max 5 Toasts Queue Constraint
    toastStore.showToast('info', 'Overflow 1', 'Message 1');
    toastStore.showToast('info', 'Overflow 2', 'Message 2');
    const stateOverflow = useToastStore.getState();
    assert(stateOverflow.toasts.length === 5, `Toast Store strictly caps at max 5 active toasts (actual: ${stateOverflow.toasts.length})`);

    // Test Manual Toast Removal
    const firstToastId = stateOverflow.toasts[0].id;
    toastStore.removeToast(firstToastId);
    const stateAfterRemoval = useToastStore.getState();
    assert(stateAfterRemoval.toasts.length === 4 && !stateAfterRemoval.toasts.some(t => t.id === firstToastId), 'Manual removeToast(id) cleanly removes toast from store');

    // Test Error Handling and Toast Propagation on 4xx/5xx API Failures
    const simulatedErrorCases = [
      {
        name: '400 Bad Request',
        fn: () => apiRequest('/api/workspaces', { method: 'POST', body: {} }),
        expectedErrPattern: /400|required|invalid/i
      },
      {
        name: '401 Unauthorized',
        fn: () => apiRequest('/api/auth/verify-token', { method: 'POST', body: { token: 'INVALID-TOKEN-999' } }),
        expectedErrPattern: /401|Unauthorized|Invalid/i
      },
      {
        name: '403 Forbidden Origin',
        fn: () => apiRequest('/api/health', { headers: { Origin: 'http://malicious-attacker.com' } }),
        expectedErrPattern: /403|Forbidden|Blocked/i
      },
      {
        name: '404 Not Found',
        fn: () => apiRequest('/api/nonexistent-endpoint-xyz-999'),
        expectedErrPattern: /404|Not Found/i
      },
      {
        name: '503 Service Unavailable (Quarantined Tool)',
        fn: async () => {
          await api.toggleCircuitBreaker('genos_diff', true);
          try {
            await api.executeTool('genos_diff', {});
          } finally {
            await api.toggleCircuitBreaker('genos_diff', false);
          }
        },
        expectedErrPattern: /503|Circuit Breaker|quarantined|locked/i
      }
    ];

    for (const testCase of simulatedErrorCases) {
      let threw = false;
      try {
        await testCase.fn();
      } catch (err) {
        threw = true;
        assert(testCase.expectedErrPattern.test(err.message), `API Error Resilience: ${testCase.name} cleanly threw Error("${err.message}") without white-screen crash`);
        toastStore.showToast('error', testCase.name, err.message);
      }
      assert(threw, `Expected ${testCase.name} to throw error`);
    }

    const finalToastState = useToastStore.getState();
    assert(finalToastState.toasts.length > 0 && finalToastState.toasts.every(t => t.id && t.title && t.timestamp), 'All error toasts cleanly formatted and safely stored without corruption');

  } catch (err) {
    assert(false, 'UI Toast Store Section Exception', err.message);
  }

}
