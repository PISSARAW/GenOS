const { runGenosSync } = require('../../genosCli');

function runSafeSync(commandLine, timeoutMs) {
  return runGenosSync(commandLine, typeof timeoutMs === 'number' ? { timeoutMs } : timeoutMs);
}

async function executeToolLogic(toolName, args, runLocal) {
  if (toolName === 'genos_agent_world_capsule') {
    return runLocal(`genos capsule create --snapshot ${args.snapshot_id}` + (args.seed ? ` --seed "${args.seed}"` : '') + (args.budget_steps ? ` --budget-steps ${args.budget_steps}` : ''));
  }
  if (toolName === 'genos_deterministic_sha256_rag') {
    if (args.action === 'ingest') return runLocal(`genos platform ingest "${args.document}"` + (args.index ? ` --index "${args.index}"` : ''));
    if (args.action === 'search') return runLocal(`genos platform search "${args.query}"` + (args.index ? ` --index "${args.index}"` : ''));
    return { configured: true, success: false, status: 'tool_error', transport: 'local', output: 'Invalid action for RAG.' };
  }
  if (toolName === 'genos_world_sandbox_execute') {
    return runLocal(`genos world run --provider directory --root .genos/world --world-id ${args.world_id} --command "${args.command}" --sandbox-backend ${args.backend}`);
  }
  if (toolName === 'genos_world_hardlink_create') {
    return runLocal(`genos world create --provider hardlink --root .genos/world --world-id ${args.world_id} --seed "${args.seed}"`);
  }
  if (toolName === 'genos_replay') {
    const snapshot = args.snapshot || args.snapshot_id;
    if (!snapshot) {
      return { configured: true, success: false, status: 'invalid_args', transport: 'local', error: 'Replay requires a snapshot reference.' };
    }
    return runLocal(`genos replay basic --snapshot "${snapshot}"`);
  }
  if (toolName === 'genos_biomimicry_sar_prime') {
    return runLocal(`genos biomimicry bio-feature --feature sar --action prime --param incident_id=${args.incident_id} --param severity=${args.severity || 1.0}`);
  }
  if (toolName === 'genos_advanced_budget_allocation') {
    let cmdParams = [`--param total_budget=${args.total_budget}`];
    if (args.entropy !== undefined) cmdParams.push(`--param entropy=${args.entropy}`);
    if (args.scenarios) args.scenarios.forEach(s => cmdParams.push(`--param scenario="${s}"`));
    return runLocal(`genos biomimicry bio-feature --feature bet-hedging --action allocate ${cmdParams.join(' ')}`);
  }
  if (toolName === 'genos_merge') return runLocal(`genos merge ${args.branch_id} --conditions "${args.conditions}"`);
  if (toolName === 'genos_export_audit') return runLocal(`genos audit ${args.snapshot_id} --output "${args.output || `audit_${args.snapshot_id}.log`}"`);
  if (toolName === 'genos_cost_accounting') return runLocal(`genos cost-accounting ${args.agent_id} ${args.timeframe ? `--timeframe ${args.timeframe}` : ''}`);
  if (toolName === 'genos_loop_detection_check') {
    const { history_file, exact_match = 3, stagnation = 5, similarity = 0.95 } = args;
    try {
      const out = runSafeSync(`genos loop-detection --history-file ${history_file} --exact-match ${exact_match} --stagnation ${stagnation} --similarity ${similarity}`, 30000);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_causality_fork') {
    const { boundary_id, new_boundary_id } = args;
    try {
      const out = runSafeSync(`genos causality fork --boundary-id ${boundary_id} --new-boundary-id ${new_boundary_id}`, 30000);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_causal_replay_experiment') {
    try {
      const out = runSafeSync(`genos experiment causal-replay ${args.input_file}`, 30000);
      const outputPath = require('../../mcpExecutor').resolveMcpOutputPath(args.output_file);
      require('fs').writeFileSync(outputPath, out);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: `Causal replay report written to ${outputPath}` };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_incident_experiment') {
    try {
      const out = runSafeSync(`genos experiment incident ${args.manifest}`, 30000);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_bug_investigation') {
    try {
      const out = runSafeSync(`genos experiment bug-investigation ${args.manifest}`, 30000);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_phenotype_measure_divergence') {
    const { trait_name, expected, observed, tolerance } = args;
    try {
      const out = runSafeSync(`genos phenotype measure-divergence --trait-name "${trait_name}" --expected ${expected} --observed ${observed} --tolerance ${tolerance}`, 30000);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_synaptic_stdp_update') {
    const strategyExecutionAdapter = require('../../strategyExecutionAdapter');
    const primitiveArgs = {
      sourceId: args.source_id || args.sourceId || args.causeId,
      targetId: args.target_id || args.targetId || args.effectId,
      preSpikeAt: args.pre_spike_at || args.preSpikeAt,
      postSpikeAt: args.post_spike_at || args.postSpikeAt,
      learningRate: args.learning_rate || args.learningRate || args.outcome_score,
      transmitterType: args.transmitter_type || args.transmitterType || args.trait,
      agentId: args.agent_id || args.agentId,
    };
    const res = await strategyExecutionAdapter.executePrimitive('stdp_update', primitiveArgs);
    const ok = res && res.success !== false;
    return { configured: true, success: ok, status: ok ? 'completed' : 'tool_error', transport: 'strategy_primitive', output: res };
  }
  if (toolName === 'genos_synaptic_prune_scale') {
    const threshold = Number(args.threshold ?? 0.1) * Number(args.scale ?? 1.0);
    const agentId = args.agent_id || args.agentId;
    const orgId = args.organization_id || args.organizationId;
    const projId = args.project_id || args.projectId;
    const db = await require('../../../db').getDatabase();
    let prunedCount = 0;
    if (db) {
      let sql = 'DELETE FROM memory_synapses WHERE (ABS(weight) < ? OR (c3_opsonization > 0.5 AND cd47_expression < 0.5))';
      const params = [threshold];
      if (agentId && agentId !== 'global' && agentId !== 'default-agent') {
        sql += ' AND (source_id IN (SELECT id FROM genome_decisions WHERE created_by = ?) OR target_id IN (SELECT id FROM genome_decisions WHERE created_by = ?))';
        params.push(agentId, agentId);
      }
      if (orgId) {
        sql += ' AND (organization_id = ? OR organization_id IS NULL)';
        params.push(orgId);
      }
      if (projId) {
        sql += ' AND (project_id = ? OR project_id IS NULL)';
        params.push(projId);
      }
      const res = await db.run(sql, ...params);
      prunedCount = res?.changes || 0;
      const doomed = await db.all(`
        SELECT g.id FROM genome_decisions g
        LEFT JOIN memory_synapses s ON g.id = s.source_id OR g.id = s.target_id
        WHERE g.synaptic_weight < 0.1
        GROUP BY g.id
        HAVING COUNT(s.source_id) = 0 AND COUNT(s.target_id) = 0
      `);
      let orphanedPruned = 0;
      if (doomed && doomed.length > 0) {
        const doomedIds = doomed.map(d => d.id);
        const placeholders = doomedIds.map(() => '?').join(',');
        const delRes = await db.run(`DELETE FROM genome_decisions WHERE id IN (${placeholders})`, ...doomedIds);
        orphanedPruned = delRes?.changes || doomedIds.length;
      }
    }
    return { configured: true, success: true, status: 'completed', transport: 'strategy_primitive', output: { success: true, prunedSynapses: prunedCount, orphanedDecisionsPruned: orphanedPruned, threshold, agent_id: agentId || 'global' } };
  }
  if (toolName === 'genos_trinity_deploy') {
    try {
      const out = runSafeSync(`genos trinity deploy --mission-id ${args.mission_id} --strategies "${args.strategies}"`, 30000);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_allele_frequency_analyzer') {
    try {
      const out = runSafeSync(`genos swarm allele-analyzer --swarm-id ${args.swarm_id}`, 30000);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_compliance_report') {
    try {
      const out = runSafeSync(`genos compliance generate --standard ${args.standard}`, 30000);
      const outputPath = require('../../mcpExecutor').resolveMcpOutputPath(args.output_file);
      require('fs').writeFileSync(outputPath, out);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: `Compliance report written to ${outputPath}` };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_strategy_adaptation') {
    try {
      const out = runSafeSync(`genos strategy adapt --agent-id ${args.agent_id} --constraint ${args.constraint} --target ${args.target_value}`, 30000);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_rebase_compute_plan') {
    const { graph_file, injection_step, injected_keys } = args;
    const keysArgs = injected_keys.map(k => `--injected-keys ${k}`).join(' ');
    try {
      const out = runSafeSync(`genos rebase compute-plan --graph-file ${graph_file} --injection-step ${injection_step} ${keysArgs}`, 30000);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_guardrails_verify') {
    const { iteration, tokens, elapsed, uncertainty } = args;
    try {
      const out = runSafeSync(`genos guardrails verify --iteration ${iteration} --tokens ${tokens} --elapsed ${elapsed} --uncertainty ${uncertainty}`, 30000);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_resilience_apoptosis') {
    try {
      const out = runSafeSync(`genos resilience apoptosis --agent-id ${args.agent_id}`, 30000);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_parasitic_pressure') {
    try {
      const out = runSafeSync(`genos eval parasitic-pressure ${args.manifest}`, 30000);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_bisect_agent') {
    try {
      const out = runSafeSync(`genos dev bisect-agent --agent-id ${args.agent_id} --predicate "${args.predicate}"`, 30000);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_biomimicry_hippocampal_consolidate') {
    const episodicMemoryService = require('../../episodicMemoryService');
    try {
      const score = Number.isFinite(Number(args.success_score)) ? Number(args.success_score) : 1.0;
      let consolidationResult = null;
      try {
        consolidationResult = await episodicMemoryService.consolidateEpisodes({
          agentId: args.agent_id, sessionId: args.session_id,
          scoreThreshold: score >= 0.7 ? score : 0.7, purgeBelowThreshold: args.purge_failed !== false
        });
      } catch (err) {}
      const episodesCount = consolidationResult?.totalProcessed || 1;
      const steps = (args.dag_step || []).map(s => `--param dag_step=${s}`).join(' ');
      const out = runSafeSync(`genos biomimicry bio-feature --feature hippocampal --action consolidate --param agent_id=${args.agent_id} --param success_score=${score} --param episodes_count=${episodesCount} ${steps}`, 30000);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString(), consolidation: consolidationResult };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_hypothesis_evidence') {
    try {
      let cmd = `genos dev hypothesis-evidence ${args.diagnosis_id} ${args.hypothesis_id} --claim "${args.claim}" --source "${args.source}" --confidence ${args.confidence}`;
      if (args.artifact) cmd += ` --artifact "${args.artifact}"`;
      if (args.against) cmd += ` --against`;
      const out = runSafeSync(cmd, 30000);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_biomimicry_skill_proceduralize') {
    try {
      let cmdParams = [`--param skill=${args.skill}`];
      if (args.successes !== undefined) cmdParams.push(`--param successes=${args.successes}`);
      if (args.failures !== undefined) cmdParams.push(`--param failures=${args.failures}`);
      if (args.variance !== undefined) cmdParams.push(`--param variance=${args.variance}`);
      if (args.failure_rate !== undefined) cmdParams.push(`--param failure_rate=${args.failure_rate}`);
      if (args.steps) args.steps.forEach(s => cmdParams.push(`--param step=${s}`));
      if (args.preconditions) args.preconditions.forEach(p => cmdParams.push(`--param precondition=${p}`));
      const cmd = `genos biomimicry bio-feature --feature proceduralization --action ${args.action} ${cmdParams.join(' ')}`;
      const out = runSafeSync(cmd, 30000);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  if (toolName === 'genos_biomimicry_gate_evaluate') {
    try {
      let invariantVerified = true;
      let verdict = 'PERMITTED';
      if (args.facts && Array.isArray(args.facts)) {
        for (const fact of args.facts) {
          const factStr = String(fact).toLowerCase();
          if (factStr.includes('error') || factStr.includes('failed') || factStr.includes('violation')) {
            invariantVerified = false;
            verdict = 'DENIED';
            break;
          }
        }
      }
      let cmdParams = [`--param phase=${args.phase}`];
      if (args.facts) args.facts.forEach(f => cmdParams.push(`"${f}"`));
      return { configured: true, success: invariantVerified, status: invariantVerified ? 'completed' : 'tool_error', transport: 'local', output: JSON.stringify({ success: true, feature: "gate", action: "evaluate", params: cmdParams, invariant_verified: invariantVerified, verdict: verdict }) };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }
  const bioResult = await require('../../mcpBioTools').executeBioTool(toolName, args, { timeoutMs: 30000 });
  if (bioResult) return bioResult;
  const stratResult = await require('../../mcpStrategyTools').executeStrategyTool(toolName, args, { timeoutMs: 30000 });
  if (stratResult) return stratResult;
  const transport = require('../../mcpExecutor').configuredTransport();
  if (transport?.type === 'invalid') return { configured: false, success: false, status: 'invalid_config', error: transport.error };
  if (!transport) return { configured: false, success: false, status: 'unavailable', error: 'No MCP transport configured. Set GENOS_MCP_URL or GENOS_MCP_COMMAND.' };
  const result = transport.type === 'http'
    ? await require('./http').callHttpFn(transport.url, toolName, { args, timeoutMs: 30000 })
    : await require('./stdio').callStdioFn(transport, toolName, { args, timeoutMs: 30000 });
  const isError = result.isError === true;
  return { configured: true, success: !isError, status: isError ? 'tool_error' : 'completed', transport: transport.type, output: result.structuredContent ?? result.content ?? result };
}

module.exports = { executeToolLogic };
