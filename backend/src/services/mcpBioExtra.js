const cp = require('child_process');
const genosCli = require('./genosCli');

function runGenosSync(cmdString) {
  const bin = genosCli.resolveGenosBin();
  const actualCmd = cmdString.startsWith('genos ')
    ? `"${bin}" ${cmdString.slice(6)}`
    : cmdString;
  return cp.execSync(actualCmd);
}

function handleBioCall(cmd) {
  try {
    const out = runGenosSync(cmd);
    return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
  } catch (e) {
    return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
  }
}

function executeBioExtra(toolName, args = {}) {
  if (!toolName.startsWith('genos_')) return null;

  if (toolName === 'genos_biomimicry_spore') {
    const action = args.action || 'create';
    const agentId = args.agent_id || 'griot-01';
    const sporeType = args.spore_type || 'bacterial';
    const params = [`--action ${action}`, `--agent-id ${agentId}`, `--spore-type ${sporeType}`];
    if (args.warm_and_wet !== undefined) params.push(`--warm-and-wet ${args.warm_and_wet}`);
    if (args.nutrients !== undefined) params.push(`--nutrients ${args.nutrients}`);
    return handleBioCall(`genos biomimicry spore ${params.join(' ')}`);
  }

  if (toolName === 'genos_biomimicry_bioluminescence') {
    const agentId = args.agent_id || 'griot-01';
    const color = args.color || 'green';
    const organelle = args.organelle || 'mitochondria';
    const eventType = args.event_type || 'TELEMETRY';
    const details = args.details || '';
    return handleBioCall(`genos biomimicry bioluminescence --agent-id ${agentId} --color ${color} --organelle "${organelle}" --event-type "${eventType}" --details "${details}"`);
  }

  if (toolName === 'genos_biomimicry_anti_collusion') {
    const agentId = args.agent_id || 'griot-01';
    const tokens = args.consumed_tokens || 600;
    const flag = args.physical_test_passed ? '--physical-test-passed' : '';
    return handleBioCall(`genos biomimicry anti-collusion --agent-id ${agentId} --consumed-tokens ${tokens} ${flag}`.trim());
  }

  if (toolName === 'genos_biomimicry_redundancy') {
    const exp = args.expected_tool || 'default_tool';
    const mut = args.mutated_tool || exp;
    const flag = args.fallback ? '--fallback' : '';
    return handleBioCall(`genos biomimicry redundancy --expected-tool "${exp}" --mutated-tool "${mut}" ${flag}`.trim());
  }

  if (toolName === 'genos_biomimicry_tissue') {
    const action = args.action || 'create';
    const name = args.name || 'Tissue_Collective';
    const params = [`--action ${action}`, `--name "${name}"`];
    if (args.role) params.push(`--role "${args.role}"`);
    if (args.stem_id) params.push(`--stem-id "${args.stem_id}"`);
    if (args.worker_id) params.push(`--worker-id "${args.worker_id}"`);
    if (args.task) params.push(`--task "${args.task}"`);
    return handleBioCall(`genos biomimicry tissue ${params.join(' ')}`);
  }

  if (toolName === 'genos_biomimicry_embryology') {
    const divisions = args.divisions || 2;
    const gradient = args.gradient || 1.0;
    return handleBioCall(`genos biomimicry embryology --divisions ${divisions} --gradient ${gradient}`);
  }

  if (toolName === 'genos_biomimicry_therapy') {
    const agentId = args.agent_id || 'griot-01';
    const therapy = args.therapy_type || 'targeted';
    return handleBioCall(`genos biomimicry therapy --agent-id ${agentId} --therapy-type "${therapy}"`);
  }

  const known = ['genos_quantitative_genetics', 'genos_coevolution', 'genos_lamarckian_mutation', 'genos_grns', 'genos_dna_methylation', 'genos_cell_division', 'genos_molecular_chaperone', 'genos_necrosis_ledger', 'genos_multisensory_integration', 'genos_thalamic_filtering', 'genos_social_trust', 'genos_routing_algorithm'];
  if (known.includes(toolName)) {
    return handleBioCall(`genos extra ${toolName} --agent-id ${args.agent_id || 'global'}`);
  }

  return null;
}

module.exports = { executeBioExtra };
