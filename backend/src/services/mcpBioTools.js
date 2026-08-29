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

  if (toolName === 'genos_biomimicry_mycelium_route') {
    try {
      const out = cp.execSync(`genos biomimicry mycelium-route --agent-id ${args.agent_id} --target-path "${args.target_path}"`);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_biomimicry_cellular_endosymbiosis') {
    try {
      const out = cp.execSync(`genos biomimicry cellular-endosymbiosis --agent-id ${args.agent_id} --target-process "${args.target_process}" --organelle-name "${args.organelle_name}"`);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_biomimicry_stigmergy_deposit') {
    try {
      const out = cp.execSync(`genos biomimicry stigmergy-deposit --agent-id ${args.agent_id} --target-file "${args.target_file}" --pheromone-type "${args.pheromone_type}"`);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_biomimicry_theory_autopoiesis') {
    try {
      const out = cp.execSync(`genos biomimicry theory-autopoiesis --agent-id ${args.agent_id} --target-gene "${args.target_gene}" --new-value ${args.new_value}`);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_biomimicry_hypothalamus_homeostasis') {
    try {
      const out = cp.execSync(`genos biomimicry hypothalamus-homeostasis --agent-id ${args.agent_id} --nervous-state ${args.nervous_state}`);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_biomimicry_cerebellum_coprocessor') {
    try {
      const out = cp.execSync(`genos biomimicry cerebellum-coprocessor --agent-id ${args.agent_id} --target-value ${args.target_value} --expected-latency ${args.expected_latency} --current-value ${args.current_value} --actual-latency ${args.actual_latency}`);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_biomimicry_enteric_delegate') {
    try {
      const out = cp.execSync(`genos biomimicry enteric-delegate --agent-id ${args.agent_id} --data-source "${args.data_source}"` + (args.digestion_mode ? ` --digestion-mode ${args.digestion_mode}` : ''));
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_biomimicry_glial_cleanup') {
    try {
      const out = cp.execSync(`genos biomimicry glial-cleanup --agent-id ${args.agent_id}` + (args.intensity ? ` --intensity ${args.intensity}` : ''));
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_biomimicry_gene_regulatory_network') {
    try {
      const out = cp.execSync(`genos biomimicry gene-regulatory-network --agent-id ${args.agent_id} --condition "${args.condition}" --action-script "${args.action_script}"`);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_biomimicry_epigenetic_chromatin') {
    try {
      const out = cp.execSync(`genos biomimicry epigenetic-chromatin --agent-id ${args.agent_id} --locus "${args.locus}" --state ${args.state}`);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_biomimicry_speciation_check') {
    try {
      const out = cp.execSync(`genos biomimicry speciation-check --agent-id ${args.agent_id}` + (args.divergence_threshold ? ` --threshold ${args.divergence_threshold}` : ''));
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_evolution_assimilate_plasmid') {
    try {
      const out = cp.execSync(`genos evolution assimilate-plasmid --agent-id ${args.agent_id} --plasmid-id "${args.plasmid_id}"` + (args.source_agent ? ` --source ${args.source_agent}` : ''));
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_biomimicry_senescence_assess') {
    try {
      const out = cp.execSync(`genos biomimicry senescence-assess --agent-id ${args.agent_id} --context-age ${args.context_age}`);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_biomimicry_network_quorum') {
    try {
      const out = cp.execSync(`genos biomimicry network-quorum --agent-id ${args.agent_id} --threshold ${args.quorum_threshold} --action-id "${args.action_id}"`);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_biomimicry_flocking_explore') {
    try {
      const out = cp.execSync(`genos biomimicry flocking-explore --agent-id ${args.agent_id} --zone "${args.target_zone}"` + (args.alignment_strength ? ` --alignment ${args.alignment_strength}` : ''));
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_synaptic_prune_scale') {
    try {
      const out = cp.execSync(`genos synaptic prune-scale --agent-id ${args.agent_id} --scale ${args.scale}`);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_synaptic_path_evaluate') {
    try {
      const out = cp.execSync(`genos synaptic path-evaluate --agent-id ${args.agent_id} --pre-node "${args.pre_node}" --post-node "${args.post_node}"`);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_ais_prr_scan') {
    try {
      const patterns = args.patterns_detected ? args.patterns_detected.join(',') : '';
      const out = cp.execSync(`genos ais prr-scan --agent-id ${args.agent_id} --patterns "${patterns}"`);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_biomimicry_enzyme_catalyze') {
    try {
      const out = cp.execSync(`genos biomimicry enzyme-catalyze --enzyme "${args.enzyme_name}" --signature "${args.substrate_signature}" --payload "${args.payload}"`);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_biomimicry_colliculus_fusion') {
    try {
      const out = cp.execSync(`genos biomimicry colliculus-fusion --agent-id ${args.agent_id} --signals '${args.signals_json}'`);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_biomimicry_reflex_arc') {
    try {
      const out = cp.execSync(`genos biomimicry reflex-arc --agent-id ${args.agent_id} --stimulus "${args.stimulus_type}" --payload "${args.intensity_or_signal}"`);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_biomimicry_circadian_reset') {
    try {
      const out = cp.execSync(`genos biomimicry circadian-reset --agent-id ${args.agent_id} --signal "${args.zeitgeber_signal}"`);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  if (toolName === 'genos_biomimicry_telomere_fork') {
    try {
      const out = cp.execSync(`genos biomimicry telomere-fork --agent-id ${args.agent_id}` + (args.force_telomerase ? ` --force-telomerase` : ''));
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  
  if (toolName === 'genos_biomimicry_mycelium_network') {
    try {
      const out = cp.execSync(`genos biomimicry mycelium-network --action ${args.action}`);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.message };
    }
  }

  if (toolName === 'genos_biomimicry_proprioception') {
    try {
      const out = cp.execSync(`genos biomimicry proprioception --focus ${args.focus}`);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.message };
    }
  }

  if (toolName === 'genos_biomimicry_echolocation') {
    try {
      if (args.action === 'listen') {
        const path = require('path');
        const scriptPath = path.resolve(process.cwd(), 'examples/griot-daemon/griot_ear.py');
        // Spawn le script d'écoute en tant que processus détaché
        const child = cp.spawn('python', [scriptPath], { detached: true, stdio: 'ignore' });
        child.unref();
        return { configured: true, success: true, status: 'completed', transport: 'local', output: "Oreille de Griot activée. Mode écoute en arrière-plan (Autopoïèse complète)." };
      }

      // VRAI BINDING AUDIO LOCAL (Simulation d'appel PowerShell pour l'audio sur Windows)
      // En production, ce binding appellerait un processus natif ou une librairie C++
      const audioCmd = `powershell -c "[System.Console]::Beep(${args.freq || 440}, ${args.duration || 500})"`;
      cp.execSync(audioCmd);
      const out = cp.execSync(`genos biomimicry echolocation --freq ${args.freq}`);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.message };
    }
  }

  return require('./mcpBioExtra').executeBioExtra(toolName, args);
}

module.exports = { executeBioTool };


