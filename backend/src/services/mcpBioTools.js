const cp = require('child_process');

function executeBioTool(toolName, args) {
  if (toolName === 'genos_active_sensing') {
    try {
      let cmdParams = [`--param focus="${args.focus}"`, `--param ambiguity=${args.ambiguity}`];
      const cmd = `genos bio-feature active_sensing emit ${cmdParams.join(' ')}`;
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
      const cmd = `genos bio-feature checkpoint gate ${cmdParams.join(' ')}`;
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
      const cmd = `genos bio-feature allostatic plan ${cmdParams.join(' ')}`;
      const out = cp.execSync(cmd);
      return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
    } catch (e) {
      return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.stdout ? e.stdout.toString() : e.message };
    }
  }

  return null;
}

module.exports = { executeBioTool };
