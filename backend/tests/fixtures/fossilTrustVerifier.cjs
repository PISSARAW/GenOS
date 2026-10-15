const readline = require('readline');
const { verifyAttestation } = require('../../src/services/fossilizationService');

const input = readline.createInterface({ input: process.stdin });
input.on('line', (line) => {
  try {
    const { id, fossil } = JSON.parse(line);
    process.stdout.write(`${JSON.stringify({ id, verified: verifyAttestation(fossil) })}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ error: error.message })}\n`);
  }
});
