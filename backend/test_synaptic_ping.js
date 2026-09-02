const { execSync } = require('child_process');

/**
 * Simulates a synaptic ping to the Griot agent via CLI.
 * @param {string} agentId - The ID of the agent to ping.
 * @returns {boolean} - True if ping is successful, false otherwise.
 */
function testSynapticPing(agentId) {
    if (!agentId) {
        console.error('Error: agentId is required for synaptic ping.');
        return false;
    }

    try {
        console.log(`[Synaptic Ping] Sending ping to agent ${agentId}...`);
        // Simulate the CLI command execution
        const command = `genos agent ping --id ${agentId}`;
        console.log(`[Synaptic Ping] Executing: ${command}`);
        
        // Use execSync to simulate the ping
        // For a real test without genos installed globally, we might mock this or expect it to fail gracefully if the command doesn't exist
        const result = execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
        
        console.log(`[Synaptic Ping] Response: ${result.trim()}`);
        console.log('[Synaptic Ping] Success.');
        return true;
    } catch (error) {
        console.error(`[Synaptic Ping] Failed to ping agent ${agentId}.`);
        console.error(`[Error]: ${error.message}`);
        if (error.stdout) console.log(`[Stdout]: ${error.stdout.toString()}`);
        if (error.stderr) console.error(`[Stderr]: ${error.stderr.toString()}`);
        return false;
    }
}

// Run the test if executed directly
if (require.main === module) {
    const griotId = process.argv[2] || 'griot-test-id';
    testSynapticPing(griotId);
}

module.exports = { testSynapticPing };
