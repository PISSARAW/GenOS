const cp = require('child_process');

function executeBioTool(toolName, args) {
  if (toolName === 'genos_active_sensing') {
    try {
      let cmdParams = [`--param focus="${args.focus}"`, `--param ambiguity=${args.ambiguity}`];
      const cmd = `genos biomimicry bio-feature --feature active_sensing --action emit ${cmdParams.join(' ')}`;
      const out = cp.execSync(cmd);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_checkpoint_gate') {
    try {
      let cmdParams = [];
      if (args.signal) {
        cmdParams.push(`--param action=signal`, `--param choice="${args.signal}"`);
      } else {
        cmdParams.push(`--param action=freeze`, `--param ambiguity="${args.ambiguity}"`, `--param opt_a="${args.option_a}"`, `--param opt_b="${args.option_b}"`);
      }
      const cmd = `genos biomimicry bio-feature --feature checkpoint --action gate ${cmdParams.join(' ')}`;
      const out = cp.execSync(cmd);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_allostatic_planning') {
    try {
      let cmdParams = [];
      if (args.action === 'predict') {
        cmdParams.push(`--param action=predict`, `--param plan_action="${args.plan_action}"`, `--param expected="${args.expected}"`, `--param cost=${args.cost}`);
      } else {
        cmdParams.push(`--param action=evaluate`, `--param score=${args.score}`);
      }
      const cmd = `genos biomimicry bio-feature --feature allostatic --action plan ${cmdParams.join(' ')}`;
      const out = cp.execSync(cmd);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_biomimicry_neuromodulation_rpe') {
    try {
      let cmdParams = [`--param node_id="${args.node_id}"`, `--param expected_reward="${args.expected_reward}"`, `--param actual_reward="${args.actual_reward}"`];
      const cmd = `genos biomimicry bio-feature --feature neuromodulation --action rpe ${cmdParams.join(' ')}`;
      const out = cp.execSync(cmd);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_biomimicry_endocrine_modulate') {
    try {
      let cmdParams = [`--param endocrine_action="${args.endocrine_action}"`];
      if (args.swarm_id) cmdParams.push(`--param swarm_id="${args.swarm_id}"`);
      if (args.endocrine_action === 'secrete') {
        cmdParams.push(`--param hormone="${args.hormone}"`, `--param amount="${args.amount}"`);
      } else if (args.endocrine_action === 'decay') {
        cmdParams.push(`--param decay_factor="${args.decay_factor}"`);
      }
      const cmd = `genos biomimicry bio-feature --feature endocrine --action modulate ${cmdParams.join(' ')}`;
      const out = cp.execSync(cmd);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_biomimicry_neoteny_quota') {
    try {
      let cmdParams = [`--param total_agents=${args.total_agents}`, `--param neotenic_agents=${args.neotenic_agents}`, `--param request="${args.request}"`];
      if (args.fraction !== undefined) cmdParams.push(`--param fraction=${args.fraction}`);
      const cmd = `genos biomimicry bio-feature --feature neoteny --action quota ${cmdParams.join(' ')}`;
      const out = cp.execSync(cmd);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_biomimicry_behavior_thanatosis') {
    try {
      let cmdParams = [`--param action="${args.action}"`, `--param agent_id="${args.agent_id}"`];
      if (args.threat_source) cmdParams.push(`--param threat_source="${args.threat_source}"`);
      const cmd = `genos biomimicry bio-feature --feature behavior --action thanatosis ${cmdParams.join(' ')}`;
      const out = cp.execSync(cmd);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_resilience_cryptobiosis') {
    try {
      const out = cp.execSync(`genos resilience cryptobiosis --agent-id ${args.agent_id}` + (args.duration ? ` --duration ${args.duration}` : ''));
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_biomimicry_cellular_bbb') {
    try {
      const out = cp.execSync(`genos biomimicry cellular-bbb --agent-id ${args.agent_id} --filter-level ${args.filter_level}`);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_ais_danger_telemetry') {
    try {
      const out = cp.execSync(`genos ais danger-telemetry --agent-id ${args.agent_id} --severity ${args.severity} --threat-context "${args.threat_context}"`);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_ais_clonal_hypermutate') {
    try {
      const out = cp.execSync(`genos ais clonal-hypermutate --agent-id ${args.agent_id} --mutation-rate ${args.mutation_rate} --clone-count ${args.clone_count}`);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  return null;
}

module.exports = { executeBioTool };
