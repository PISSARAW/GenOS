const { spawn } = require('child_process');
const path = require('path');
const child = spawn('node', [
    'backend/bin/genos-orchestrate.cjs', 
    JSON.stringify({
        action: 'orchestrate',
        orchestratorId: 'griot_orchestrator',
        mission: 'Liste tout ce que tu as fait aujourd hui',
        allowed_commands: [],
        allow_file_edits: false
    })
], { 
    encoding: 'utf8',
    env: { ...process.env, GENOS_AGENT_EXECUTOR: path.resolve(__dirname, 'backend/bin/local-codex-runtime.cjs') }
});
child.stdout.on('data', d => process.stdout.write(d.toString()));
child.stderr.on('data', d => process.stderr.write(d.toString()));
